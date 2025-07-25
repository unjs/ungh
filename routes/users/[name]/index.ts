import type { GithubUser } from "~types";

defineRouteMeta({
  openAPI: {
    description: "Find one github user by username.",
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

export default eventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  const user = await ghFetch(`users/${name}`);

  return {
    user: <GithubUser>{
      id: user.id,
      username: user.login,
      name: user.name,
      twitter: user.twitter_username,
      avatar: user.avatar_url,
    },
  };
});
