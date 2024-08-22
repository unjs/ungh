export interface GithubRepo {
  id: number;
  name: string;
  repo: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  stars: number;
  watchers: number;
  forks: number;
  defaultBranch: string;
}

export interface GithubOrg {
  id: number;
  name: string;
  description: string;
}

export interface GithubUser {
  id: string;
  username: string;
  name: string;
  twitter: string;
  avatar: string;
}

export interface GithubContributor {
  id: string;
  username: string;
  contributions: number;
}

export interface GithubFile {
  path: string;
  mode: string;
  sha: string;
  size: number;
}

export interface GithubReleaseAsset {
  contentType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  downloadCount: number;
  downloadUrl: string;
}

export interface GithubRelease {
  id: number;
  tag: string;
  author: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  createdAt: string;
  publishedAt: string;
  markdown: string;
  html: string;
  assets: GithubReleaseAsset[];
}

export interface GithubFileData {
  contents: string;
  html?: string;
}

export interface GitHubBranches {
  name: string;
  commit: string;
  protected: boolean;
  protection: string;
  protection_url: string;
}
