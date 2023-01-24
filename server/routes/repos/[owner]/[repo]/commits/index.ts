import { ghRepoCommits } from '~/utils/github'
import type { GithubCommit } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoCommits(`${event.context.params.owner}/${event.context.params.repo}`)

  const commits = res.map(i => (<GithubCommit>{
    ...i,
    sha: i.sha
  }))

  return {
    commits
  }
})
