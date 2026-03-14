import type { GithubOrg  } from "~types";

export default eventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  // TODO: Do pagination
  const rawOrgs = await ghFetch(`users/${name}/orgs?per_page=100`);

  const orgs = rawOrgs.map(
    (rawOrg) =>
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
