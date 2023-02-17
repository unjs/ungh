import { hash } from "ohash";
import { ghMarkdown } from "~/utils/github";
import type { GithubFileData } from "~types";

export default eventHandler(async (event) => {
  const repo = `${event.context.params.owner}/${event.context.params.repo}`;
  const ref = `${event.context.params.branch}/${event.context.params.path}`;
  const url = `https://raw.githubusercontent.com/${repo}/${ref}`;
  const contents = (await $fetch(url)) as string;

  const file: GithubFileData = { contents };

  if (url.endsWith(".md")) {
    file.html = await ghMarkdown(contents, repo, "file-" + hash(ref));
  }

  return {
    meta: { url },
    file,
  };
});
