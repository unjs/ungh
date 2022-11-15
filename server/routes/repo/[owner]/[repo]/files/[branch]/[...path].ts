import { ghMarkdown } from '~/utils/github'
import type { GithubFileData } from '~types'

export default eventHandler(async (event) => {
  const repo = `${event.context.params.owner}/${event.context.params.repo}`
  const url = `https://raw.githubusercontent.com/${repo}/${event.context.params.branch}/${event.context.params.path}`
  const contents = await $fetch(url) as string

  const file: GithubFileData = { contents }

  if (url.endsWith('.md')) {
    file.html = await ghMarkdown(contents, repo)
  }

  return {
    meta: { url },
    file
  }
})
