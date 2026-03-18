import { defineRouteMeta, defineHandler } from "nitro";
import { html } from "nitro/h3";
import {
  ghTokens,
  ensureTokensValidated,
  formatDuration,
} from "~/utils/github";

defineRouteMeta({
  openAPI: {
    description: "Service status page with GitHub token rate limit info.",
  },
});

export default defineHandler(async (event) => {
  await ensureTokensValidated();

  const tokens = ghTokens.map((t, i) => ({
    index: i,
    valid: t.valid ?? false,
    remaining: t.remaining ?? 0,
    limit: t.limit ?? 0,
    reset: t.reset ? formatDuration(t.reset - Date.now()) : undefined,
  }));

  const totalRemaining = tokens.reduce((sum, t) => sum + t.remaining, 0);
  const totalLimit = tokens.reduce((sum, t) => sum + t.limit, 0);
  const totalPct =
    totalLimit > 0 ? Math.round((totalRemaining / totalLimit) * 100) : 0;

  const tokenRows = tokens
    .map((t) => {
      const pct = t.limit > 0 ? Math.round((t.remaining / t.limit) * 100) : 0;
      const colorClass = !t.valid
        ? "gray"
        : pct > 50
          ? "green"
          : pct > 20
            ? "yellow"
            : "red";
      const exhausted = t.valid && t.remaining === 0 && t.limit > 0;
      const label = !t.valid
        ? "invalid"
        : `${t.remaining}/${t.limit} · ${pct}%`;
      const resetInfo = t.reset ? ` · resets in ${t.reset}` : "";
      const statusLabel = !t.valid
        ? ' <span class="status status-invalid">invalid</span>'
        : exhausted
          ? ' <span class="status status-exhausted">exhausted</span>'
          : ' <span class="status status-valid">ok</span>';
      return `
      <div class="token-row">
        <div class="token-header">
          <span class="token-name">Token #${t.index + 1}${statusLabel}</span>
          <span class="token-meta">${label}${resetInfo}</span>
        </div>
        <div class="bar-track bar-sm">
          <div class="bar-fill ${colorClass}" style="width:${!t.valid ? 0 : exhausted ? 100 : pct}%"></div>
        </div>
      </div>`;
    })
    .join("");

  const totalExhaustedPct = totalLimit > 0 ? 100 - totalPct : 0;

  return html(/* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ungh status</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { padding: 48px 24px; background: #0a0a0a; color: #fafafa; font-family: -apple-system, system-ui, sans-serif; min-height: 100vh; }
    .container { max-width: 540px; margin: 0 auto; }
    h1 { font-size: 20px; font-weight: 500; letter-spacing: -0.02em; }
    h2 { font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 16px; }
    .subtitle { color: #666; font-size: 14px; margin-top: 4px; margin-bottom: 40px; }
    .card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; margin-bottom: 16px; }
    .card-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
    .card-header .title { font-size: 14px; font-weight: 500; }
    .card-header .meta { font-size: 13px; color: #888; font-variant-numeric: tabular-nums; }
    .bar-track { background: #1e1e1e; border-radius: 4px; overflow: hidden; }
    .bar-track.bar-lg { height: 8px; display: flex; }
    .bar-track.bar-sm { height: 4px; }
    .bar-fill { height: 100%; transition: width .4s ease; }
    .bar-fill.green { background: #22c55e; }
    .bar-fill.yellow { background: #eab308; }
    .bar-fill.red { background: #ef4444; }
    .bar-fill.gray { background: #333; }
    .token-row { padding: 12px 0; border-bottom: 1px solid #1e1e1e; }
    .token-row:last-child { border-bottom: none; padding-bottom: 0; }
    .token-row:first-child { padding-top: 0; }
    .token-header { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; margin-bottom: 8px; }
    .token-name { color: #ccc; font-variant-numeric: tabular-nums; }
    .token-meta { color: #666; font-variant-numeric: tabular-nums; }
    .status { font-size: 11px; font-weight: 500; padding: 1px 6px; border-radius: 4px; }
    .status-valid { background: #22c55e18; color: #22c55e; }
    .status-exhausted { background: #ef444418; color: #ef4444; }
    .status-invalid { background: #88888818; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <h1>ungh status</h1>
    <p class="subtitle">GitHub API token rate limits</p>

    <div class="card">
      <div class="card-header">
        <span class="title">Overall</span>
        <span class="meta">${totalRemaining.toLocaleString()}/${totalLimit.toLocaleString()} (${totalPct}%) · ${tokens.filter((t) => t.valid).length}/${tokens.length} valid</span>
      </div>
      <div class="bar-track bar-lg">
        <div class="bar-fill green" style="width:${totalPct}%"></div>
        <div class="bar-fill gray" style="width:${totalExhaustedPct}%"></div>
      </div>
    </div>

    <div class="card">
      <h2>Tokens</h2>
      ${tokenRows}
    </div>
  </div>
</body>
</html>`);
});
