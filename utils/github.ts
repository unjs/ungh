import { defineCachedFunction } from "nitro/cache";
import type { CacheOptions } from "nitro/types";
import { ofetch, type FetchOptions } from "ofetch";
import { HTTPError } from "nitro/h3";
import {
  GHToken,
  ghTokens,
  getGHToken,
  formatDuration,
  ensureTokensValidated,
  ensureAllTokensValidated,
  revalidateGHTokens,
} from "~/utils/github_token";

export { GHToken, ghTokens, ensureTokensValidated, ensureAllTokensValidated, formatDuration };

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

export const ghFetch = defineCachedFunction(
  async <T = any>(url: string, opts: FetchOptions = {}) => {
    let token = getGHToken();
    if (!token && (await revalidateGHTokens())) {
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
    return ofetch<T>(url, {
      baseURL: "https://api.github.com",
      ...(opts as any),
      method: (opts.method || "GET").toUpperCase() as any,
      headers: {
        "User-Agent": "fetch",
        Authorization: `token ${token.token}`,
        ...opts.headers,
      },
      onResponse({ response }) {
        token.updateStatus(response);
      },
    });
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

function isEmptyArray(val: unknown) {
  return Array.isArray(val) && val.length === 0;
}
