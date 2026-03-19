# GitHub API Token & Request System

## Architecture

Two files handle all GitHub API interaction:

- `utils/github_token.ts` — Token lifecycle (validation, rotation, rate-limit tracking, GitHub App JWT)
- `utils/github.ts` — Cached fetch layer built on top of the token system

## Token Types

1. **PAT tokens** — Loaded from `GH_TOKEN` env var (comma-separated). Created at module load time.
2. **GitHub App tokens** — Generated from `GH_APP_ID` + `GH_APP_PRIVATE_KEY` env vars.
   - JWT signed with RS256 (PKCS#1 and PKCS#8 PEM keys supported)
   - Installation tokens fetched for each app installation
   - Auto-refresh via `setTimeout` 5 minutes before expiry (minimum 1 minute)

## Token Selection (`getGHToken`)

1. Clear expired rate limits (reset time has passed -> wipe remaining/limit/reset)
2. Single-pass scan for `available` token with highest `remaining`

## Token Lifecycle

```
new GHToken(token)          -> valid=undefined, remaining=undefined
  |
validate()                  -> calls GET /meta, sets valid/remaining/limit/reset
  |
updateStatus(response)      -> called on every ghFetch response to keep rate limits current
  |
isStale()                   -> true if: no lastValidated, or >1min since last validation
                               (skips revalidation if reset is still in the future)
  |
clearExpiredLimits()        -> once reset time passes, clears remaining/limit/reset
                               so the token becomes available again (remaining ?? 1 > 0)
```

## Token Acquisition (`acquireGHToken`)

Main entry point used by `ghFetch`. Orchestrates the full flow:

1. `ensureTokensValidated()` — one-time initial validation (idempotent, `once: true`)
2. `getGHToken()` — pick best available token
3. If none available, `revalidateGHTokens()` — re-check stale tokens, then `getGHToken()` again
4. Returns token or `undefined`

## Validation Flow

### `ensureTokensValidated` (normal requests)

Runs once via `idempotent()` wrapper (`once: true` — never re-runs after first call):

1. Validate all PAT tokens and bootstrap App tokens in parallel via `Promise.allSettled`
2. If no token available after validation, falls back to `revalidateGHTokens()`

Subsequent requests rely on `revalidateGHTokens()` (called from `acquireGHToken`) for freshness.

### `ensureAllTokensValidated` (status page only)

Runs once via `idempotent()` wrapper (`once: true`):

1. Validate all PAT tokens in parallel (each calls GET /meta — costs 1 API request)
2. Bootstrap App tokens (JWT -> list installations -> create installation tokens)

## Revalidation (`revalidateGHTokens`)

- Uses `idempotent()` with `once: false` — concurrent callers share one in-flight promise, but settles between calls
- Only revalidates tokens where `isStale()` is true
- Also calls `ensureAppToken()` to refresh app tokens if needed
- Short-circuits if no tokens are stale AND at least one token is available

## Cached Fetch (`ghFetch`)

- Wraps `fetch` with GitHub auth headers
- Uses `defineCachedFunction` (6h maxAge, 12h staleMaxAge, no SWR)
- Calls `acquireGHToken()` to get a token; if none returned, throws 403 with diagnostic info (invalid count, exhausted count, soonest reset time)
- On every response, updates the token's rate limit via `onResponse` → `token.updateStatus()`
- Cache validation rejects empty arrays and zero-count results

## Helper Endpoints

- `ghRepo(repo)` — GET /repos/:repo (cached)
- `ghRepoContributors(repo)` — GET /repos/:repo/contributors (cached)
- `ghRepoFiles(repo, ref)` — GET /repos/:repo/git/trees/:ref?recursive=1 (cached)
- `ghMarkdown(md, repo, id)` — POST /markdown (cached, keyed by repo/id)

## Status Page (`routes/_status.ts`)

HTML dashboard showing per-token and aggregate rate limit usage with color-coded bars.

## Concurrency: `idempotent()` utility

Wraps an async function so concurrent callers share a single in-flight promise:

- `once: true` (default) — runs at most once; subsequent calls return cached result. Has `.reset()` to clear.
- `once: false` — concurrent calls share one execution, but after it settles a new call triggers a fresh run.

Used by: `ensureTokensValidated` (once), `ensureAllTokensValidated` (once), `ensureAppToken` (not once — coalesced), `revalidateGHTokens` (not once — coalesced).

## Key Design Decisions

- `valid !== false` (not `valid === true`) in `clearExpiredLimits` — allows clearing rate limits for never-validated tokens that have stale rate limit state
- `remaining ?? 1` in `available` getter — treats never-checked tokens as available (optimistic until proven otherwise)
- App token refresh is self-scheduling via `setTimeout`, not driven by requests
- Transport errors in `validate()` preserve last-known state (no flip to invalid)
- `updateStatus()` only updates `remaining`/`limit`/`reset` when their respective headers are present — avoids losing known state on responses lacking rate limit headers
- `isStale()` always returns `true` for never-validated tokens (`_lastValidated` undefined), even if `reset` is somehow set — prevents edge case where a token could become permanently non-revalidatable
