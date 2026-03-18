import { defineRouteMeta, defineHandler } from "nitro";
import { ghRepoFiles } from "~/utils/github";
import type { GithubFile } from "~types";

defineRouteMeta({
  openAPI: {
    description: "(disabled - redirects to raw.githubusercontent.com)",
    tags: ["hidden"],
  },
});

export default defineHandler(async (event) => {
  const repo = `${event.context.params!.owner}/${event.context.params!.repo}`;
  const res = await ghRepoFiles(repo, event.context.params!.branch as string);

  const files = res.tree
    .filter((i: any) => i.type === "blob")
    .map(
      (i: any) =>
        <GithubFile>{
          path: i.path,
          mode: i.mode,
          sha: i.sha,
          size: i.size,
        },
    );

  return {
    meta: {
      sha: res.sha,
    },
    files,
  };
});
