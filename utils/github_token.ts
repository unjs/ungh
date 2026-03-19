import { useRuntimeConfig } from "nitro/runtime-config";
import { ofetch } from "ofetch";

export interface GHToken {
  token: string;
  valid?: boolean;
  remaining?: number;
  limit?: number;
  reset?: number;
  _lastValidated?: number;
  _app?: boolean;
  _appInstallationId?: string;
}

export const ghTokens: GHToken[] = [];

let _tokensInitialized = false;
let _tokensValidatePromise: Promise<void> | undefined;

export function ensureTokens() {
  if (_tokensInitialized) return;
  _tokensInitialized = true;
  const runtimeConfig = useRuntimeConfig();
  const tokens = ((runtimeConfig.GH_TOKEN as string) || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  ghTokens.push(...tokens.map((token) => ({ token })));
}

export function ensureTokensValidated() {
  ensureTokens();
  if (!_tokensValidatePromise) {
    _tokensValidatePromise = Promise.all([validateGHTokens(), ensureAppToken()]).then(() => {});
  }
  return _tokensValidatePromise;
}

// NOTE: Each call consumes one API request per token to fetch rate limit info.
// Call this sparingly.
async function validateGHToken(token: GHToken) {
  try {
    const res = await ofetch.raw("https://api.github.com/meta", {
      ignoreResponseError: true,
      headers: {
        "User-Agent": "fetch",
        Authorization: `token ${token.token}`,
      },
    });
    updateTokenStatus(token, res);
    token._lastValidated = Date.now();
    const resetInfo = token.reset ? ` resets in ${formatDuration(token.reset - Date.now())}` : "";
    const resource = res.headers.get("x-ratelimit-resource") || "";
    console.log(
      `GitHub token ${token.valid ? "validated" : "invalid"} (${res.status}): ${token.remaining}/${token.limit}${resource ? ` [${resource}]` : ""}${resetInfo}`,
    );
  } catch (error) {
    // Preserve last-known token state on transport errors (DNS/TLS/timeout)
    console.error("Error validating GitHub token:", error);
  }
}

async function validateGHTokens() {
  ensureTokens();
  await Promise.all(ghTokens.map((token) => validateGHToken(token)));
}

const REVALIDATE_INTERVAL = 60_000; // 1 min

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
  ensureTokens();
  const now = Date.now();
  const staleTokens = ghTokens.filter(
    (t) =>
      (!t._lastValidated || now - t._lastValidated > REVALIDATE_INTERVAL) &&
      (!t.reset || t.reset <= now),
  );
  if (staleTokens.length === 0) {
    return false;
  }
  await Promise.all(staleTokens.map((token) => validateGHToken(token)));
  return true;
}

export function getGHToken() {
  ensureTokens();
  const now = Date.now();
  for (const token of ghTokens) {
    if (token.valid && token.remaining === 0 && token.reset && token.reset < now) {
      token.remaining = undefined;
      token.limit = undefined;
      token.reset = undefined;
    }
  }
  const validTokens = ghTokens
    .filter((token) => token.valid && (token.remaining ?? 1) > 0)
    .sort((a, b) => (b.remaining ?? 1) - (a.remaining ?? 1));
  return validTokens[0];
}

export function updateTokenStatus(token: GHToken, res: Response) {
  token.remaining = Number.parseInt(res.headers.get("x-ratelimit-remaining") || "0");
  token.limit = Number.parseInt(res.headers.get("x-ratelimit-limit") || "0");
  token.valid = res.status !== 401;
  const resetEpoch = res.headers.get("x-ratelimit-reset");
  token.reset = resetEpoch ? Number.parseInt(resetEpoch) * 1000 : undefined;
}

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

export function ensureAppToken() {
  if (!_appTokenPromise) {
    _appTokenPromise = _refreshAppToken();
  }
  return _appTokenPromise;
}

async function _refreshAppToken() {
  try {
    const runtimeConfig = useRuntimeConfig();
    const appId = runtimeConfig.GH_APP_ID as string;
    const privateKey = runtimeConfig.GH_APP_PRIVATE_KEY as string;
    if (!appId || !privateKey) {
      return;
    }

    const jwt = await _createAppJWT(appId, privateKey);

    // Fetch installation IDs from the GitHub API
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
            ghTokens.push({
              token: res.token,
              valid: true,
              _app: true,
              _appInstallationId: installationId,
            });
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

    // Schedule refresh based on earliest expiry
    if (earliestRefresh < Number.POSITIVE_INFINITY) {
      setTimeout(() => {
        _appTokenPromise = _refreshAppToken();
      }, earliestRefresh);
    }
  } catch (error) {
    console.error("Failed to initialize GitHub App tokens:", error);
  }
}

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

export function _base64url(str: string): string {
  return _bufferToBase64url(new TextEncoder().encode(str));
}

function _bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function _pemToKeyData(pem: string): ArrayBuffer {
  // Normalize literal \n from env vars to real newlines
  const normalized = pem.replace(/\\n/g, "\n");
  const isPkcs1 = normalized.includes("BEGIN RSA PRIVATE KEY");
  const base64 = normalized
    .replace(/-----BEGIN [\w ]+-----/, "")
    .replace(/-----END [\w ]+-----/, "")
    .replace(/\s/g, "");
  const der = _base64ToBinary(base64);
  // Web Crypto requires PKCS#8; GitHub App keys are PKCS#1 — wrap if needed
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

// Wraps a PKCS#1 RSA private key DER in the PKCS#8 ASN.1 envelope
function _pkcs1ToPkcs8(pkcs1: ArrayBuffer): ArrayBuffer {
  // PKCS#8 header for RSA: SEQUENCE { version INTEGER 0, algorithm AlgorithmIdentifier { OID rsaEncryption, NULL }, privateKey OCTET STRING { <pkcs1> } }
  const pkcs1Bytes = new Uint8Array(pkcs1);
  // RSA OID (1.2.840.113549.1.1.1) + NULL params
  const algorithmId = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
  const octetString = _asn1Wrap(0x04, pkcs1Bytes); // OCTET STRING wrapping PKCS#1
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
