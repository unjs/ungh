import { defineRouteMeta, defineHandler } from "nitro";
import { getQuery, HTTPError } from "nitro/h3";
import { ghFetch, ghMarkdown } from "~/utils/github";
import { withQuery } from "ufo";
import type { GithubRelease } from "~types";

defineRouteMeta({
  openAPI: {
    description: "Get repository releases.",
    parameters: [
      {
        name: "owner",
        in: "path",
        required: true,
        schema: { type: "string", example: "unjs" },
      },
      {
        name: "repo",
        in: "path",
        required: true,
        schema: { type: "string", example: "ofetch" },
      },
      {
        name: "page",
        in: "query",
        required: false,
        schema: { type: "number", example: "2" },
      },
    ],
  },
});

export default defineHandler(async (event) => {
  const { page } = getQuery(event);
  // first validating page, if it's present make sure it's a positive interger, else throw an http error to prevent a cache
  const pageNr = Number(page);
  if (page && (!Number.isInteger(pageNr) || pageNr < 1)) {
    throw new HTTPError("`page` can only be 1 or higher interger or omitted", { status: 400 });
  }
  // return typeof page;
  const repo = `${event.context.params!.owner}/${event.context.params!.repo}`;
  const res = await ghFetch(withQuery(`/repos/${repo}/releases`, { page: pageNr }));

  const releases = res.map(
    (i: any) =>
      <GithubRelease>{
        id: i.id,
        tag: i.tag_name,
        author: i.author.login,
        name: i.name,
        draft: i.draft,
        prerelease: i.prerelease,
        createdAt: i.created_at,
        publishedAt: i.published_at,
        markdown: i.body,
        html: "",
        assets:
          "assets" in i
            ? i.assets.map((a: any) => ({
                contentType: a.content_type,
                size: a.size,
                createdAt: a.created_at,
                updatedAt: a.updated_at,
                downloadCount: a.download_count,
                downloadUrl: a.browser_download_url,
              }))
            : [],
      },
  );

  await Promise.all(
    releases.map(async (release: any) => {
      release.html = await ghMarkdown(release.markdown, repo, "release-" + release.tag);
    }),
  );

  return {
    releases,
  };
});
