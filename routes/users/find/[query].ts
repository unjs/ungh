import type { GithubUser } from "~types";

defineRouteMeta({
  openAPI: {
    description: "Get user repositories.",
    parameters: [
      {
        name: "query",
        in: "path",
        required: true,
        schema: { type: "string", example: "pooya@pi0.io" },
      },
    ],
  },
});

const anonEmailRegex = /^(?:\d+\+)?(.+)@users.noreply.github.com$/;

export default eventHandler(async (event) => {
  let query = event.context.params.query + "";

  const anonMatch = query.match(anonEmailRegex);
  if (anonMatch) {
    query = anonMatch[1];
  }

  const res = await ghFetch("/search/users", {
    params: { q: query },
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
    name: res.items[0].name,
    twitter: res.items[0].twitter_username,
    avatar: res.items[0].avatar_url,
  };

  return { user };
});
