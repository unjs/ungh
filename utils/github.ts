import { defineCachedFunction } from "nitro/cache";
import type { CacheOptions } from "nitro/types";
import { HTTPError } from "nitro/h3";
import { ghTokens, acquireGHToken, formatDuration, retryAfterSeconds } from "~/utils/github_token";

export const commonCacheOptions: CacheOptions = {
  group: "gh",
  maxAge: 60 * 60 * 24, // 24 hours
  staleMaxAge: 60 * 60 * 48, // 48 hours
  // base: ["/cache", "/redis"],
  base: ["/cache"],
};

const cacheOptions = (name: string): CacheOptions => ({
  ...commonCacheOptions,
  name,
});

export const ghFetch = defineCachedFunction(
  async <T = any>(url: string, opts: RequestInit = {}) => {
    const token = await acquireGHToken();
    if (!token) {
      const soonestReset = ghTokens
        .filter((t) => t.valid && t.reset)
        .sort((a, b) => (a.reset || 0) - (b.reset || 0))[0];
      const resetInfo = soonestReset?.reset
        ? ` Rate limit resets in ${formatDuration(soonestReset.reset - Date.now())}.`
        : "";
      const invalidCount = ghTokens.filter((t) => t.valid === false).length;
      const exhaustedCount = ghTokens.filter((t) => t.valid && (t.remaining || 0) === 0).length;
      const retryAfter = retryAfterSeconds(soonestReset?.reset);
      throw new HTTPError({
        message: `No valid GitHub token available (${ghTokens.length} configured: ${invalidCount} invalid, ${exhaustedCount} rate-limited).${resetInfo} You can help by installing the GitHub App: https://github.com/apps/ungh-app`,
        statusCode: 429,
        headers: { "Retry-After": String(retryAfter) },
      });
    }
    const fullUrl = url.startsWith("/") ? url : `/${url}`;
    const res = await fetch(`https://api.github.com${fullUrl}`, {
      ...opts,
      method: (opts.method || "GET").toUpperCase(),
      headers: {
        "User-Agent": "fetch",
        Authorization: `token ${token.token}`,
        ...opts.headers,
      },
    });
    token.updateStatus(res);
    if (!res.ok) {
      throw new HTTPError({
        message: `GitHub API error: ${res.status} ${res.statusText}`,
        statusCode: res.status,
      });
    }
    const contentType = res.headers.get("content-type") || "";
    return (contentType.includes("application/json") ? await res.json() : await res.text()) as T;
  },
  {
    ...cacheOptions("api"),
    integrity: "v1",
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
