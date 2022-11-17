import { ghRepo } from '~/utils/github'

export default eventHandler(async (event) => {
  const repoSources = await Promise.all(
    (event.context.params.repos || '').split(/[, +]/).map(async (p) => {
      p = p.trim()
      if (p.endsWith('/*')) {
        const org = p.split('/')[0]
        const repos = await $fetch(`/orgs/${org}/repos`).then(r => r.repos.map(r => r.repo))
        return repos
      }
      return p
    })
  ).then(r => r.flat())

  const starsArr = await Promise.all(repoSources.map((source) => {
    return ghRepo(source).then(repo => [source, repo.stargazers_count])
  }))

  const stars = Object.fromEntries(starsArr)
  const totalStars = starsArr.reduce((c, r) => c + r[1], 0)

  return {
    totalStars,
    stars
  }
})
