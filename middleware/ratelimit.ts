import { defineMiddleware } from "nitro/h3";
import { HTTPError } from "nitro/h3";
import { getAggregateRateLimit, retryAfterSeconds } from "~/utils/github_token";

/** Fraction of total rate limit to reserve for high-priority requests. */
const LOW_PRIORITY_THRESHOLD = 0.25;

export default defineMiddleware(async (event, next) => {
  if (event.url.pathname.startsWith("_")) {
    return next();
  }

  // Priority-based early limiting: reject low-priority requests when quota is low
  const { remaining, limit, reset } = getAggregateRateLimit();
  if (limit > 0) {
    const priority = event.req.headers.get("x-priority");
    const usedPct = (limit - remaining) / limit;
    if (priority === "low" && usedPct >= 1 - LOW_PRIORITY_THRESHOLD) {
      const retryAfter = retryAfterSeconds(reset);
      throw new HTTPError({
        statusCode: 429,
        message: `Rate limit quota low — low-priority requests are temporarily throttled. Install the GitHub App to add more quota: https://github.com/apps/ungh-app`,
        headers: { "Retry-After": String(retryAfter) },
      });
    }
  }

  const res = await next();

  // Proxy aggregate rate limit info to clients
  const postLimits = getAggregateRateLimit();
  if (postLimits.limit > 0) {
    event.res.headers.set("x-ratelimit-remaining", String(postLimits.remaining));
    event.res.headers.set("x-ratelimit-limit", String(postLimits.limit));
    if (postLimits.reset) {
      event.res.headers.set("x-ratelimit-reset", String(Math.floor(postLimits.reset / 1000)));
    }
  }

  return res;
});
