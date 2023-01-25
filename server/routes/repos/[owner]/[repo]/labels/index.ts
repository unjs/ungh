import { ghRepoLabels } from '~/utils/github'
import type { GithubLabel } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoLabels(`${event.context.params.owner}/${event.context.params.repo}`)

  const labels = res.map(i => (<GithubLabel>{
    id: i.id,
    name: i.name,
    color: i.color,
    default: i.default,
    description: i.description
  }))

  return {
    labels
  }
})
