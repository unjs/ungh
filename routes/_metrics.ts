import { defineRouteMeta, defineHandler } from "nitro";
import { ghTokens, ensureAllTokensValidated } from "~/utils/github_token";

defineRouteMeta({
  openAPI: {
    description:
      "Prometheus/OpenMetrics metrics endpoint for GitHub token rate limits.",
  },
});

export default defineHandler(async (event) => {
  await ensureAllTokensValidated();

  const now = Date.now();
  const lines: string[] = [];

  // Per-token metrics
  lines.push("# HELP ungh_token_valid Whether the token is valid (1=yes, 0=no).");
  lines.push("# TYPE ungh_token_valid gauge");
  lines.push("# HELP ungh_token_remaining Remaining API requests for this token.");
  lines.push("# TYPE ungh_token_remaining gauge");
  lines.push("# HELP ungh_token_limit Rate limit ceiling for this token.");
  lines.push("# TYPE ungh_token_limit gauge");
  lines.push("# HELP ungh_token_reset_seconds Seconds until rate limit resets for this token.");
  lines.push("# TYPE ungh_token_reset_seconds gauge");

  for (let i = 0; i < ghTokens.length; i++) {
    const t = ghTokens[i]!;
    const type = t._app ? "app" : "pat";
    const labels = `index="${i}",type="${type}"`;

    lines.push(`ungh_token_valid{${labels}} ${t.valid ? 1 : 0}`);
    lines.push(`ungh_token_remaining{${labels}} ${t.remaining ?? 0}`);
    lines.push(`ungh_token_limit{${labels}} ${t.limit ?? 0}`);

    const resetSeconds = t.reset && t.reset > now ? Math.ceil((t.reset - now) / 1000) : 0;
    lines.push(`ungh_token_reset_seconds{${labels}} ${resetSeconds}`);
  }

  // Aggregate metrics
  const validTokens = ghTokens.filter((t) => t.valid);
  const totalRemaining = validTokens.reduce((sum, t) => sum + (t.remaining ?? 0), 0);
  const totalLimit = validTokens.reduce((sum, t) => sum + (t.limit ?? 0), 0);

  lines.push("# HELP ungh_tokens_total Total number of registered tokens.");
  lines.push("# TYPE ungh_tokens_total gauge");
  lines.push(`ungh_tokens_total ${ghTokens.length}`);

  lines.push("# HELP ungh_tokens_valid_total Number of valid tokens.");
  lines.push("# TYPE ungh_tokens_valid_total gauge");
  lines.push(`ungh_tokens_valid_total ${validTokens.length}`);

  lines.push("# HELP ungh_rate_limit_remaining Total remaining API requests across all tokens.");
  lines.push("# TYPE ungh_rate_limit_remaining gauge");
  lines.push(`ungh_rate_limit_remaining ${totalRemaining}`);

  lines.push("# HELP ungh_rate_limit_limit Total rate limit ceiling across all tokens.");
  lines.push("# TYPE ungh_rate_limit_limit gauge");
  lines.push(`ungh_rate_limit_limit ${totalLimit}`);

  lines.push("");

  event.res.headers.set("content-type", "text/plain; version=0.0.4; charset=utf-8");
  return lines.join("\n");
});
