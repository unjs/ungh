# 🐙 UNGH

> Unlimited access to GitHub API

## Why UNGH?

Accessing to open source GitHub repository meta-data should be fast, easy, and straightforward. GitHub API is rate limited and requires an authentication token to increase limits. Even by using an API token, we need to share or generate it for each deployment and local development of apps and also deal with (increased) rate limits and deployment caching. GitHub REST API is also complex with (unnecessary) bigger payloads because of backward compatibility.

UNGH provides a simplified, cached, and anonymous layer to make GitHub API more enjoyable!

## Roadmap

- [x] Hosted MVP service (powered by cloudflare workers and KV)
- [ ] Publish `ungh` js client to NPM
- [ ] Implement token pool and open token donations
- [ ] Implement `/contributors` endpoint

**Note:** This project is still under development and API might change.

## API

### `/repo/{owner}/{name}`

GitHub repository information.

**Example:** https://ungh.unjs.io/repo/unjs/h3

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
    "forks": 59
  }
}
```

### `/repo/{owner}/{name}/contributors`

Get repository contributors.

**Example:** https://ungh.unjs.io/repo/unjs/h3/contributors

```json
{
  "stats": {
    "count": 28
  },
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

### `/org/{owner}`

GitHub organization information.

**Example:** https://ungh.unjs.io/org/unjs

```json
{
  "org": {
    "id": 80154025,
    "name": "unjs",
    "description": "Unified JavaScript Tools"
  },
}
```

### `/org/{owner}/repos`

GitHub organization repositories overview and overall stats.

**Example:** https://ungh.unjs.io/org/unjs/repos

```json
{
  "stats": {
    "count": 30,
    "totalStars": 12708
  },
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

**Example:** https://ungh.unjs.io/stars/nuxt/nuxt.js+nuxt/framework

```json
{
  "totalStars": 51524,
  "stars": {
    "nuxt/nuxt.js": 41560,
    "nuxt/framework": 9964
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
