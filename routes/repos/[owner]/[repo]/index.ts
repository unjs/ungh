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
  const { repository } = await ghGraphql(
    /* GraphQL */ `
      query RepoInfo($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          databaseId
          name
          nameWithOwner
          description
          createdAt
          updatedAt
          pushedAt
          stargazerCount
          watchers {
            totalCount
          }
          forkCount
          issues(states: OPEN) {
            totalCount
          }
          pullRequests(states: OPEN) {
            totalCount
          }
          defaultBranchRef {
            name
          }
        }
      }
    `,
    {
      owner: event.context.params.owner,
      name: event.context.params.repo,
    },
  );

  const repo = <GithubRepo>{
    id: repository.databaseId,
    name: repository.name,
    repo: repository.nameWithOwner,
    description: repository.description,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
    pushedAt: repository.pushedAt,
    stars: repository.stargazerCount,
    watchers: repository.watchers.totalCount,
    forks: repository.forkCount,
    issues: repository.issues.totalCount,
    pullRequests: repository.pullRequests.totalCount,
    defaultBranch: repository.defaultBranchRef.name,
  };

  return {
    repo,
  };
});
