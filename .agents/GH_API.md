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
2. Filter to `available` tokens: `valid === true && (remaining ?? 1) > 0`
3. Sort by highest `remaining` -> pick first

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

## Validation Flow

### `ensureTokensValidated` (normal requests)

Called once per request cycle (idempotent via `_validatePromise`):

1. Race all PAT validations and App token bootstrap in parallel — resolve as soon as any token is available
2. If no token available after race, falls back to `revalidateGHTokens()`

### `ensureAllTokensValidated` (status page only)

1. Validate all PAT tokens in parallel (each calls GET /meta — costs 1 API request)
2. Bootstrap App tokens (JWT -> list installations -> create installation tokens)
3. Revalidate any stale tokens

## Revalidation (`revalidateGHTokens`)

- Concurrent callers share one in-flight promise (coalesced)
- Only revalidates tokens where `isStale()` is true
- Also calls `ensureAppToken()` to refresh app tokens if needed
- Short-circuits if no tokens are stale AND at least one token is available

## Cached Fetch (`ghFetch`)

- Wraps `ofetch` with GitHub auth headers
- Uses `defineCachedFunction` (6h maxAge, 12h staleMaxAge, no SWR)
- On every response, updates the token's rate limit via `onResponse`
- If no token available, attempts revalidation once, then throws 403
- Cache validation rejects empty arrays and zero-count results

## Helper Endpoints

- `ghRepo(repo)` — GET /repos/:repo (cached)
- `ghRepoContributors(repo)` — GET /repos/:repo/contributors (cached)
- `ghRepoFiles(repo, ref)` — GET /repos/:repo/git/trees/:ref?recursive=1 (cached)
- `ghMarkdown(md, repo, id)` — POST /markdown (cached, keyed by repo/id)

## Status Page (`routes/_status.ts`)

HTML dashboard showing per-token and aggregate rate limit usage with color-coded bars.

## Key Design Decisions

- `valid !== false` (not `valid === true`) in `clearExpiredLimits` — allows clearing rate limits for never-validated tokens that have stale rate limit state
- `remaining ?? 1` in `available` getter — treats never-checked tokens as available (optimistic until proven otherwise)
- App token refresh is self-scheduling via `setTimeout`, not driven by requests
- Transport errors in `validate()` preserve last-known state (no flip to invalid)
