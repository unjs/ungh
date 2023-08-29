import type { GitHubBranches } from "~types";

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
