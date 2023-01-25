import { ghRepoIssues } from '~/utils/github'
import type { GithubIssue } from '~types'

export default eventHandler(async (event) => {
  const res = await ghRepoIssues(`${event.context.params.owner}/${event.context.params.repo}`)

  const issues = res.map(i => (<GithubIssue>{
    number: i.number,
    title: i.title,
    user: (i.user || {}).login || i.user,
    labels: (i.labels || []).map(j => j.name),
    state: i.state,
    locked: i.locked,
    commentsCount: i.comments,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    closedAt: i.closed_at,
    body: i.body
  }))

  return {
    issues
  }
})
