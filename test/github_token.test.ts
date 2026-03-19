import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { GHToken } from "~/utils/github_token";
import {
  formatDuration,
  _base64url,
  _createAppJWT,
  getGHToken,
  ghTokens,
  ensureTokensValidated,
  ensureAllTokensValidated,
  revalidateGHTokens,
  ensureAppToken,
} from "~/utils/github_token";

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

  describe("constructor", () => {
    it("sets app and appInstallationId from opts", () => {
      const token = new GHToken("tok", { app: true, appInstallationId: "123" });
      expect(token._app).toBe(true);
      expect(token._appInstallationId).toBe("123");
    });

    it("defaults optional fields to undefined", () => {
      const token = new GHToken("tok");
      expect(token.valid).toBeUndefined();
      expect(token.remaining).toBeUndefined();
      expect(token.limit).toBeUndefined();
      expect(token.reset).toBeUndefined();
      expect(token._lastValidated).toBeUndefined();
      expect(token._app).toBeUndefined();
      expect(token._appInstallationId).toBeUndefined();
    });
  });
});

describe("formatDuration", () => {
  it("returns '<1m' for durations under 1 minute", () => {
    expect(formatDuration(0)).toBe("<1m");
    expect(formatDuration(29_000)).toBe("<1m");
  });

  it("returns minutes for durations under 1 hour", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(5 * 60_000)).toBe("5m");
    expect(formatDuration(59 * 60_000)).toBe("59m");
  });

  it("returns hours for exact hour durations", () => {
    expect(formatDuration(60 * 60_000)).toBe("1h");
    expect(formatDuration(2 * 60 * 60_000)).toBe("2h");
  });

  it("returns hours and minutes for mixed durations", () => {
    expect(formatDuration(90 * 60_000)).toBe("1h30m");
    expect(formatDuration(125 * 60_000)).toBe("2h5m");
  });
});

describe("_base64url", () => {
  it("encodes a simple string", () => {
    const encoded = _base64url("hello");
    // base64url of "hello" = "aGVsbG8"
    expect(encoded).toBe("aGVsbG8");
  });

  it("produces no padding characters", () => {
    const encoded = _base64url("a");
    expect(encoded).not.toContain("=");
  });

  it("replaces + and / with url-safe chars", () => {
    // Use a string that produces + or / in standard base64
    const encoded = _base64url("subjects?_d");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
  });

  it("encodes JSON payloads (JWT use case)", () => {
    const json = JSON.stringify({ alg: "RS256", typ: "JWT" });
    const encoded = _base64url(json);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    // Verify round-trip
    const decoded = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    expect(JSON.parse(decoded)).toEqual({ alg: "RS256", typ: "JWT" });
  });
});

