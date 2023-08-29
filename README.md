# 🐙 UNGH

> Unlimited access to GitHub API

## Why UNGH?

Accessing to open source GitHub repository meta-data should be fast, easy, and straightforward. GitHub API is rate limited and requires an authentication token to increase limits. Even by using an API token, we need to share or generate it for each deployment and local development of apps and also deal with (increased) rate limits and deployment caching. GitHub REST API is also complex with (unnecessary) bigger payloads because of backward compatibility.

UNGH provides a simplified, cached, and anonymous layer to make GitHub API more enjoyable!

## Roadmap

- [x] Hosted MVP service (powered by cloudflare workers and KV)
- [ ] Publish `ungh` js client to NPM ([#4](https://github.com/unjs/ungh/issues/4))
- [ ] Implement token pool and open token donations ([#5](https://github.com/unjs/ungh/issues/5))
- [ ] Mark API as stable

**Note:** This project is still under development and API might change.

## API

### `/repos/{owner}/{name}`

GitHub repository information.

**Example:** https://ungh.cc/repos/unjs/h3

```json
{
  "repo": {
    "id": 313641207,
    "name": "h3",
    "repo": "unjs/h3",
    "description": "Minimal h(ttp) framework built for high performance and portability ⚡️",
    "createdAt": "2020-11-17T14:15:44Z",
    "updatedAt": "2022-11-05T21:38:43Z",
    "pushedAt": "2022-11-06T06:48:23Z",
    "stars": 1168,
    "watchers": 1168,
    "forks": 59,
    "defaultBranch": "main"
  }
}
```

### `/repos/{owner}/{name}/contributors`

Get repository contributors.

**Example:** https://ungh.cc/repos/unjs/h3/contributors

```json
{
  "contributors": [
    {
      "id": 5158436,
      "username": "pi0",
      "contributions": 243
    },
    {
      "id": 29139614,
      "username": "renovate[bot]",
      "contributions": 41
    }
  ]
}
```

### `/repos/{owner}/{name}/files/{branch}`

Get repository files tree on specific branch.

**Example:** https://ungh.cc/repos/unjs/h3/files/main

```json
{
  "meta": {
    "sha": "501f0c6e623ea827d47691046f3c7319f5ac4651"
  },
  "files": [
    {
      "path": "README.md",
      "mode": "100644",
      "sha": "4c2b9ce4bccd6e046cd71be1a8c5e53a62778858",
      "size": 5782
    }
  ]
}
```

### `/repos/{owner}/{name}/files/{branch}/{...path}`

Get file contents from a repository. If path ends with `.md`, an additional `html` field with rendered markup will be appended.

**Example:** https://ungh.cc/repos/unjs/h3/files/main/README.md

```json
{
  "meta": {
    "url": "https://raw.githubusercontent.com/unjs/h3/main/README.md"
  },
  "file": {
    "contents": "...",
    "html": "..."
  }
}
```

### `/repos/{owner}/{name}/readme`

Get repository readme file on main branch (not cached)

**Example:** https://ungh.cc/repos/unjs/h3/readme

```json
{
  "html": "<p><a href=\"https://npmjs.com/package/h3\" rel=\"nofollow\"><img...",
  "markdown": "[![npm downloads](https://img.shields.io...."
}
```

### `/repos/{owner}/{name}/releases`

Get repository releases.

**Example:** https://ungh.cc/repos/nuxt/framework/releases

```json
{
  "releases": [
    {
      "id": 82066265,
      "tag": "v3.0.0-rc.13",
      "author": "pi0",
      "name": "v3.0.0-rc.13",
      "draft": false,
      "prerelease": false,
      "createdAt": "2022-11-04T11:37:49Z",
      "publishedAt": "2022-11-04T11:41:59Z",
      "markdown": "....",
      "html": "..."
    }
  ]
}
```

### `/repos/{owner}/{name}/releases/latest`

Get latest repository release.

**Example:** https://ungh.cc/repos/nuxt/framework/releases/latest

```json
{
  "release": {
    "id": 82066265,
    "tag": "v3.0.0-rc.13",
    "author": "pi0",
    "name": "v3.0.0-rc.13",
    "draft": false,
    "prerelease": false,
    "createdAt": "2022-11-04T11:37:49Z",
    "publishedAt": "2022-11-04T11:41:59Z",
    "markdown": "....",
    "html": "..."
  }
}
```

### `/repos/{owner}/{name}/branches`

Get all the branches of a repository

**Example:** https://ungh.cc/repos/unjs/ungh/branches

```json
{
  "branches": [
    {
      "name": "main",
      "commit": {
        "sha": "2eb6bff64caf0d18f082adde7606c4702513870b",
        "url": "https://api.github.com/repos/unjs/ungh/commits/2eb6bff64caf0d18f082adde7606c4702513870b"
      },
      "protected": true
    },
    {
      "name": "renovate/all-minor-patch",
      "commit": {
        "sha": "61140d05f66cd6b217f2475ad84e2d251ed7de05",
        "url": "https://api.github.com/repos/unjs/ungh/commits/61140d05f66cd6b217f2475ad84e2d251ed7de05"
      },
      "protected": false
    },
    {
      "name": "renovate/typescript-5.x",
      "commit": {
        "sha": "19b23fca2088722bbb41a7238bf8bd5272799718",
        "url": "https://api.github.com/repos/unjs/ungh/commits/19b23fca2088722bbb41a7238bf8bd5272799718"
      },
      "protected": false
    }
  ]
}
```

### `/orgs/{owner}`

GitHub organization information.

**Example:** https://ungh.cc/orgs/unjs

```json
{
  "org": {
    "id": 80154025,
    "name": "unjs",
    "description": "Unified JavaScript Tools"
  }
}
```

### `/orgs/{owner}/repos`

GitHub organization repositories overview.

**Example:** https://ungh.cc/orgs/unjs/repos

```json
{
  "repos": [
    {
      "id": 97751746,
      "name": "redirect-ssl",
      "repo": "unjs/redirect-ssl",
      "description": "Connect/Express middleware to enforce https using is-https",
      "createdAt": "2017-07-19T19:04:11Z",
      "updatedAt": "2022-09-22T09:47:25Z",
      "pushedAt": "2022-04-08T20:29:48Z",
      "stars": 93,
      "watchers": 93,
      "forks": 14
    }
  ]
}
```

### `/stars/{repos}`

Get star information for one or more repositories or organizations.

Multiple items can be separated by either `,` or `+` or ` ` (space). Each item can be either `{owner}/{org}` to specify one repository or `{owner}/*` to specify all organization repositories.

**Example:** https://ungh.cc/stars/nuxt/nuxt.js+nuxt/framework

```json
{
  "totalStars": 51524,
  "stars": {
    "nuxt/nuxt.js": 41560,
    "nuxt/framework": 9964
  }
}
```

### `/users/find/{query}`

Find one github user by email or other query.

**Example:** https://ungh.cc/users/find/pooya@pi0.io

```json
{
  "user": {
    "id": 5158436,
    "username": "pi0"
  }
}
```

## 💻 Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable` (use `npm i -g corepack` for Node.js < 16.10)
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

## License

Made with 💛

Published under [MIT License](./LICENSE).
