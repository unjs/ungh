import type { CacheOptions } from "nitropack";
import type { FetchOptions } from "ofetch";

const runtimeConfig = useRuntimeConfig();

const _tokens = (runtimeConfig.GH_TOKEN || "")
  .split(",")
  .map((token) => token.trim())
  .filter(Boolean);

const ghTokens = _tokens.map((token) => ({
  token,
  valid: undefined as boolean,
  remaining: undefined as number,
  limit: undefined as number,
}));

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

async function validateGHTokens() {
  await Promise.all(
    ghTokens.map(async (token) => {
      try {
        const res = await $fetch.raw("/meta", {
          baseURL: "https://api.github.com",
          headers: {
            "User-Agent": "fetch",
            Authorization: `token ${token.token}`,
          },
        });
        token.remaining = Number.parseInt(
          res.headers.get("x-ratelimit-remaining") || "0",
        );
        token.limit = Number.parseInt(
          res.headers.get("x-ratelimit-limit") || "0",
        );
        token.valid = true;
      } catch {
        token.valid = false;
        token.remaining = 0;
        token.limit = 0;
      }
    }),
  );
}

function getGHToken() {
  const validTokens = ghTokens
    .filter((token) => token.valid && token.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);
  // console.log(validTokens);
  return validTokens[0];
}

export const ghFetch = cachedFunction(
  async <T = any>(url: string, opts: FetchOptions = {}) => {
    let token = getGHToken();
    if (!token) {
      await validateGHTokens();
      token = getGHToken();
    }
    if (!token) {
      throw createError({
        message: "No valid GitHub token available",
        statusCode: 403,
      });
    }
    return $fetch<T>(url, {
      baseURL: "https://api.github.com",
      ...opts,
      method: (opts.method || "GET").toUpperCase() as any,
      headers: {
        "User-Agent": "fetch",
        Authorization: `token ${token.token}`,
        ...opts.headers,
      },
    }).catch(async (error_) => {
      await validateGHTokens().catch(() => {});
      throw error_;
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
