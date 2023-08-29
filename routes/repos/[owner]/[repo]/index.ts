import type { GithubRepo } from "~types";

export default eventHandler(async (event) => {
  const rawRepo = await ghRepo(
    `${event.context.params.owner}/${event.context.params.repo}`,
  );

  const repo = <GithubRepo>{
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
  };

  return {
    repo,
  };
});
