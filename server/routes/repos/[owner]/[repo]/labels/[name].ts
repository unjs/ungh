import { ghRepoLabel } from '~/utils/github'
import type { GithubLabel } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoLabel(`${event.context.params.owner}/${event.context.params.repo}`, event.context.params.name)

  const label = <GithubLabel>{
    id: res.id,
    name: res.name,
    color: res.color,
    default: res.default,
    description: res.description
  }

  return {
    label
  }
})
