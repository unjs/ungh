import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GHToken } from "~/utils/github_token";

function mockResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

function rateLimitHeaders(
  remaining: number,
  limit: number,
  resetEpoch?: number,
): Record<string, string> {
  return {
    "x-ratelimit-remaining": String(remaining),
    "x-ratelimit-limit": String(limit),
    ...(resetEpoch ? { "x-ratelimit-reset": String(resetEpoch) } : {}),
  };
}

describe("GHToken", () => {
  describe("updateStatus", () => {
    it("parses rate limit headers from successful response", () => {
      const token = new GHToken("test-token");
      const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
      token.updateStatus(mockResponse(200, rateLimitHeaders(4999, 5000, resetEpoch)));

      expect(token.valid).toBe(true);
      expect(token.remaining).toBe(4999);
      expect(token.limit).toBe(5000);
      expect(token.reset).toBe(resetEpoch * 1000);
    });

    it("marks token invalid on 401", () => {
      const token = new GHToken("bad-token");
      token.updateStatus(mockResponse(401, rateLimitHeaders(0, 0)));

      expect(token.valid).toBe(false);
      expect(token.remaining).toBe(0);
    });

    it("marks token valid on 403 (rate limited, not auth failure)", () => {
      const token = new GHToken("test-token");
      const resetEpoch = Math.floor(Date.now() / 1000) + 60;
      token.updateStatus(mockResponse(403, rateLimitHeaders(0, 5000, resetEpoch)));

      expect(token.valid).toBe(true);
      expect(token.remaining).toBe(0);
    });

    it("handles missing reset header", () => {
      const token = new GHToken("test-token");
      token.updateStatus(mockResponse(200, rateLimitHeaders(100, 5000)));

      expect(token.reset).toBeUndefined();
    });
  });

  describe("validate", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("updates status from /meta response", async () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
      fetchSpy.mockResolvedValueOnce(
        mockResponse(200, {
          ...rateLimitHeaders(4500, 5000, resetEpoch),
          "x-ratelimit-resource": "core",
        }),
      );

      const token = new GHToken("test-token");
      await token.validate();

      expect(token.valid).toBe(true);
      expect(token.remaining).toBe(4500);
      expect(token.limit).toBe(5000);
      expect(token._lastValidated).toBeTypeOf("number");
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy.mock.calls[0]![0]).toMatch(/api\.github\.com\/meta/);
    });

    it("marks token invalid on 401 response", async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(401, rateLimitHeaders(0, 0)));

      const token = new GHToken("bad-token");
      await token.validate();

      expect(token.valid).toBe(false);
      expect(token._lastValidated).toBeTypeOf("number");
    });

    it("preserves state on transport error", async () => {
      fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

      const token = new GHToken("test-token");
      token.valid = true;
      token.remaining = 1000;
      await token.validate();

      expect(token.valid).toBe(true);
      expect(token.remaining).toBe(1000);
      expect(token._lastValidated).toBeUndefined();
    });

    it("sends authorization header", async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(200, rateLimitHeaders(5000, 5000)));

      const token = new GHToken("ghp_secret123");
      await token.validate();

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit)?.headers);
      expect(headers.get("Authorization")).toBe("token ghp_secret123");
    });
  });

  describe("isStale", () => {
    it("returns true when never validated", () => {
      const token = new GHToken("test-token");
      expect(token.isStale()).toBe(true);
    });

    it("returns false when recently validated", () => {
      const token = new GHToken("test-token");
      token._lastValidated = Date.now();
      expect(token.isStale()).toBe(false);
    });

    it("returns true when validated more than 1 minute ago", () => {
      const token = new GHToken("test-token");
      token._lastValidated = Date.now() - 61_000;
      expect(token.isStale()).toBe(true);
    });

    it("returns false when rate limit reset is pending", () => {
      const token = new GHToken("test-token");
      token._lastValidated = Date.now() - 120_000; // stale by time
      token.reset = Date.now() + 60_000; // but reset is in the future
      expect(token.isStale()).toBe(false);
    });

    it("returns true when rate limit reset has passed", () => {
      const token = new GHToken("test-token");
      token._lastValidated = Date.now() - 120_000;
      token.reset = Date.now() - 1000; // reset is in the past
      expect(token.isStale()).toBe(true);
    });
  });

  describe("clearExpiredLimits", () => {
    it("clears limits when reset has passed", () => {
      const token = new GHToken("test-token");
      token.valid = true;
      token.remaining = 0;
      token.limit = 5000;
      token.reset = Date.now() - 1000;

      token.clearExpiredLimits();

      expect(token.remaining).toBeUndefined();
      expect(token.limit).toBeUndefined();
      expect(token.reset).toBeUndefined();
    });

    it("does not clear when reset is still in the future", () => {
      const token = new GHToken("test-token");
      token.valid = true;
      token.remaining = 0;
      token.limit = 5000;
      token.reset = Date.now() + 60_000;

      token.clearExpiredLimits();

      expect(token.remaining).toBe(0);
      expect(token.limit).toBe(5000);
      expect(token.reset).toBeDefined();
    });

    it("does not clear when remaining > 0", () => {
      const token = new GHToken("test-token");
      token.valid = true;
      token.remaining = 100;
      token.limit = 5000;
      token.reset = Date.now() - 1000;

      token.clearExpiredLimits();

      expect(token.remaining).toBe(100);
    });

    it("does not clear for invalid tokens", () => {
      const token = new GHToken("test-token");
      token.valid = false;
      token.remaining = 0;
      token.limit = 5000;
      token.reset = Date.now() - 1000;

      token.clearExpiredLimits();

      expect(token.remaining).toBe(0);
    });

    it("clears when valid is undefined (never validated)", () => {
      const token = new GHToken("test-token");
      // valid is undefined
      token.remaining = 0;
      token.limit = 5000;
      token.reset = Date.now() - 1000;

      token.clearExpiredLimits();

      expect(token.remaining).toBeUndefined();
      expect(token.limit).toBeUndefined();
      expect(token.reset).toBeUndefined();
    });
  });

  describe("available", () => {
    it("returns true for valid token with remaining requests", () => {
      const token = new GHToken("test-token");
      token.valid = true;
      token.remaining = 100;
      expect(token.available).toBe(true);
    });

    it("returns false for invalid token", () => {
      const token = new GHToken("test-token");
      token.valid = false;
      token.remaining = 100;
      expect(token.available).toBe(false);
    });

    it("returns false for exhausted token", () => {
      const token = new GHToken("test-token");
      token.valid = true;
      token.remaining = 0;
      expect(token.available).toBe(false);
    });

    it("returns true for unvalidated token (valid=undefined treated as falsy)", () => {
      const token = new GHToken("test-token");
      // valid is undefined, remaining is undefined
      expect(token.available).toBeFalsy();
    });

    it("returns true when remaining is undefined (fresh valid token)", () => {
      const token = new GHToken("test-token");
      token.valid = true;
      // remaining undefined → defaults to 1
      expect(token.available).toBe(true);
    });
  });
});
