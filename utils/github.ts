import type { CacheOptions } from "nitropack";
import type { FetchOptions } from "ofetch";

const runtimeConfig = useRuntimeConfig();

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

type RatelimitInformation = {
  /**
   * The number of requests remaining in the current rate limit window.
   * This is collected from the response `x-ratelimit-remaining` header.
   * See https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28#checking-the-status-of-your-rate-limit
   */
  remaining: number;
  /**
   * The time at which the current rate limit window resets, in UTC epoch seconds.
   * This is collected from the response `x-ratelimit-reset` header.
   * See https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28#checking-the-status-of-your-rate-limit
   */
  reset: number;
};
/**
 * Holds the ratelimit information per GitHub token.
 * This is collected from the response header.
 * See https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28#checking-the-status-of-your-rate-limit
 */
const ratelimitInfos = new Map<string, RatelimitInformation>();

/**
 * Returns the GitHub token with the highest remaining rate limit.
 * If no tokens are available, it defaults to the first token.
 */
function getGhTokenWithHighRatelimitRemaining(): string {
  const now = Math.floor(Date.now() / 1000);
  const tokenWithRemaining = [runtimeConfig.GH_TOKEN, runtimeConfig.GH_TOKEN2]
    .filter(Boolean)
    .map((token) => {
      const ratelimitInfo = ratelimitInfos.get(token);
      return {
        token,
        remaining:
          ratelimitInfo && ratelimitInfo.reset > now
            ? ratelimitInfo.remaining
            : Infinity,
      };
    });
  let candidate: { token: string; remaining: number } | undefined;
  for (const token of tokenWithRemaining) {
    if (!candidate || token.remaining > candidate.remaining) {
      candidate = token;
    }
  }
  return candidate?.token;
}

export const ghFetch = cachedFunction(
  <T = any>(url: string, opts: FetchOptions = {}) => {
    const ghToken = getGhTokenWithHighRatelimitRemaining();
    return $fetch<T>(url, {
      baseURL: "https://api.github.com",
      ...opts,
      method: (opts.method || "GET").toUpperCase() as any,
      headers: {
        "User-Agent": "fetch",
        Authorization: "token " + ghToken,
        ...opts.headers,
      },
      async onResponse({ response }) {
        const rawRemaining = response.headers.get("x-ratelimit-remaining");
        const rawReset = response.headers.get("x-ratelimit-reset");
        if (!rawRemaining || !rawReset) {
          // If the header value is not what is expected, we can't do anything
          return;
        }
        const remaining = Number(rawRemaining);
        const reset = Number(rawReset);
        if (Number.isNaN(remaining) || Number.isNaN(reset)) {
          // If the header value is not what is expected, we can't do anything
          return;
        }

        ratelimitInfos.set(ghToken, {
          remaining,
          reset,
        });
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

function isEmptyArray(val) {
  return Array.isArray(val) && val.length === 0;
}

export const ghRepo = cachedFunction((repo: string) => {
  return ghFetch(`/repos/${repo}`);
}, cacheOptions("repo"));

export const ghRepoContributors = cachedFunction((repo: string) => {
  return ghFetch(`/repos/${repo}/contributors`);
}, cacheOptions("contributors"));

export const ghRepoFiles = cachedFunction((repo: string, ref: string) => {
  return ghFetch(`/repos/${repo}/git/trees/${ref}?recursive=1`);
}, cacheOptions("files"));

export const ghMarkdown = cachedFunction(
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
