import { ghFetch } from '~/utils/github'
import { apiResponse } from '~/utils/response'
import type { GithubRepo } from '~types'

export default eventHandler(async (event) => {
  const rawRepos = await ghFetch(`orgs/${event.context.params.owner}/repos`)

  const repos = rawRepos.map(rawRepo => (<GithubRepo> {
    id: rawRepo.id,
    name: rawRepo.name,
    repo: rawRepo.full_name,
    description: rawRepo.description,
    createdAt: rawRepo.created_at,
    updatedAt: rawRepo.updated_at,
    pushedAt: rawRepo.pushed_at,
    stars: rawRepo.stargazers_count,
    watchers: rawRepo.watchers,
    forks: rawRepo.forks
  }))

  const stats = {
    count: repos.length,
    totalStars: repos.reduce((acc, repo) => acc + repo.stars, 0)
  }

  return apiResponse(event, {
    stats,
    repos
  })
})
