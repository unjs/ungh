import { defineRouteMeta, defineHandler } from "nitro";
import { ghFetch } from "~/utils/github";
import type { GithubOrg } from "~types";

defineRouteMeta({
  openAPI: {
    description: "List GitHub organizations the user is a member of.",
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

export default defineHandler(async (event) => {
  // TODO: Do pagination
  const rawOrgs = await ghFetch(`users/${event.context.params!.name}/orgs?per_page=100`);

  const orgs = rawOrgs.map(
    (rawOrg: any) =>
      <GithubOrg>{
        id: rawOrg.id,
        name: rawOrg.login,
        description: rawOrg.description,
      },
  );

  return {
    orgs,
  };
});
