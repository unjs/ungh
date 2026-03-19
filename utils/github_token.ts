import { useRuntimeConfig } from "nitro/runtime-config";
import { ofetch } from "ofetch";

const REVALIDATE_INTERVAL = 60_000; // 1 min

/** Represents a GitHub API token with rate limit tracking and validation. */
export class GHToken {
  token: string;
  valid?: boolean;
  remaining?: number;
  limit?: number;
  reset?: number;

  _lastValidated?: number;
  _app?: boolean;
  _appInstallationId?: string;

  constructor(token: string, opts?: { app?: boolean; appInstallationId?: string }) {
    this.token = token;
    this._app = opts?.app;
    this._appInstallationId = opts?.appInstallationId;
  }

  updateStatus(res: Response) {
    this.remaining = Number.parseInt(res.headers.get("x-ratelimit-remaining") || "0");
    this.limit = Number.parseInt(res.headers.get("x-ratelimit-limit") || "0");
    this.valid = res.status !== 401;
    const resetEpoch = res.headers.get("x-ratelimit-reset");
    this.reset = resetEpoch ? Number.parseInt(resetEpoch) * 1000 : undefined;
  }

  /** NOTE: Each call consumes one API request to fetch rate limit info. */
  async validate() {
    try {
      const res = await ofetch.raw("https://api.github.com/meta", {
        ignoreResponseError: true,
        headers: {
          "User-Agent": "fetch",
          Authorization: `token ${this.token}`,
        },
      });
      this.updateStatus(res);
      this._lastValidated = Date.now();
      const resetInfo = this.reset ? ` resets in ${formatDuration(this.reset - Date.now())}` : "";
      const resource = res.headers.get("x-ratelimit-resource") || "";
      console.log(
        `GitHub token ${this.valid ? "validated" : "invalid"} (${res.status}): ${this.remaining}/${this.limit}${resource ? ` [${resource}]` : ""}${resetInfo}`,
      );
    } catch (error) {
      // Preserve last-known token state on transport errors (DNS/TLS/timeout)
      console.error("Error validating GitHub token:", error);
    }
  }

  /** Returns true if this token needs revalidation */
  isStale(now = Date.now()) {
    if (this.reset && this.reset > now) return false;
    return !this._lastValidated || now - this._lastValidated > REVALIDATE_INTERVAL;
  }

  /** Clears expired rate limit state */
  clearExpiredLimits(now = Date.now()) {
    if (this.valid !== false && this.remaining === 0 && this.reset && this.reset < now) {
      this.remaining = undefined;
      this.limit = undefined;
      this.reset = undefined;
    }
  }

  /** Whether this token is usable for requests */
  get available() {
    return this.valid && (this.remaining ?? 1) > 0;
  }
}

// --- Token registry ---

const runtimeConfig = useRuntimeConfig();

