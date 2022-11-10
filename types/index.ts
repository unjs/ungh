export interface GithubRepo {
  id: number
  name: string
  repo: string
  description: string
  createdAt: string
  updatedAt: string
  pushedAt: string,
  stars: number,
  watchers: number,
  forks: number
}

export interface GithubOrg {
  id: number
  name: string
  description: string
}

export interface GithubContributor {
  id: string
  username: string
  contributions: number
}
