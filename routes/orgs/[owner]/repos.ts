import type { GithubRepo } from "~types";

defineRouteMeta({
  openAPI: {
    description: "GitHub organization repositories overview.",
    parameters: [
      {
        name: "owner",
        in: "path",
        required: true,
        schema: { type: "string", example: "unjs" },
      },
    ],
  },
});

export default eventHandler(async (event) => {
  // TODO: Do pagination
  const rawRepos = await ghFetch(
    `orgs/${event.context.params.owner}/repos?per_page=100`,
  );

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
