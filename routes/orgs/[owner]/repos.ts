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
  const query = getQuery(event);
  const page = query.page ? Number(query.page) : 1;
  const perPage = query.perPage ? Number(query.perPage) : 100;

  const owner = getRouterParam(event, "owner");

  const { _data: rawRepos, headers } = await ghPagination(
    `orgs/${owner}/repos`,
    page,
    perPage,
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

  setResponseHeader(event, "Link", headers.Link);
  return {
    repos,
  };
});
