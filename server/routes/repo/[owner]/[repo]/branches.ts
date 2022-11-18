import { ghRepoBranches } from '~/utils/github'
import type { GithubBranches } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoBranches(`${event.context.params.owner}/${event.context.params.repo}`)

  const branches = res.map(i => (<GithubBranches>{
    name: i.name,
    commit: i.commit,
    protected: i.protected
  }))

  return {
    branches
  }
})
