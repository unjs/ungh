import { defineRouteMeta, defineHandler } from "nitro";
import { ghRepoContributors } from "~/utils/github";
import type { GithubContributor } from "~types";

defineRouteMeta({
  openAPI: {
    description: "Get repository contributors.",
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

export default defineHandler(async (event) => {
  const res = await ghRepoContributors(
    `${event.context.params!.owner}/${event.context.params!.repo}`,
  );

  const contributors = res.map(
    (i: any) =>
      <GithubContributor>{
        id: i.id,
        username: i.login,
        contributions: i.contributions || 0,
      },
  );

  return {
    contributors,
  };
});
