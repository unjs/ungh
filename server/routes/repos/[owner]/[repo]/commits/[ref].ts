import { ghRepoCommit } from '~/utils/github'
import type { GithubCommit, GithubFile } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoCommit(`${event.context.params.owner}/${event.context.params.repo}`, event.context.params.ref)

  const commit = <GithubCommit>{
    ...res,
    sha: res.sha,
    files: (res.files || []).map(f => (<GithubFile>{ ...f, path: f.filename }))
  }

  return {
    commit
  }
})
