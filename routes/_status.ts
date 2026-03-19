import { defineRouteMeta, defineHandler } from "nitro";
import { html } from "nitro/h3";
import { ghTokens, ensureAllTokensValidated, formatDuration } from "~/utils/github";

defineRouteMeta({
  openAPI: {
    description: "Service status page with GitHub token rate limit info.",
  },
});

export default defineHandler(async () => {
  await ensureAllTokensValidated();

  const tokens = ghTokens.map((t, i) => {
    const remaining = t.remaining ?? 0;
    const limit = t.limit ?? 0;
    return {
      index: i,
      valid: t.valid ?? false,
      used: computeUsed(remaining, limit),
      limit,
      reset: t.reset ? formatDuration(t.reset - Date.now()) : undefined,
    };
  });

  const totalUsed = tokens.reduce((sum, t) => sum + t.used, 0);
  const totalLimit = tokens.reduce((sum, t) => sum + t.limit, 0);
  const totalUsedPct = computeUsedPct(totalLimit - totalUsed, totalLimit);

  const tokenRows = tokens
    .map((t) => {
      const usedPct = computeUsedPct(t.limit - t.used, t.limit);
      const colorClass = !t.valid ? "gray" : usedColorClass(usedPct);
      const label = !t.valid
        ? "invalid"
        : `${t.used.toLocaleString()}/${t.limit.toLocaleString()} used · ${Math.round(usedPct)}%`;
      const resetInfo = t.reset ? ` · resets in ${t.reset}` : "";
      const exhausted = t.valid && t.used >= t.limit && t.limit > 0;
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
          <div class="bar-fill ${colorClass}" style="width:${!t.valid ? 0 : usedPct}%"></div>
        </div>
      </div>`;
    })
    .join("");

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
        <span class="meta">${totalUsed.toLocaleString()}/${totalLimit.toLocaleString()} used (${Math.round(totalUsedPct)}%) · ${tokens.filter((t) => t.valid).length}/${tokens.length} valid</span>
      </div>
      <div class="bar-track bar-lg">
        <div class="bar-fill ${usedColorClass(totalUsedPct)}" style="width:${totalUsedPct}%"></div>
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

function computeUsed(remaining: number, limit: number): number {
  return Math.max(0, limit - remaining);
}

function computeUsedPct(remaining: number, limit: number): number {
  if (limit <= 0) return 0;
  const used = Math.max(0, limit - remaining);
  return Math.min(100, (used / limit) * 100);
}

function usedColorClass(usedPct: number): "green" | "yellow" | "red" {
  return usedPct < 50 ? "green" : usedPct < 80 ? "yellow" : "red";
}