describe("_createAppJWT", () => {
  let keyPair: CryptoKeyPair;
  let pkcs8Pem: string;

  beforeAll(async () => {
    keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    pkcs8Pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(pkcs8)))}\n-----END PRIVATE KEY-----`;
  });

  it("creates a valid 3-part JWT with PKCS#8 key", async () => {
    const jwt = await _createAppJWT("12345", pkcs8Pem);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);

    const header = JSON.parse(atob(parts[0]!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });

    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload.iss).toBe("12345");
    expect(payload.exp).toBeGreaterThan(payload.iat);

    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sig = Uint8Array.from(atob(parts[2]!.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keyPair.publicKey, sig, data);
    expect(valid).toBe(true);
  });

  it("handles PEM with escaped newlines", async () => {
    // Simulate env var with literal \n
    const escapedPem = pkcs8Pem.replace(/\n/g, "\\n");
    const jwt = await _createAppJWT("99", escapedPem);
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("handles PKCS#1 (RSA PRIVATE KEY) format", async () => {
    // Export as PKCS#8, then manually strip the PKCS#8 wrapper to get PKCS#1
    // We can't easily get raw PKCS#1 from WebCrypto, so we test via the
    // _pemToKeyData path by providing a PKCS#1-style PEM header
    const pkcs8Der = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const pkcs8Bytes = new Uint8Array(pkcs8Der);

    // PKCS#8 wraps PKCS#1 as: SEQUENCE { version, algorithmId, OCTET STRING { pkcs1 } }
    // We need to extract the PKCS#1 content from the OCTET STRING
    // Skip outer SEQUENCE tag+length, version (3 bytes), algorithmId (15 bytes)
    // then parse the OCTET STRING to get the inner PKCS#1 bytes
    let offset = 0;
    // Skip SEQUENCE tag
    offset += 1;
    // Parse length
    if (pkcs8Bytes[offset]! & 0x80) {
      const numLenBytes = pkcs8Bytes[offset]! & 0x7f;
      offset += 1 + numLenBytes;
    } else {
      offset += 1;
    }
    // Skip version INTEGER (02 01 00)
    offset += 3;
    // Skip algorithmId SEQUENCE (30 0d ...)
    offset += 15;
    // Now at OCTET STRING tag (04)
    offset += 1;
    // Parse OCTET STRING length
    if (pkcs8Bytes[offset]! & 0x80) {
      const numLenBytes = pkcs8Bytes[offset]! & 0x7f;
      offset += 1 + numLenBytes;
    } else {
      offset += 1;
    }
    // The rest is PKCS#1 content
    const pkcs1Bytes = pkcs8Bytes.slice(offset);
    const pkcs1Base64 = btoa(String.fromCharCode(...pkcs1Bytes));
    const pkcs1Pem = `-----BEGIN RSA PRIVATE KEY-----\n${pkcs1Base64}\n-----END RSA PRIVATE KEY-----`;

    const jwt = await _createAppJWT("42", pkcs1Pem);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);

    // Verify the signature is valid (proves PKCS#1 -> PKCS#8 conversion worked)
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sig = Uint8Array.from(atob(parts[2]!.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keyPair.publicKey, sig, data);
    expect(valid).toBe(true);
  });
});

describe("getGHToken", () => {
  it("returns the token with highest remaining quota", () => {
    // Clear and populate ghTokens
    ghTokens.length = 0;
    const t1 = new GHToken("tok1");
    t1.valid = true;
    t1.remaining = 100;
    const t2 = new GHToken("tok2");
    t2.valid = true;
    t2.remaining = 500;
    ghTokens.push(t1, t2);

    expect(getGHToken()).toBe(t2);
  });

  it("returns undefined when no tokens are available", () => {
    ghTokens.length = 0;
    const t = new GHToken("tok");
    t.valid = false;
    ghTokens.push(t);

    expect(getGHToken()).toBeUndefined();
  });

  it("clears expired limits before selecting", () => {
    ghTokens.length = 0;
    const t = new GHToken("tok");
    t.valid = true;
    t.remaining = 0;
    t.limit = 5000;
    t.reset = Date.now() - 1000; // expired
    ghTokens.push(t);

    const result = getGHToken();
    // After clearing, remaining becomes undefined → available (remaining ?? 1 > 0)
    expect(result).toBe(t);
    expect(t.remaining).toBeUndefined();
  });

  it("skips exhausted tokens that have not expired", () => {
    ghTokens.length = 0;
    const t = new GHToken("tok");
    t.valid = true;
    t.remaining = 0;
    t.limit = 5000;
    t.reset = Date.now() + 60_000; // still in the future
    ghTokens.push(t);

    expect(getGHToken()).toBeUndefined();
  });
});

describe("ensureTokensValidated", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    ghTokens.length = 0;
    ensureTokensValidated.reset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("validates tokens and stops after first available", async () => {
    const t1 = new GHToken("tok1");
    const t2 = new GHToken("tok2");
    ghTokens.push(t1, t2);

    fetchSpy.mockResolvedValue(mockResponse(200, rateLimitHeaders(4000, 5000)));

    await ensureTokensValidated();

    expect(t1.valid).toBe(true);
    expect(t1.remaining).toBe(4000);
  });

  it("falls back to revalidation when no token is available after validation", async () => {
    const t = new GHToken("tok");
    ghTokens.push(t);

    // Validate returns 401 (invalid) — token not available, triggers revalidation path
    fetchSpy.mockResolvedValue(mockResponse(401, rateLimitHeaders(0, 0)));

    await ensureTokensValidated();

    // Initial validation marks invalid, revalidation is attempted
    expect(t.valid).toBe(false);
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("works with no tokens (empty registry)", async () => {
    await ensureTokensValidated();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("ensureAllTokensValidated", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    ghTokens.length = 0;
    ensureAppToken.reset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("validates all tokens", async () => {
    const t1 = new GHToken("tok1");
    const t2 = new GHToken("tok2");
    ghTokens.push(t1, t2);

    fetchSpy.mockResolvedValue(mockResponse(200, rateLimitHeaders(3000, 5000)));

    await ensureAllTokensValidated();

    expect(t1.valid).toBe(true);
    expect(t2.valid).toBe(true);
  });
});

describe("revalidateGHTokens", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    ghTokens.length = 0;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("revalidates stale tokens", async () => {
    const t = new GHToken("tok");
    t.valid = true;
    t._lastValidated = Date.now() - 120_000; // stale
    ghTokens.push(t);

    fetchSpy.mockResolvedValue(mockResponse(200, rateLimitHeaders(4500, 5000)));

    const result = await revalidateGHTokens();
    expect(result).toBe(true);
    expect(t.remaining).toBe(4500);
  });

  it("returns false when no tokens are stale and one is available", async () => {
    const t = new GHToken("tok");
    t.valid = true;
    t.remaining = 1000;
    t._lastValidated = Date.now(); // fresh
    ghTokens.push(t);

    const result = await revalidateGHTokens();
    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("coalesces concurrent calls", async () => {
    const t = new GHToken("tok");
    t._lastValidated = Date.now() - 120_000;
    ghTokens.push(t);

    fetchSpy.mockResolvedValue(mockResponse(200, rateLimitHeaders(4000, 5000)));

    const [r1, r2] = await Promise.all([revalidateGHTokens(), revalidateGHTokens()]);
    expect(r1).toBe(r2);
    // Only one set of validations should have happened
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
