import { defineRouteMeta, defineHandler } from "nitro";
import { ghFetch, ghMarkdown } from "~/utils/github";
import type { GithubRelease } from "~types";

defineRouteMeta({
  openAPI: {
    description: "Get repository release by tag.",
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
        name: "tag",
        in: "path",
        required: true,
        schema: { type: "string", example: "v1.5.0" },
      },
    ],
  },
});

export default defineHandler(async (event) => {
  const repo = `${event.context.params!.owner}/${event.context.params!.repo}`;
  const tag = event.context.params!.tag;
  const i = await ghFetch(`repos/${repo}/releases/tags/${tag}`);

  const release: GithubRelease = {
    id: i.id,
    tag: i.tag_name,
    author: i.author.login,
    name: i.name,
    draft: i.draft,
    prerelease: i.prerelease,
    createdAt: i.created_at,
    publishedAt: i.published_at,
    markdown: i.body,
    html: await ghMarkdown(i.body, repo, "release-" + i.tag),
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
  };

  return {
    release,
  };
});
