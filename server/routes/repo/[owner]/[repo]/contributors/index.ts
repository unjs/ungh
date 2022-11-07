import { ghRepoContributors } from '~/utils/github'
import type { GithubContributor } from '~types'

export default eventHandler(async (event) => {
  const contributors = <GithubContributor[]> await ghRepoContributors(`${event.context.params.owner}/${event.context.params.repo}`)

  const totalContributors = contributors.length || 0
  return {
    totalContributors,
    contributors
  }
})
