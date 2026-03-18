import { createSign } from "node:crypto";
import { useRuntimeConfig } from "nitro/runtime-config";
import { ofetch } from "ofetch";

export interface GHToken {
  token: string;
  valid?: boolean;
  remaining?: number;
  limit?: number;
  reset?: number;
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
    _tokensValidatePromise = Promise.all([
      validateGHTokens(),
      ensureAppToken(),
    ]).then(() => {});
  }
  return _tokensValidatePromise;
}

export async function validateGHTokens() {
  ensureTokens();
  await Promise.all(
    ghTokens.map(async (token) => {
      try {
        const res = await ofetch.raw("https://api.github.com/meta", {
          ignoreResponseError: true,
          headers: {
            "User-Agent": "fetch",
            Authorization: `token ${token.token}`,
          },
        });
        updateTokenStatus(token, res);
        const resetInfo = token.reset
          ? ` resets in ${formatDuration(token.reset - Date.now())}`
          : "";
        const resource = res.headers.get("x-ratelimit-resource") || "";
        console.log(
          `GitHub token ${token.valid ? "validated" : "invalid"} (${res.status}): ${token.remaining}/${token.limit}${resource ? ` [${resource}]` : ""}${resetInfo}`,
        );
      } catch (error) {
        console.error("Error validating GitHub token:", error);
        token.valid = false;
        token.remaining = 0;
        token.limit = 0;
      }
    }),
  );
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
  const runtimeConfig = useRuntimeConfig();
  const appId = runtimeConfig.GH_APP_ID as string;
  const privateKey = runtimeConfig.GH_APP_PRIVATE_KEY as string;
  const installationIds = ((runtimeConfig.GH_APP_INSTALLATION_ID as string) || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!appId || !privateKey || installationIds.length === 0) {
    return;
  }

  const jwt = _createAppJWT(appId, privateKey);
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
          ghTokens.push({ token: res.token, valid: true, _app: true, _appInstallationId: installationId });
        }

        const expiresAt = new Date(res.expires_at).getTime();
        const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60_000, 60_000);
        earliestRefresh = Math.min(earliestRefresh, refreshIn);

        console.log(
          `GitHub App token acquired for installation ${installationId} (expires ${res.expires_at})`,
        );
      } catch (error) {
        console.error(`Failed to get GitHub App token for installation ${installationId}:`, error);
      }
    }),
  );

  // Schedule refresh based on earliest expiry
  if (earliestRefresh < Number.POSITIVE_INFINITY) {
    setTimeout(() => {
      _appTokenPromise = _refreshAppToken();
    }, earliestRefresh);
  }
}

export function _createAppJWT(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = _base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = _base64url(
    JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey, "base64url");
  return `${header}.${payload}.${signature}`;
}

export function _base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}
