**Important:** Keep `AGENTS.md` updated.

This project is based on [Nitro](https://nitro.build) v3, [h3](https://h3.dev/), [Vite](https://vite.dev/) and [rolldown](https://rolldown.rs/).

## Deep Dives

- @.agents/GH_API.md — GitHub API token system, rate-limit tracking, cached fetch layer

## Project Structure

`routes/` contains route handlers. `utils/` has shared utilities (`github.ts` for GitHub API, `markdown.ts` for markdown processing). `types/` for shared types. `public/` holds static assets. Config: `nitro.config.ts` (kv, routeRules, openAPI, `rolldownConfig.tsconfig: true` so rolldown resolves tsconfig `paths` — Nitro defaults it to `false`), `tsconfig.json` (extends `nitro/tsconfig`, `~/*` path alias).

## Conventions

- Path alias `~/*` (tsconfig), imports use extensionless paths (e.g. `~/utils/github`)
- Route handlers use `defineHandler()` from `nitro`
- Cached route handlers use `defineCachedHandler()` from `nitro/cache`
- Route file patterns: `[param]` for dynamic, `[...slug]` for catch-all, `.get.ts`/`.post.ts` for method-specific, `(group)/` ignored in path
- Environment-specific routes: `.dev.ts` / `.prod.ts` suffixes

## Nitro Usage

Docs: https://nitro.build (the RC no longer ships docs in `node_modules/nitro/skills/`). Bundled type definitions in `./node_modules/nitro/dist/types/index.d.mts` are authoritative — check them for `@deprecated` markers.

**Imports from `nitro`:**

- `defineConfig(config)` — Nitro config (`defineNitroConfig` from `nitro/config` is deprecated)
- `defineHandler(handler)` — Route handler with type inference
- `definePlugin(plugin)` — Server lifecycle plugin (hooks: `request`, `response`, `error`, `close`)
- `defineRouteMeta(meta)` — Route metadata (openAPI docs)
- `defineTask({ meta, run })` — Background tasks (requires `experimental: { tasks: true }`)

**Imports from `nitro/*`:**

- `defineCachedHandler(handler, opts)` / `defineCachedFunction(fn, opts)` from `nitro/cache` — Response/function caching (option types: `CachedHandlerOptions` / `CachedFunctionOptions` from `nitro/types`; `CacheOptions` is deprecated)
- `useRuntimeConfig()` from `nitro/runtime-config` — Access runtime config (env vars)
- `serverFetch(url, opts)` from `nitro/app` — Internal/external fetch (replaces `$fetch`)
- `getQuery`, `getRouterParam`, `redirect`, `HTTPError` from `nitro/h3` — H3 utilities
- `useKV(base?)` from `nitro/kv` — KV storage (`getItem`, `setItem`, `removeItem`, `getKeys`); `useStorage` from `nitro/storage` is deprecated
- `useDatabase()` from `nitro/database` — SQL via tagged template (requires `experimental: { database: true }`)
- `runTask(name, { payload })` from `nitro/task` — Programmatic task execution

**Request Lifecycle:**

1. Plugins `request` hook → 2. Static assets → 3. Route rules → 4. Global middleware → 5. Route-scoped middleware → 6. Route handler → 7. Server entry fallback → 8. Renderer (SPA/SSR) → 9. Plugins `response` hook

**Config (`nitro.config.ts`):**

- `routeRules` — Per-route pattern headers, redirects, proxy, cache, basicAuth
- `$development` / `$production` — Environment-specific config. `$production` applies on every `nitro build`; prefer it over `std-env`'s `isProduction` (checks `NODE_ENV`, which is not set during `nitro build` or Vercel builds)
- `kv` — KV mount config (unstorage drivers; requires `unstorage` installed). Dev overrides go in `$development: { kv }`. `storage` / `devStorage` are deprecated
- `cache` — Cache storage `driver` (`memory` | `fs` | `kv`; defaults to `kv` when a `/cache` kv mount exists) + global `defaults`
- `prerender: { routes, crawlLinks }` — Static pre-rendering
- `traceDeps` — Externalize bundler-incompatible deps (traced into build output)

**`import.meta.*` (server-side flags):** `dev`, `preset`, `prerender`, `nitro`, `server`, `client`, `baseURL`

**Nitro v3 / H3 v2 new conventions:** `nitropack/runtime/*` → `nitro/*` (e.g. `nitro/kv`, `nitro/task`, `nitro/types`); all h3 imports from `nitro/h3`; `eventHandler()`/`defineEventHandler()` → `defineHandler()`; `createError()`/`H3Error` → `HTTPError`; `event.path` → `event.url.pathname`; `event.web` → `event.req` (native `Request`); body via `event.req.json()`/`.text()`/`.formData()`; headers via `event.req.headers.get()`/`event.res.headers.set()`; status via `event.res.status`; always `return` values (`return redirect(loc, code)`); `sendError()` → `throw HTTPError`; `sendNoContent()` → `return noContent()`; `useAppConfig()` removed.

## Package Manager

pnpm 11 enforces `minimumReleaseAge` (default 1440 min, also on Vercel CI). `pnpm-workspace.yaml` holds version-scoped `minimumReleaseAgeExclude` entries for fresh releases that must ship immediately — remove them once the release is older than a day.
