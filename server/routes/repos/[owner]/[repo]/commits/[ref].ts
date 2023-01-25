import { ghRepoCommit } from '~/utils/github'
import type { GithubCommit } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoCommit(`${event.context.params.owner}/${event.context.params.repo}`, event.context.params.ref)

  const commit = <GithubCommit>{
    sha: res.sha,
    parents: (res.parents || []).map(j => j.sha),
    stats: res.stats,
    files: (res.files || []).map(j => j.filename) // should use ghRepoFiles
  }

  return {
    commit
  }
})
