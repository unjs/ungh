defineRouteMeta({
  openAPI: {
    description:
      "Get star information for one or more repositories or organizations. Multiple items can be separated by either , or + or (space). Each item can be either `{owner}/{org}` to specify one repository or `{owner}/*` to specify all organization repositories.",
    parameters: [
      {
        name: "repos",
        in: "path",
        required: true,
        schema: { type: "string", example: "unjs/ofetch+unjs/jiti" },
      },
    ],
  },
});

export default eventHandler(async (event) => {
  const repoSources = await Promise.all(
    (event.context.params.repos || "").split(/[ +,]/).map(async (p) => {
      p = p.trim();
      if (p.endsWith("/*")) {
        const org = p.split("/")[0];
        const repos = await $fetch<{ repos: any[] }>(`/orgs/${org}/repos`).then(
          (r) => r.repos.map((r) => r.repo),
        );
        return repos;
      }
      return p;
    }),
  ).then((r) => r.flat());

  const starsArr = await Promise.all(
    repoSources.map((source) => {
      return ghRepo(source).then((repo) => [source, repo.stargazers_count]);
    }),
  );

  const stars = Object.fromEntries(starsArr);
  const totalStars = starsArr.reduce((c, r) => c + r[1], 0);

  return {
    totalStars,
    stars,
  };
});
