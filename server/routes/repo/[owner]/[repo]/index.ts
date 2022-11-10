import { ghRepo } from '~/utils/github'
import type { GithubRepo } from '~types'

export default eventHandler(async (event) => {
  const rawRepo = await ghRepo(`${event.context.params.owner}/${event.context.params.repo}`)
  const releaseObj = await ghRepo(`${event.context.params.owner}/${event.context.params.repo}/releases/latest`)

  rawRepo.release = {
    id: releaseObj.id,
    tag: releaseObj.tag_name
  }

  const repo = <GithubRepo> {
    id: rawRepo.id,
    name: rawRepo.name,
    repo: rawRepo.full_name,
    description: rawRepo.description,
    createdAt: rawRepo.created_at,
    updatedAt: rawRepo.updated_at,
    pushedAt: rawRepo.pushed_at,
    stars: rawRepo.stargazers_count,
    watchers: rawRepo.watchers,
    forks: rawRepo.forks,
    release: rawRepo.release
  }

  return {
    repo
  }
})
