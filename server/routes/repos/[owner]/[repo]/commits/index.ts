import { ghRepoCommits } from '~/utils/github'
import type { GithubCommit } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoCommits(`${event.context.params.owner}/${event.context.params.repo}`)

  const commits = res.map(i => (<GithubCommit>{
    sha: i.sha,
    parents: (i.parents || []).map(j => j.sha),
    stats: i.stats,
    files: (i.files || []).map(j => j.filename) // should use ghRepoFiles
  }))

  return {
    commits
  }
})
