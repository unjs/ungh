// import { hash } from "ohash";
// import type { GithubFileData } from "~types";

defineRouteMeta({
  openAPI: {
    description: "(disabled - redirects to raw.githubusercontent.com)",
  },
});

export default eventHandler(async (event) => {
  const repo = `${event.context.params.owner}/${event.context.params.repo}`;
  const ref = `${event.context.params.branch}/${event.context.params.path}`;
  const url = `https://raw.githubusercontent.com/${repo}/${ref}`;
  return sendRedirect(event, url, 302);
  // const contents = await $fetch<string>(url);

  // const file: GithubFileData = { contents };

  // if (url.endsWith(".md")) {
  //   file.html = await ghMarkdown(contents, repo, "file-" + hash(ref));
  // }

  // return {
  //   meta: { url },
  //   file,
  // };
});
