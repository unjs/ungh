import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ratelimitMiddleware from "~/middleware/ratelimit";
import { GHToken, ghTokens } from "~/utils/github_token";

function createEvent(path: string, headers: Record<string, string> = {}) {
  return {
    url: new URL(path, "https://ungh.cc"),
    req: { headers: new Headers(headers) },
    res: { headers: new Headers() },
  } as any;
}

describe("ratelimit middleware", () => {
  beforeEach(() => {
    // Seed a valid token with low remaining quota (10%) so throttling and headers are active
    const token = new GHToken("test-token");
    token.valid = true;
    token.remaining = 500;
    token.limit = 5000;
    token.reset = Date.now() + 60_000;
    ghTokens.push(token);
  });

  afterEach(() => {
    ghTokens.length = 0;
  });

  it("throttles low-priority requests on regular routes", async () => {
    const next = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createEvent("/repos/unjs/h3", { "x-priority": "low" });

    await expect(ratelimitMiddleware(event, next)).rejects.toMatchObject({ status: 429 });
    expect(next).not.toHaveBeenCalled();
  });

  it("sets rate limit headers on regular routes", async () => {
    const next = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createEvent("/repos/unjs/h3");

    await ratelimitMiddleware(event, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(event.res.headers.get("x-ratelimit-remaining")).toBe("500");
    expect(event.res.headers.get("x-ratelimit-limit")).toBe("5000");
  });

  it.each(["/_status", "/_metrics"])("skips internal underscore route %s", async (path) => {
    const next = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createEvent(path, { "x-priority": "low" });

    const res = await ratelimitMiddleware(event, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res).toBeDefined();
    expect(event.res.headers.has("x-ratelimit-remaining")).toBe(false);
    expect(event.res.headers.has("x-ratelimit-limit")).toBe(false);
  });
});
