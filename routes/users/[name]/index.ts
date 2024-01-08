import type { GithubUser } from "~types";

export default eventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  const user = await ghFetch(`users/${name}`);

  return {
    user: <GithubUser>{
      id: user.id,
      username: user.login,
    },
  };
});
