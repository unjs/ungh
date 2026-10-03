import { describe, it, expect, vi } from "vitest";
import ratelimitMiddleware from "~/middleware/ratelimit";

describe("ratelimit middleware", () => {
  it("skips internal underscore routes without setting rate limit headers", async () => {
    const next = vi.fn().mockResolvedValue(new Response("ok"));
    const event = {
      url: new URL("https://ungh.cc/_metrics"),
      req: { headers: new Headers() },
      res: { headers: new Headers() },
    } as any;

    const res = await ratelimitMiddleware(event, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res).toBeDefined();
    expect(event.res.headers.has("x-ratelimit-remaining")).toBe(false);
    expect(event.res.headers.has("x-ratelimit-limit")).toBe(false);
  });

  it("skips /_status route", async () => {
    const next = vi.fn().mockResolvedValue(new Response("ok"));
    const event = {
      url: new URL("https://ungh.cc/_status"),
      req: { headers: new Headers() },
      res: { headers: new Headers() },
    } as any;

    await ratelimitMiddleware(event, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(event.res.headers.has("x-ratelimit-remaining")).toBe(false);
  });
});
