import { Endpoints } from "@octokit/types";
import { ghFetch, ghMarkdown } from "~/utils/github";
import type { GithubRelease } from "~types";

export default eventHandler(async (event) => {
  const repo = `${event.context.params.owner}/${event.context.params.repo}`;
  const res = await ghFetch<
    Endpoints["GET /repos/{owner}/{repo}/releases"]['response']['data']
  >(`/repos/${repo}/releases`);

  const releases = res.map(
    (i) =>
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
      }
  );

  await Promise.all(
    releases.map(async (release) => {
      release.html = await ghMarkdown(
        release.markdown,
        repo
      );
    })
  );

  return {
    releases,
  };
});
