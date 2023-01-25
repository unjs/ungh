import { ghRepoIssue } from '~/utils/github'
import type { GithubIssue } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoIssue(`${event.context.params.owner}/${event.context.params.repo}`, event.context.params.number)

  const issue = <GithubIssue>{
    number: res.number,
    title: res.title,
    user: (res.user || {}).login || res.user,
    labels: (res.labels || []).map(j => j.name),
    state: res.state,
    locked: res.locked,
    commentsCount: res.comments,
    createdAt: res.created_at,
    updatedAt: res.updated_at,
    closedAt: res.closed_at,
    body: res.body
  }

  return {
    issue
  }
})
