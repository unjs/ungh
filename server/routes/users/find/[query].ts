import { Endpoints } from "@octokit/types";
import type { GithubUser } from "~types";
import { ghFetch } from "~/utils/github";

export default eventHandler(async (event) => {
  const res = await ghFetch<
    Endpoints["GET /search/users"]['response']['data']
  >("/search/users", {
    params: { q: event.context.params.query },
  });

  if (res.items.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: "User Not Found",
    });
  }

  const user = <GithubUser>{
    id: res.items[0].id,
    username: res.items[0].login,
  };

  return { user };
});
