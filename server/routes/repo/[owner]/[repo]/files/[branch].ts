import { ghRepoFiles } from '~/utils/github'
import type { GithubFile } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoFiles(`${event.context.params.owner}/${event.context.params.repo}`, event.context.params.branch)

  const files = res.tree.filter(i => i.type === 'blob').map(i => (<GithubFile> {
    path: i.path,
    mode: i.mode,
    sha: i.sha,
    size: i.size
  }))

  return {
    meta: {
      sha: res.sha
    },
    files
  }
})
