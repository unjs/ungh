const GH_RAW_URL = "https://raw.githubusercontent.com";

defineRouteMeta({
  openAPI: {
    description: "Get repository readme file on main branch (not cached).",
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
    ],
  },
});

export default cachedEventHandler(
  async (event) => {
    const repo = `${event.context.params.owner}/${event.context.params.repo}`;
    const defaultBranch = await ghRepo(repo).then(
      (r) => r.default_branch || "main",
    );
    const cdnBaseURL = `${GH_RAW_URL}/${repo}/${defaultBranch}`;
    const markdown = await $fetch<string>(`${cdnBaseURL}/README.md`);
    const html = await ghMarkdown(markdown, repo, "readme");
    return {
      markdown: resolveMarkdownRelativeLinks(markdown, cdnBaseURL),
      html: resolveMarkdownRelativeLinks(html, cdnBaseURL),
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
