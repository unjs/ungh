# ungh

> Anonymouse access to cached github APIs without rate limits!

## Why ungh?

Accessing to basic github information should be fast, easy and straightforward. Github API is rate limited and requires an authentication token to increase limits. Even by using an API token, we need to share or generate it for each deployment and local development of apps and also deal with (increased) rate limits and per-deployment caching. Github REST API is also complex with (unnecessary) bigger payloads because of backward compatibility.

UNGH provides a hosted service and client (upcoming) to overcome this limits.

## Roadmap

This project is still under development.

- [ ] Hosted service (MVP)
- [ ] Publish `ungh` client as NPM package
- [ ] Implement token pool
- [ ] Implement `/contributors` endpoint

## API

### `/gh/repo/{owner}/{name}`

Github repository information.

**Example:** /gh/repo/unjs/h3

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

### `/gh/org/{owner}`

Github organization information.

**Example:** /gh/org/unjs

```json
{
  "org": {
    "id": 80154025,
    "name": "unjs",
    "description": "Unified JavaScript Tools"
  },
}
```

### `/gh/org/{owner}/repositories`

Github organization repositories overview and overall stats.

**Example:** /gh/org/unjs/repositories

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
    },
    ...
  ]
}
```

### `/gh/stars/{repos}`

Get stars information for one or more repositories or organizations.

Multiple items can be seperated by either `,` or `+` or ` ` (space). Each item can be either `{owner}/{org}` to specify one repository or `{owner}` to specify all organization repositories.

**Example:** /gh/stars/nuxt/nuxt.js,nuxt/framework

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
