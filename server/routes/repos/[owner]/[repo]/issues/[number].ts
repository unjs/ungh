import { ghRepoIssue } from '~/utils/github'
import type { GithubIssue } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoIssue(`${event.context.params.owner}/${event.context.params.repo}`, event.context.params.number)

  const issue = res as GithubIssue

  return {
    issue
  }
})
