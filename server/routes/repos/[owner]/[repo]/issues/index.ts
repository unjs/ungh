import { ghRepoIssues } from '~/utils/github'
import type { GithubIssue } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoIssues(`${event.context.params.owner}/${event.context.params.repo}`)

  const issues = res as GithubIssue[]

  return {
    issues
  }
})
