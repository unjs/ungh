import type { GithubRepo } from "~types";

defineRouteMeta({
  openAPI: {
    description: "Get repository info.",
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
    watchers: rawRepo.subscribers_count,
    forks: rawRepo.forks,
    issueAndPullCount: rawRepo.open_issues_count,
    defaultBranch: rawRepo.default_branch,
  };

  return {
    repo,
  };
});
