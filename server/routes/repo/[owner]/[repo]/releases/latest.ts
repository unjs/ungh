import { ghMarkdown, ghFetch } from '~/utils/github'
import type { GithubRelease } from '~types'

export default eventHandler(async (event) => {
  const repo = `${event.context.params.owner}/${event.context.params.repo}`
  const i = await ghFetch(`repos/${repo}/releases/latest`)

  const release: GithubRelease = {
    id: i.id,
    tag: i.tag_name,
    author: i.author.login,
    name: i.name,
    draft: i.draft,
    prerelease: i.prerelease,
    createdAt: i.created_at,
    publishedAt: i.published_at,
    markdown: i.body,
    html: await ghMarkdown(i.body, repo)
  }

  return {
    release
  }
})
