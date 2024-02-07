import { Endpoints } from "@octokit/types";
import type { GithubOrg } from "~types";
import { ghFetch } from "~/utils/github";

export default eventHandler(async (event) => {
  const org = await ghFetch<
    Endpoints["GET /orgs/{org}"]['response']['data']
  >(`orgs/${event.context.params.owner}`);

  return {
    org: <GithubOrg>{
      id: org.id,
      name: org.name,
      description: org.description,
    },
  };
});