/** All registered GitHub tokens (PAT and App-generated). */
export const ghTokens: GHToken[] = ((runtimeConfig.GH_TOKEN as string) || "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean)
  .map((t) => new GHToken(t));

let _validatePromise: Promise<void> | undefined;

/** Validates all tokens and bootstraps App tokens on first call. Idempotent. */
export async function ensureTokensValidated() {
  if (!_validatePromise) {
    _validatePromise = Promise.all([
      Promise.all(ghTokens.map((t) => t.validate())),
      ensureAppToken(),
    ]).then(() => {});
  }
  await _validatePromise;
  await revalidateGHTokens();
}

let _revalidatePromise: Promise<boolean> | undefined;

/**
 * Revalidates only tokens that haven't been validated in the last minute.
 * Concurrent callers share the same in-flight promise.
 * Returns true if any tokens were revalidated.
 */
export function revalidateGHTokens() {
  if (_revalidatePromise) {
    return _revalidatePromise;
  }
  _revalidatePromise = _doRevalidateGHTokens().finally(() => {
    _revalidatePromise = undefined;
  });
  return _revalidatePromise;
}

async function _doRevalidateGHTokens() {
  const now = Date.now();
  const staleTokens = ghTokens.filter((t) => t.isStale(now));
  if (staleTokens.length === 0 && getGHToken()) {
    return false;
  }
  await Promise.all([...staleTokens.map((t) => t.validate()), ensureAppToken()]);
  return true;
}

/** Returns the best available token (highest remaining quota), or `undefined` if none available. */
export function getGHToken() {
  const now = Date.now();
  for (const token of ghTokens) {
    token.clearExpiredLimits(now);
  }
  return ghTokens
    .filter((t) => t.available)
    .sort((a, b) => (b.remaining ?? 1) - (a.remaining ?? 1))[0];
}

/** Formats a duration in milliseconds to a human-readable string (e.g. `"5m"`, `"1h30m"`). */
export function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h${rem}m` : `${hours}h`;
}

// --- GitHub App token ---

let _appTokenPromise: Promise<void> | undefined;

/** Bootstraps GitHub App installation tokens if App credentials are configured. Idempotent. */
export function ensureAppToken() {
  if (!_appTokenPromise) {
    _appTokenPromise = _refreshAppToken();
  }
  return _appTokenPromise;
}

async function _refreshAppToken() {
  try {
    const appId = runtimeConfig.GH_APP_ID as string;
    const privateKey = runtimeConfig.GH_APP_PRIVATE_KEY as string;
    if (!appId || !privateKey) {
      _appTokenPromise = undefined;
      return;
    }

    const jwt = await _createAppJWT(appId, privateKey);

    const installations = await ofetch<{ id: number }[]>(
      "https://api.github.com/app/installations",
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "fetch",
        },
      },
    );

    const installationIds = installations.map((i) => String(i.id));

    if (installationIds.length === 0) {
      console.log("No GitHub App installations found");
      return;
    }

    let earliestRefresh = Number.POSITIVE_INFINITY;

    await Promise.all(
      installationIds.map(async (installationId) => {
        try {
          const res = await ofetch<{ token: string; expires_at: string }>(
            `https://api.github.com/app/installations/${installationId}/access_tokens`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "fetch",
              },
            },
          );

          const existing = ghTokens.find((t) => t._appInstallationId === installationId);
          if (existing) {
            existing.token = res.token;
            existing.valid = true;
            existing.remaining = undefined;
            existing.limit = undefined;
            existing.reset = undefined;
          } else {
            ghTokens.push(
              new GHToken(res.token, {
                app: true,
                appInstallationId: installationId,
              }),
            );
          }

          const expiresAt = new Date(res.expires_at).getTime();
          const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60_000, 60_000);
          earliestRefresh = Math.min(earliestRefresh, refreshIn);

          console.log(
            `GitHub App token acquired for installation ${installationId} (expires ${res.expires_at})`,
          );
        } catch (error) {
          console.error(
            `Failed to get GitHub App token for installation ${installationId}:`,
            error,
          );
        }
      }),
    );

    if (earliestRefresh < Number.POSITIVE_INFINITY) {
      setTimeout(() => {
        _appTokenPromise = _refreshAppToken();
      }, earliestRefresh);
    }
  } catch (error) {
    _appTokenPromise = undefined;
    console.error("Failed to initialize GitHub App tokens:", error);
  }
}

/** Creates an RS256-signed JWT for GitHub App authentication. Exported for testing. */
export async function _createAppJWT(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = _base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = _base64url(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    _pemToKeyData(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const signature = _bufferToBase64url(sig);
  return `${header}.${payload}.${signature}`;
}

/** Encodes a UTF-8 string to base64url. Exported for testing. */
export function _base64url(str: string): string {
  return _bufferToBase64url(new TextEncoder().encode(str));
}

function _bufferToBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function _pemToKeyData(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, "\n");
  const isPkcs1 = normalized.includes("BEGIN RSA PRIVATE KEY");
  const base64 = normalized
    .replace(/-----BEGIN [\w ]+-----/, "")
    .replace(/-----END [\w ]+-----/, "")
    .replace(/\s/g, "");
  const der = _base64ToBinary(base64);
  return isPkcs1 ? _pkcs1ToPkcs8(der) : der;
}

function _base64ToBinary(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

function _pkcs1ToPkcs8(pkcs1: ArrayBuffer): ArrayBuffer {
  const pkcs1Bytes = new Uint8Array(pkcs1);
  const algorithmId = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const octetString = _asn1Wrap(0x04, pkcs1Bytes);
  const totalLen = version.length + algorithmId.length + octetString.length;
  const seq = _asn1Wrap(0x30, _concat(version, algorithmId, octetString), totalLen);
  return seq.buffer as ArrayBuffer;
}

function _asn1Wrap(tag: number, content: Uint8Array, knownLen?: number): Uint8Array {
  const len = knownLen ?? content.length;
  const lenBytes = _asn1Length(len);
  const result = new Uint8Array(1 + lenBytes.length + content.length);
  result[0] = tag;
  result.set(lenBytes, 1);
  result.set(content, 1 + lenBytes.length);
  return result;
}

function _asn1Length(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  if (len < 0x100) return new Uint8Array([0x81, len]);
  if (len < 0x10000) return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
  return new Uint8Array([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
}

function _concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
