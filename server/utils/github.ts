import { Endpoints } from "@octokit/types";
import type { CacheOptions, NitroFetchOptions } from "nitropack";

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
  (url, opts = {}) => {
    return $fetch(url, {
      baseURL: "https://api.github.com",
      ...opts,
      headers: {
        "User-Agent": "fetch",
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${runtimeConfig.GH_TOKEN}`,
        'X-GitHub-Api-Version': "2022-11-28",
        ...opts.headers,
      },
    });
  },
  cacheOptions("api")
) as <T extends string | Record<string, any> = any>(url: string, opts?: NitroFetchOptions<string, "get" | "post">) => Promise<T>;

export const ghRepo = cachedFunction<
  Endpoints["GET /repos/{owner}/{repo}"]['response']['data']
>((repo: string) => {
  return ghFetch(`/repos/${repo}`);
}, cacheOptions("repo"));

export const ghRepoContributors = cachedFunction<
  Endpoints["GET /repos/{owner}/{repo}/contributors"]['response']['data']
>((repo: string) => {
  return ghFetch(`/repos/${repo}/contributors`);
}, cacheOptions("contributors"));

export const ghRepoFiles = cachedFunction<
  Endpoints["GET /repos/{owner}/{repo}/git/trees/{tree_sha}"]['response']['data']
>((repo: string, ref: string) => {
  return ghFetch(`/repos/${repo}/git/trees/${ref}?recursive=1`);
}, cacheOptions("files"));

export const ghMarkdown = cachedFunction<
  Endpoints["POST /markdown"]['response']['data']
>((markdown: string, repo: string) => {
    return ghFetch("/markdown", {
      method: "POST",
      headers: {
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
