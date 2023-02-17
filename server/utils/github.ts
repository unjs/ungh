import type { CacheOptions } from "nitropack";
import type { FetchOptions } from "ohmyfetch";

const runtimeConfig = useRuntimeConfig();

const commonCacheOptions: CacheOptions = {
  group: "gh",
  swr: true,
  maxAge: 60 * 60 * 6, // 6 hours
  staleMaxAge: 60 * 60 * 12, // 12 hours
};

const cacheOptions = (name: string): CacheOptions => ({
  ...commonCacheOptions,
  name,
});

export const ghFetch = cachedFunction(
  (url: string, opts: FetchOptions = {}) => {
    return $fetch(url, {
      baseURL: "https://api.github.com",
      ...opts,
      headers: {
        "User-Agent": "fetch",
        Authorization: "token " + runtimeConfig.GH_TOKEN,
        ...opts.headers,
      },
    });
  },
  cacheOptions("api")
);

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
  }
);
