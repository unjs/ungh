import { defineCachedFunction } from "nitro/cache";
import { useRuntimeConfig } from "nitro/runtime-config";
import type { CacheOptions } from "nitro/types";
import { ofetch, type FetchOptions } from "ofetch";
import { HTTPError } from "nitro/h3";

export interface GHToken {
  token: string;
  valid?: boolean;
  remaining?: number;
  limit?: number;
  reset?: number;
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
    _tokensValidatePromise = validateGHTokens();
  }
  return _tokensValidatePromise;
}

const commonCacheOptions: CacheOptions = {
  group: "gh",
  swr: false,
  maxAge: 60 * 60 * 6, // 6 hours
  staleMaxAge: 60 * 60 * 12, // 12 hours
};

const cacheOptions = (name: string): CacheOptions => ({
  ...commonCacheOptions,
  name,
});

function updateTokenStatus(token: GHToken, res: Response) {
  token.remaining = Number.parseInt(res.headers.get("x-ratelimit-remaining") || "0");
  token.limit = Number.parseInt(res.headers.get("x-ratelimit-limit") || "0");
  token.valid = res.status !== 401;
  const resetEpoch = res.headers.get("x-ratelimit-reset");
  token.reset = resetEpoch ? Number.parseInt(resetEpoch) * 1000 : undefined;
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

function getGHToken() {
  ensureTokens();
  const now = Date.now();
  for (const token of ghTokens) {
    if (token.valid && token.remaining === 0 && token.reset && token.reset < now) {
      // Reset expired — mark as available for retry
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

export const ghFetch = defineCachedFunction(
  async <T = any>(url: string, opts: FetchOptions = {}) => {
    let token = getGHToken();
    if (!token) {
      await validateGHTokens();
      token = getGHToken();
    }
    if (!token) {
      const soonestReset = ghTokens
        .filter((t) => t.valid && t.reset)
        .sort((a, b) => (a.reset || 0) - (b.reset || 0))[0];
      const resetInfo = soonestReset?.reset
        ? ` Rate limit resets in ${formatDuration(soonestReset.reset - Date.now())}.`
        : "";
      const invalidCount = ghTokens.filter((t) => !t.valid).length;
      const exhaustedCount = ghTokens.filter((t) => t.valid && (t.remaining || 0) === 0).length;
      throw new HTTPError({
        message: `No valid GitHub token available (${ghTokens.length} configured: ${invalidCount} invalid, ${exhaustedCount} rate-limited).${resetInfo}`,
        statusCode: 403,
      });
    }
    const res = await ofetch.raw<T>(url, {
      baseURL: "https://api.github.com",
      ...(opts as any),
      method: (opts.method || "GET").toUpperCase() as any,
      headers: {
        "User-Agent": "fetch",
        Authorization: `token ${token.token}`,
        ...opts.headers,
      },
    }).catch(async (error: unknown) => {
      await validateGHTokens().catch(() => {});
      throw error;
    });
    updateTokenStatus(token, res);
    return res._data as T;
  },
  {
    ...cacheOptions("api"),
    integrity: "cb2RkuNE4G",
    validate(entry) {
      if (
        !entry.value ||
        isEmptyArray(entry.value) ||
        entry.value?.total_count === 0 ||
        isEmptyArray(entry.value?.items)
      ) {
        return false;
      }
      return true;
    },
  },
);

function isEmptyArray(val: unknown) {
  return Array.isArray(val) && val.length === 0;
}

export function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h${rem}m` : `${hours}h`;
}

export const ghRepo = defineCachedFunction((repo: string) => {
  return ghFetch(`/repos/${repo}`);
}, cacheOptions("repo"));

export const ghRepoContributors = defineCachedFunction((repo: string) => {
  return ghFetch(`/repos/${repo}/contributors`);
}, cacheOptions("contributors"));

export const ghRepoFiles = defineCachedFunction((repo: string, ref: string) => {
  return ghFetch(`/repos/${repo}/git/trees/${ref}?recursive=1`);
}, cacheOptions("files"));

export const ghMarkdown = defineCachedFunction(
  (markdown: string, repo: string, _id: string) => {
    if (!markdown) {
      return "";
    }
    return ghFetch("/markdown", {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        "content-type": "text/x-markdown",
      },
      body: JSON.stringify({
        text: markdown,
        context: repo,
      }),
    });
  },
  {
    ...cacheOptions("markdown"),
    getKey: (_markdown, repo, id) => repo + "/" + id,
  },
);
