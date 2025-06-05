import type { GithubUser } from "~types";

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
      company: user.company,
      location: user.location,
      blog: user.blog,
      email: user.email,
    },
  };
});
