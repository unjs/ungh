import type { GithubRepo } from "~types";

defineRouteMeta({
  openAPI: {
    description: "Get user repositories.",
    parameters: [
      {
        name: "name",
        in: "path",
        required: true,
        schema: { type: "string", example: "pi0" },
      },
    ],
  },
});

export default eventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  // TODO: Do pagination
  const rawRepos = await ghFetch(`users/${name}/repos?per_page=100`);

  const repos = rawRepos.map(
    (rawRepo) =>
      <GithubRepo>{
        id: rawRepo.id,
        name: rawRepo.name,
        repo: rawRepo.full_name,
        description: rawRepo.description,
        createdAt: rawRepo.created_at,
        updatedAt: rawRepo.updated_at,
        pushedAt: rawRepo.pushed_at,
        stars: rawRepo.stargazers_count,
        watchers: rawRepo.watchers,
        forks: rawRepo.forks,
        defaultBranch: rawRepo.default_branch,
      },
  );

  return {
    repos,
  };
});
