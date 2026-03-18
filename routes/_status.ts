import { defineRouteMeta, defineHandler } from "nitro";
import { html } from "nitro/h3";
import { ghTokens, validateGHTokens, formatDuration } from "~/utils/github";

defineRouteMeta({
  openAPI: {
    description: "Service status page with GitHub token rate limit info.",
  },
});

export default defineHandler(async (event) => {
  await validateGHTokens();

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
      const color = !t.valid
        ? "#888"
        : pct > 50
          ? "#22c55e"
          : pct > 20
            ? "#eab308"
            : "#ef4444";
      const label = !t.valid ? "invalid" : `${t.remaining}/${t.limit}`;
      const resetInfo = t.reset ? ` (resets in ${t.reset})` : "";
      return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px">
          <span>Token #${t.index + 1} ${!t.valid ? '<span style="color:#888">(invalid)</span>' : ""}</span>
          <span>${label}${resetInfo}</span>
        </div>
        <div style="background:#1e293b;border-radius:6px;height:20px;overflow:hidden">
          <div style="background:${color};height:100%;width:${t.valid ? pct : 0}%;transition:width .3s;border-radius:6px"></div>
        </div>
      </div>`;
    })
    .join("");

  const totalColor =
    totalPct > 50 ? "#22c55e" : totalPct > 20 ? "#eab308" : "#ef4444";

  return html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ungh status</title>
</head>
<body style="margin:0;padding:40px 20px;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;min-height:100vh">
  <div style="max-width:600px;margin:0 auto">
    <h1 style="font-size:24px;margin:0 0 8px">ungh status</h1>
    <p style="color:#94a3b8;margin:0 0 32px">GitHub API token rate limits</p>

    <div style="background:#1e293b;border-radius:12px;padding:24px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:16px;font-weight:600">Overall</span>
        <span style="font-size:16px">${totalRemaining}/${totalLimit} (${tokens.filter((t) => t.valid).length}/${tokens.length} tokens valid)</span>
      </div>
      <div style="background:#0f172a;border-radius:6px;height:24px;overflow:hidden">
        <div style="background:${totalColor};height:100%;width:${totalPct}%;transition:width .3s;border-radius:6px"></div>
      </div>
    </div>

    <div style="background:#1e293b;border-radius:12px;padding:24px">
      <h2 style="font-size:16px;margin:0 0 16px;font-weight:600">Tokens</h2>
      ${tokenRows}
    </div>
  </div>
</body>
</html>`);
});
