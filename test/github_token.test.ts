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
  acquireGHToken,
} from "~/utils/github_token";

// --- Test helpers ---

function mockResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

function mockRateLimitResponse(remaining: number, limit: number, resetEpoch?: number): Response {
  return new Response(
    JSON.stringify({
      resources: {
        core: {
          limit,
          used: limit - remaining,
          remaining,
          reset: resetEpoch,
        },
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
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

/** Generates a PEM key pair for App JWT tests. Cached after first call. */
let _cachedKeyPair: { pem: string; keyPair: CryptoKeyPair } | undefined;
async function getTestKeyPair() {
  if (!_cachedKeyPair) {
    const keyPair = await crypto.subtle.generateKey(
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
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(pkcs8)))}\n-----END PRIVATE KEY-----`;
    _cachedKeyPair = { pem, keyPair };
  }
  return _cachedKeyPair;
}

/** Creates a fetch mock that routes GitHub App API calls. */
function mockAppFetch(
  fetchSpy: ReturnType<typeof vi.spyOn>,
  opts: {
    installations?: { id: number }[];
    installationsStatus?: number;
    accessToken?: { token: string; expires_at: string };
    accessTokenStatus?: number;
    rateLimit?: {
      resources: Record<string, { limit: number; used: number; remaining: number; reset: number }>;
    };
  } = {},
) {
  const {
    installations = [{ id: 42 }],
    installationsStatus = 200,
    accessToken = {
      token: "ghs_installtoken123456",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    },
    accessTokenStatus = 200,
    rateLimit = {
      resources: {
        core: {
          limit: 5000,
          used: 500,
          remaining: 4500,
          reset: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    },
  } = opts;

  fetchSpy.mockImplementation(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    if (urlStr.includes("/app/installations") && !urlStr.includes("/access_tokens")) {
      return new Response(JSON.stringify(installations), {
        status: installationsStatus,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (urlStr.includes("/access_tokens")) {
      if (accessTokenStatus !== 200) {
        return new Response(null, { status: accessTokenStatus });
      }
      return new Response(JSON.stringify(accessToken), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (urlStr.includes("/rate_limit")) {
      return new Response(JSON.stringify(rateLimit), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch to ${urlStr} in mockAppFetch`);
  });
}

// --- GHToken class ---

describe("GHToken", () => {
  describe("updateStatusFromResponse", () => {
    it("parses rate limit headers from successful response", () => {
      const token = new GHToken("test-token");
      const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
      token.updateStatusFromResponse(mockResponse(200, rateLimitHeaders(4999, 5000, resetEpoch)));

      expect(token.valid).toBe(true);
      expect(token.remaining).toBe(4999);
      expect(token.limit).toBe(5000);
      expect(token.reset).toBe(resetEpoch * 1000);
    });

    it("marks token invalid on 401", () => {
      const token = new GHToken("bad-token");
      token.updateStatusFromResponse(mockResponse(401, rateLimitHeaders(0, 0)));
      expect(token.valid).toBe(false);
      expect(token.remaining).toBe(0);
    });

    it("marks token valid on 403 (rate limited, not auth failure)", () => {
      const token = new GHToken("test-token");
      token.updateStatusFromResponse(mockResponse(403, rateLimitHeaders(0, 5000)));
      expect(token.valid).toBe(true);
      expect(token.remaining).toBe(0);
    });

    it("handles missing reset header", () => {
      const token = new GHToken("test-token");
      token.updateStatusFromResponse(mockResponse(200, rateLimitHeaders(100, 5000)));
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

    it("updates status from /rate_limit response", async () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
      fetchSpy.mockResolvedValueOnce(mockRateLimitResponse(4500, 5000, resetEpoch));

      const token = new GHToken("test-token");
      await token.validate();

      expect(token.valid).toBe(true);
      expect(token.remaining).toBe(4500);
      expect(token.limit).toBe(5000);
      expect(token.reset).toBe(resetEpoch * 1000);
      expect(token._lastValidated).toBeTypeOf("number");
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy.mock.calls[0]![0]).toMatch(/api\.github\.com\/rate_limit/);
    });

    it("marks token invalid on 401 response", async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(401));
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
      fetchSpy.mockResolvedValueOnce(mockRateLimitResponse(5000, 5000));
      const token = new GHToken("ghp_secret123");
      await token.validate();
      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit)?.headers);
      expect(headers.get("Authorization")).toBe("token ghp_secret123");
    });
  });

  describe("isStale", () => {
    const now = 1_000_000;

    it.each([
      { desc: "never validated", lastValidated: undefined, reset: undefined, expected: true },
      { desc: "recently validated", lastValidated: now - 1000, reset: undefined, expected: false },
      {
        desc: "validated >1min ago",
        lastValidated: now - 61_000,
        reset: undefined,
        expected: true,
      },
      {
        desc: "stale but reset pending",
        lastValidated: now - 120_000,
        reset: now + 60_000,
        expected: false,
      },
      {
        desc: "stale and reset passed",
        lastValidated: now - 120_000,
        reset: now - 1000,
        expected: true,
      },
    ])("$desc → $expected", ({ lastValidated, reset, expected }) => {
      const token = new GHToken("t");
      token._lastValidated = lastValidated;
      if (reset !== undefined) token.reset = reset;
      expect(token.isStale(now)).toBe(expected);
    });
  });

  describe("clearExpiredLimits", () => {
    const now = 1_000_000;

    it.each<{
      desc: string;
      state: { valid?: boolean; remaining: number; limit: number; reset: number };
      clears: boolean;
    }>([
      {
        desc: "valid=true, remaining=0, reset expired",
        state: { valid: true, remaining: 0, limit: 5000, reset: now - 1000 },
        clears: true,
      },
      {
        desc: "valid=undefined, remaining=0, reset expired",
        state: { valid: undefined, remaining: 0, limit: 5000, reset: now - 1000 },
        clears: true,
      },
      {
        desc: "valid=true, remaining=0, reset in future",
        state: { valid: true, remaining: 0, limit: 5000, reset: now + 60_000 },
        clears: false,
      },
      {
        desc: "valid=true, remaining>0, reset expired",
        state: { valid: true, remaining: 100, limit: 5000, reset: now - 1000 },
        clears: false,
      },
      {
        desc: "valid=false, remaining=0, reset expired",
        state: { valid: false, remaining: 0, limit: 5000, reset: now - 1000 },
        clears: false,
      },
    ])("$desc → clears=$clears", ({ state, clears }) => {
      const token = new GHToken("t");
      token.valid = state.valid;
      token.remaining = state.remaining;
      token.limit = state.limit;
      token.reset = state.reset;

      token.clearExpiredLimits(now);

      if (clears) {
        expect(token.remaining).toBeUndefined();
        expect(token.limit).toBeUndefined();
        expect(token.reset).toBeUndefined();
      } else {
        expect(token.remaining).toBe(state.remaining);
      }
    });
  });

  describe("available", () => {
    it.each([
      { desc: "valid with remaining", valid: true, remaining: 100, expected: true },
      { desc: "invalid with remaining", valid: false as const, remaining: 100, expected: false },
      { desc: "valid but exhausted", valid: true, remaining: 0, expected: false },
      { desc: "unvalidated (undefined)", valid: undefined, remaining: undefined, expected: false },
      {
        desc: "valid, remaining undefined (defaults to 1)",
        valid: true,
        remaining: undefined,
        expected: true,
      },
    ])("$desc → $expected", ({ valid, remaining, expected }) => {
      const token = new GHToken("t");
      token.valid = valid;
      token.remaining = remaining;
      if (expected) {
        expect(token.available).toBe(true);
      } else {
        expect(token.available).toBeFalsy();
      }
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

  describe("maskedToken / toString / toJSON / inspect", () => {
    it.each([
      { token: "ghp_abcdefghijklmnop", masked: "ghp_***mnop" },
      { token: "short", masked: "***" },
      { token: "123456789", masked: "1234***6789" },
    ])("maskedToken($token) → $masked", ({ token, masked }) => {
      expect(new GHToken(token).maskedToken).toBe(masked);
    });

    it("toString includes type", () => {
      expect(new GHToken("ghp_abcdefghijklmnop").toString()).toBe("[GitHub pat token ghp_***mnop]");
      expect(new GHToken("ghs_abcdefghijklmnop", { app: true }).toString()).toBe(
        "[GitHub app token ghs_***mnop]",
      );
    });

    it("toJSON returns serializable object", () => {
      const token = new GHToken("ghp_abcdefghijklmnop");
      token.valid = true;
      token.remaining = 4500;
      token.limit = 5000;
      token.reset = 1700000000000;
      expect(token.toJSON()).toEqual({
        token: "ghp_***mnop",
        valid: true,
        remaining: 4500,
        limit: 5000,
        reset: 1700000000000,
      });
    });

    it("inspect returns same as toString", () => {
      const token = new GHToken("ghp_abcdefghijklmnop");
      expect((token as any)[Symbol.for("nodejs.util.inspect.custom")]()).toBe(token.toString());
    });
  });
});

// --- Pure functions ---

describe("formatDuration", () => {
  it.each([
    [0, "<1m"],
    [29_000, "<1m"],
    [60_000, "1m"],
    [5 * 60_000, "5m"],
    [59 * 60_000, "59m"],
    [60 * 60_000, "1h"],
    [2 * 60 * 60_000, "2h"],
    [90 * 60_000, "1h30m"],
    [125 * 60_000, "2h5m"],
  ])("formatDuration(%i) → %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("_base64url", () => {
  it("encodes strings to url-safe base64 without padding", () => {
    expect(_base64url("hello")).toBe("aGVsbG8");
    expect(_base64url("a")).not.toContain("=");
    expect(_base64url("subjects?_d")).not.toMatch(/[+/]/);
  });

  it("round-trips JSON payloads (JWT use case)", () => {
    const json = JSON.stringify({ alg: "RS256", typ: "JWT" });
    const encoded = _base64url(json);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    expect(JSON.parse(decoded)).toEqual({ alg: "RS256", typ: "JWT" });
  });
});

// --- _createAppJWT ---

/** Verifies an RS256 JWT signature against the test key pair. */
async function verifyJWTSignature(jwt: string, publicKey: CryptoKey) {
  const parts = jwt.split(".");
  expect(parts).toHaveLength(3);
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = Uint8Array.from(atob(parts[2]!.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
  expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, sig, data)).toBe(true);
}

/** Extracts the PKCS#1 key bytes from a PKCS#8 DER buffer. */
function extractPkcs1FromPkcs8(pkcs8Der: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(pkcs8Der);
  let offset = 1; // skip SEQUENCE tag
  if (bytes[offset]! & 0x80) {
    offset += 1 + (bytes[offset]! & 0x7f);
  } else {
    offset += 1;
  }
  offset += 3; // version INTEGER (02 01 00)
  offset += 15; // algorithmId SEQUENCE
  offset += 1; // OCTET STRING tag
  if (bytes[offset]! & 0x80) {
    offset += 1 + (bytes[offset]! & 0x7f);
  } else {
    offset += 1;
  }
  return bytes.slice(offset);
}

describe("_createAppJWT", () => {
  let keyPair: CryptoKeyPair;
  let pkcs8Pem: string;

  beforeAll(async () => {
    const kp = await getTestKeyPair();
    keyPair = kp.keyPair;
    pkcs8Pem = kp.pem;
  });

  it("creates a valid 3-part JWT with correct header and payload", async () => {
    const jwt = await _createAppJWT("12345", pkcs8Pem);
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);

    const header = JSON.parse(atob(parts[0]!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });

    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload.iss).toBe("12345");
    expect(payload.exp).toBeGreaterThan(payload.iat);

    await verifyJWTSignature(jwt, keyPair.publicKey);
  });

  describe("PEM formats", () => {
    it("PKCS#8 standard PEM", async () => {
      const jwt = await _createAppJWT("1", pkcs8Pem);
      await verifyJWTSignature(jwt, keyPair.publicKey);
    });

    it("PEM with escaped newlines (env var style)", async () => {
      const jwt = await _createAppJWT("2", pkcs8Pem.replace(/\n/g, "\\n"));
      await verifyJWTSignature(jwt, keyPair.publicKey);
    });

    it("PKCS#1 (RSA PRIVATE KEY) format", async () => {
      const pkcs8Der = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
      const pkcs1Bytes = extractPkcs1FromPkcs8(pkcs8Der);
      const pkcs1Pem = `-----BEGIN RSA PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs1Bytes))}\n-----END RSA PRIVATE KEY-----`;

      const jwt = await _createAppJWT("3", pkcs1Pem);
      await verifyJWTSignature(jwt, keyPair.publicKey);
    });
  });
});

// --- Token registry functions ---

describe("getGHToken", () => {
  beforeEach(() => {
    ghTokens.length = 0;
  });

  it("returns the token with highest remaining quota", () => {
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
    const t = new GHToken("tok");
    t.valid = false;
    ghTokens.push(t);
    expect(getGHToken()).toBeUndefined();
  });

  it("clears expired limits before selecting", () => {
    const t = new GHToken("tok");
    t.valid = true;
    t.remaining = 0;
    t.limit = 5000;
    t.reset = Date.now() - 1000;
    ghTokens.push(t);

    const result = getGHToken();
    expect(result).toBe(t);
    expect(t.remaining).toBeUndefined();
  });

  it("skips exhausted tokens that have not expired", () => {
    const t = new GHToken("tok");
    t.valid = true;
    t.remaining = 0;
    t.limit = 5000;
    t.reset = Date.now() + 60_000;
    ghTokens.push(t);
    expect(getGHToken()).toBeUndefined();
  });
});

// --- Async token management (shared fetch spy setup) ---

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

  it("validates tokens until one is available", async () => {
    ghTokens.push(new GHToken("tok1"), new GHToken("tok2"));
    fetchSpy.mockResolvedValue(mockRateLimitResponse(4000, 5000));
    await ensureTokensValidated();
    expect(ghTokens[0]!.valid).toBe(true);
    expect(ghTokens[0]!.remaining).toBe(4000);
  });

  it("falls back to revalidation when no token is available", async () => {
    ghTokens.push(new GHToken("tok"));
    fetchSpy.mockResolvedValue(mockResponse(401));
    await ensureTokensValidated();
    expect(ghTokens[0]!.valid).toBe(false);
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("works with empty registry", async () => {
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
    ghTokens.push(new GHToken("tok1"), new GHToken("tok2"));
    fetchSpy.mockResolvedValue(mockResponse(200, rateLimitHeaders(3000, 5000)));
    await ensureAllTokensValidated();
    expect(ghTokens[0]!.valid).toBe(true);
    expect(ghTokens[1]!.valid).toBe(true);
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
    t._lastValidated = Date.now() - 120_000;
    ghTokens.push(t);
    fetchSpy.mockResolvedValue(mockRateLimitResponse(4500, 5000));
    expect(await revalidateGHTokens()).toBe(true);
    expect(t.remaining).toBe(4500);
  });

  it("short-circuits when no tokens are stale and one is available", async () => {
    const t = new GHToken("tok");
    t.valid = true;
    t.remaining = 1000;
    t._lastValidated = Date.now();
    ghTokens.push(t);
    expect(await revalidateGHTokens()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("coalesces concurrent calls", async () => {
    const t = new GHToken("tok");
    t._lastValidated = Date.now() - 120_000;
    ghTokens.push(t);
    fetchSpy.mockResolvedValue(mockResponse(200, rateLimitHeaders(4000, 5000)));
    const [r1, r2] = await Promise.all([revalidateGHTokens(), revalidateGHTokens()]);
    expect(r1).toBe(r2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("acquireGHToken", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    ghTokens.length = 0;
    ensureTokensValidated.reset();
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns the best available token after validation", async () => {
    const t = new GHToken("tok");
    ghTokens.push(t);
    fetchSpy.mockResolvedValue(mockResponse(200, rateLimitHeaders(4000, 5000)));
    expect(await acquireGHToken()).toBe(t);
    expect(t.valid).toBe(true);
  });

  it("returns undefined when all tokens are invalid", async () => {
    ghTokens.push(new GHToken("tok"));
    fetchSpy.mockResolvedValue(mockResponse(401, rateLimitHeaders(0, 0)));
    expect(await acquireGHToken()).toBeUndefined();
  });

  it("revalidates when first pass yields no available token", async () => {
    const t = new GHToken("tok");
    ghTokens.push(t);
    let callCount = 0;
    fetchSpy.mockImplementation(async () => {
      callCount++;
      if (callCount <= 1) {
        return mockResponse(200, rateLimitHeaders(0, 5000, Math.floor(Date.now() / 1000) - 1));
      }
      return mockResponse(200, rateLimitHeaders(4000, 5000));
    });
    expect(await acquireGHToken()).toBe(t);
  });
});

// --- GitHub App token flow ---

describe("ensureAppToken (_refreshAppToken)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    ghTokens.length = 0;
    ensureAppToken.reset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  it.each([
    { desc: "GH_APP_ID missing", id: undefined, key: "some-key" },
    { desc: "GH_APP_PRIVATE_KEY missing", id: "123", key: undefined },
    { desc: "both missing", id: undefined, key: undefined },
  ])("does nothing when $desc", async ({ id, key }) => {
    if (id) process.env.GH_APP_ID = id;
    else delete process.env.GH_APP_ID;
    if (key) process.env.GH_APP_PRIVATE_KEY = key;
    else delete process.env.GH_APP_PRIVATE_KEY;
    await ensureAppToken();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  async function setupAppEnv() {
    const { pem } = await getTestKeyPair();
    process.env.GH_APP_ID = "99";
    process.env.GH_APP_PRIVATE_KEY = pem;
  }

  it("fetches installations and creates tokens", async () => {
    await setupAppEnv();
    mockAppFetch(fetchSpy);

    await ensureAppToken();

    const appToken = ghTokens.find((t) => t._app);
    expect(appToken).toBeDefined();
    expect(appToken!._appInstallationId).toBe("42");
    expect(appToken!.valid).toBe(true);
  });

  it("updates existing app token instead of creating new one", async () => {
    await setupAppEnv();

    const existing = new GHToken("old-token", { app: true, appInstallationId: "42" });
    existing.valid = true;
    existing.remaining = 100;
    ghTokens.push(existing);

    mockAppFetch(fetchSpy, {
      accessToken: {
        token: "ghs_newtoken123456789",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
    });

    await ensureAppToken();

    const appTokens = ghTokens.filter((t) => t._appInstallationId === "42");
    expect(appTokens).toHaveLength(1);
    expect(appTokens[0]!.token).toBe("ghs_newtoken123456789");
  });

  it("handles installation token fetch failure gracefully", async () => {
    await setupAppEnv();
    mockAppFetch(fetchSpy, { accessTokenStatus: 500 });
    await ensureAppToken();
    expect(ghTokens.filter((t) => t._app)).toHaveLength(0);
  });

  it("handles installations fetch failure gracefully", async () => {
    await setupAppEnv();
    mockAppFetch(fetchSpy, { installationsStatus: 403 });
    await ensureAppToken();
  });

  it("handles empty installations list", async () => {
    await setupAppEnv();
    mockAppFetch(fetchSpy, { installations: [] });
    await ensureAppToken();
    expect(ghTokens.filter((t) => t._app)).toHaveLength(0);
  });
});
