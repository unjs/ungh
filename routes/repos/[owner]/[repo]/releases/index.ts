import type { GithubRelease } from "~types";

export default eventHandler(async (event) => {
  const repo = `${event.context.params.owner}/${event.context.params.repo}`;
  const res = await ghFetch(`/repos/${repo}/releases`);

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
        assets: 'assets' in i
          ? i.assets.map((a) => ({
            contentType: a.content_type,
            size: a.size,
            createdAt: a.created_at,
            updatedAt: a.updated_at,
            downloadCount: a.download_count,
            downloadUrl: a.browser_download_url,
          }))
          : []
      },
  );

  await Promise.all(
    releases.map(async (release) => {
      release.html = await ghMarkdown(
        release.markdown,
        repo,
        "release-" + release.tag,
      );
    }),
  );

  return {
    releases,
  };
});
