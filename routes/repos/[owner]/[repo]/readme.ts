export default cachedEventHandler(
  async (event) => {
    const repo = `${event.context.params.owner}/${event.context.params.repo}`;
    const defaultBranch = await ghRepo(repo).then(
      (r) => r.default_branch || "main",
    );
    const markdown = await $fetch<string>(
      `https://raw.githubusercontent.com/${repo}/${defaultBranch}/README.md`,
    );
    const html = await ghMarkdown(markdown, repo, "readme");
    return {
      html,
      markdown,
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
