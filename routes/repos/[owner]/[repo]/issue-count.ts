defineRouteMeta({
  openAPI: {
    description: "Get repository open issues count.",
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

export default eventHandler(async (event) => {
  const res = await ghFetch(
    `/search/issues?q=repo:${event.context.params.owner}/${event.context.params.repo}+type:issue+state:open&per_page=1`,
  );

  const count = res.total_count;

  return {
    count,
  };
});
