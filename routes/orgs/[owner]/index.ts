import type { GithubOrg } from "~types";

defineRouteMeta({
  openAPI: {
    description: "GitHub organization information.",
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
  const org = await ghFetch(`orgs/${event.context.params.owner}`);

  return {
    org: <GithubOrg>{
      id: org.id,
      name: org.name,
      description: org.description,
    },
  };
});
