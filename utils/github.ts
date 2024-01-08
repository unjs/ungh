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

export const ghFetch = cachedFunction(
  <T = any>(url: string, opts: FetchOptions = {}) => {
    return $fetch<T>(url, {
      baseURL: "https://api.github.com",
      ...opts,
      method: (opts.method || "GET").toUpperCase() as any,
      headers: {
        "User-Agent": "fetch",
        Authorization: "token " + runtimeConfig.GH_TOKEN,
        ...opts.headers,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export const ghPagination = cachedFunction(async (url: string, page: number, perPage: number) => {
  const { _data: data, headers } = await $fetch.raw(url, {
      baseURL: "https://api.github.com",
      query: {
        page,
        per_page: perPage,
      },
      method: 'GET',
      headers: {
        "User-Agent": "fetch",
        Authorization: "token " + runtimeConfig.GH_TOKEN,
      },
    });

    return {
      _data: data,
      headers: {
        Link: headers.get("Link"),
      },
    };
}, {
  ...cacheOptions("pagination"),
  getKey: (path, page, perPage) => `${path}/${page}/${perPage}`,
});
