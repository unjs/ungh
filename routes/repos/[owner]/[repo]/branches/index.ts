import type { GitHubBranches } from "~types";

defineRouteMeta({
  openAPI: {
    description: "Get all the branches of a repository.",
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

export default eventHandler(async (event) => {
  const repo = `${event.context.params.owner}/${event.context.params.repo}`;
  const res = await ghFetch(`/repos/${repo}/branches`);

  const branches = res.map(
    (i) =>
      <GitHubBranches>{
        name: i.name,
        commit: i.commit,
        protected: i.protected,
      },
  );

  return { branches };
});
