import { defineRouteMeta, defineHandler } from "nitro";
import { html } from "nitro/h3";
import { ghTokens, ensureAllTokensValidated, formatDuration } from "~/utils/github_token";

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

  const nextResetMs = ghTokens.reduce((soonest, t) => {
    if (t.reset && t.reset > Date.now()) {
      return soonest === 0 ? t.reset : Math.min(soonest, t.reset);
    }
    return soonest;
  }, 0);
  const refreshSeconds =
    nextResetMs > 0 ? Math.max(1, Math.ceil((nextResetMs - Date.now()) / 1000)) : 0;

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
      const timerOverlay = exhausted
        ? `<div class="timer-overlay"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${t.reset ? t.reset : ""}</div>`
        : "";
      return `
      <div class="token-cell${exhausted ? " exhausted" : ""}">
        <div class="token-name">Token #${t.index + 1}${statusLabel}</div>
        <div class="bar-track bar-sm">
          <div class="bar-fill ${colorClass}" style="width:${!t.valid ? 0 : usedPct}%"></div>
        </div>
        <div class="token-meta">${label}${resetInfo}</div>
        ${timerOverlay}
      </div>`;
    })
    .join("");

  return html(/* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ungh status</title>${refreshSeconds > 0 ? `\n  <meta http-equiv="refresh" content="${refreshSeconds}">` : ""}
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { padding: 48px 24px; background: #0a0a0a; color: #fafafa; font-family: -apple-system, system-ui, sans-serif; min-height: 100vh; }
    .container { max-width: 768px; margin: 0 auto; }
    h1 { font-size: 20px; font-weight: 500; letter-spacing: -0.02em; }
    h2 { font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 16px; }
    .subtitle { color: #666; font-size: 14px; margin-top: 4px; margin-bottom: 40px; }
    .card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; margin-bottom: 16px; overflow: hidden; }
    .card svg { max-width: 100%; height: auto; display: block; }
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
    .token-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .token-cell { background: #1a1a1a; border: 1px solid #1e1e1e; border-radius: 8px; padding: 12px; position: relative; overflow: hidden; }
    .token-cell.exhausted .bar-fill { background: #333; }
    .token-cell.exhausted::after { content: ''; position: absolute; inset: 0; background: rgba(30,30,30,0.7); border-radius: 8px; }
    .token-cell.exhausted .timer-overlay { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #888; font-size: 12px; font-variant-numeric: tabular-nums; gap: 4px; }
    .token-cell.exhausted .timer-overlay svg { opacity: 0.6; }
    .token-name { color: #ccc; font-size: 13px; font-variant-numeric: tabular-nums; margin-bottom: 8px; }
    .token-meta { color: #666; font-size: 11px; font-variant-numeric: tabular-nums; margin-top: 8px; }
    .status { font-size: 11px; font-weight: 500; padding: 1px 6px; border-radius: 4px; }
    .status-valid { background: #22c55e18; color: #22c55e; }
    .status-exhausted { background: #ef444418; color: #ef4444; }
    .status-invalid { background: #88888818; color: #888; }
    .btn { display: inline-block; margin-top: 16px; padding: 6px 14px; background: #22c55e; color: #0a0a0a; font-size: 12px; font-weight: 600; border-radius: 6px; text-decoration: none; transition: opacity .2s; }
    .btn:hover { opacity: 0.85; }
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
      <div class="token-grid">${tokenRows}</div>
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
