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

export interface GithubUser {
  id: string
  username: string
}

export interface GithubContributor {
  id: string
  username: string
  contributions: number
}

export interface GithubFile {
  path: string,
  mode: string,
  sha: string,
  size: number
}

export interface GithubCommit {
  sha: string
  parents?: GithubCommit[]
  stats?: {
    total?: number
    additions?: number
    deletions?: number
  };
  files?: GithubFile[]
}

export interface GithubRelease {
  id: number
  tag: string
  author: string
  name: string
  draft: boolean
  prerelease: boolean
  createdAt: string
  publishedAt: string
  markdown: string
  html: string
}

export interface GithubFileData {
  contents: string
  html?: string
}
