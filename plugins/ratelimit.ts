import { definePlugin, type H3Event } from "nitro";
import { HTTPError } from "nitro/h3";
import { getAggregateRateLimit } from "~/utils/github_token";

/** Fraction of total rate limit to reserve for high-priority requests. */
const LOW_PRIORITY_THRESHOLD = 0.25;

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("request", (event) => {
    // Skip internal/status routes
    const path = (event as H3Event).url.pathname;
    if (path === "/_status" || path === "/_thanks") {
      return;
    }

    const { remaining, limit, reset } = getAggregateRateLimit();

    // Priority-based early limiting: reject low-priority requests when quota is low
    if (limit > 0) {
      const priority = event.req.headers.get("x-priority");
      const usedPct = (limit - remaining) / limit;
      if (priority === "low" && usedPct >= 1 - LOW_PRIORITY_THRESHOLD) {
        const retryAfter = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60;
        throw new HTTPError({
          statusCode: 429,
          message: `Rate limit quota low — low-priority requests are temporarily throttled. Install the GitHub App to add more quota: https://github.com/apps/ungh-app`,
          headers: { "Retry-After": String(retryAfter) },
        });
      }
    }
  });

  nitroApp.hooks.hook("response", (_res, event) => {
    const path = (event as H3Event).url.pathname;
    if (path === "/_status" || path === "/_thanks") {
      return;
    }

    // Proxy aggregate rate limit info to clients
    const { remaining, limit, reset } = getAggregateRateLimit();
    if (limit > 0) {
      (event as H3Event).res.headers.set("x-ratelimit-remaining", String(remaining));
      (event as H3Event).res.headers.set("x-ratelimit-limit", String(limit));
      if (reset) {
        (event as H3Event).res.headers.set("x-ratelimit-reset", String(Math.floor(reset / 1000)));
      }
    }
  });
});
