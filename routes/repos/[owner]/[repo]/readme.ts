const GH_PATH_URL = "https://github.com";
const GH_RAW_URL = "https://raw.githubusercontent.com";

export default cachedEventHandler(
  async (event) => {
    const repo = `${event.context.params.owner}/${event.context.params.repo}`;
    const defaultBranch = await ghRepo(repo).then(
      (r) => r.default_branch || "main",
    );

    const linkOptions = {
      cdnBaseURL: `${GH_RAW_URL}/${repo}/${defaultBranch}`,
      githubBaseURL: `${GH_PATH_URL}/${repo}/tree/${defaultBranch}`,
    };
    const res = await $fetch<string>(`${linkOptions.cdnBaseURL}/README.md`);
    const markdown = resolveMarkdownRelativeLinks(res, linkOptions);
    const html = await ghMarkdown(markdown, repo, "readme");

    return {
      markdown,
      html,
    };
  },
  {
    group: "gh",
    name: "readme",
    swr: true,
    maxAge: 60 * 60 * 6, // 6 hours
    staleMaxAge: 60 * 60 * 12, // 12 hours
  },
);
