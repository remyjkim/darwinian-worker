# ABOUTME: Implementation plan (executed) to fix the PR #31 (DAH cloud auth) regressions before merge — the legacy-credential api_url regression and the untested cloud-http 401-refresh-retry path.
# ABOUTME: Two of three planned workstreams were subsumed by the PR author's parallel commit 1566bc9; this task landed the remaining real-user fix (v1 credential compat) and the missing retry coverage.

# Task 66: PR #31 Cloud-Auth Regression Fix — Implementation Plan

**Status**: Done
**Created**: 2026-07-03
**Assigned**: Claude + Remy
**Priority**: High (blocked PR #31 merge — the Phase 2 DAH auth work)
**Branch**: `codex/drwn-cloud-cli-task18-auth` (stacks on top of PR #31)
**Dependencies**: PR #31 branch `codex/drwn-cloud-cli-task18-auth`; PR #30 already merged to `main`
**References**: [PR #31 `Add DAH-backed drwn cloud auth`, .ai/analyses/91_pr_30_drwn_cloud_commands_review.md, cli/core/auth/resolve-token.ts, cli/core/auth/credentials.ts, cli/core/cloud-http.ts, test/core-cloud-http.test.ts]

---

## Objective

Make PR #31 (`codex/drwn-cloud-cli-task18-auth`) merge-safe: the **full** `bun test` suite passes with 0 failures before merge, the 401-refresh-retry path in `cloud-http.ts` has dedicated coverage, and the latent real-user regression in `resolveToken` for legacy v1 credentials is fixed rather than papered over in tests.

## Context — why this exists

PR #31 ships the Phase 2 DAH-backed auth: an OAuth device flow with PKCE, a services-audience JWT, encrypted v2 credentials, a `cloud-http.ts` client with 401-refresh-once-retry, and a generalized service-aware `resolveToken`. The core implementation is sound and correctly resolves PR #30's tracked follow-ups (#1 auth gap, #2 shared HTTP client, #3 config layering).

**The verification was incomplete.** The PR description's test command cherry-picked only 4 files, and the CI run for this branch (`28621327796`) was **CANCELLED** mid-"Unit + integration tests" on both Ubuntu and Windows. Running the **full** suite revealed **9 real failures** (verified independently in an isolated worktree; the 10th, `gitWorktreeRoots`, was an environmental artifact):

| Cluster | Count | Passes on `main`? | Root cause |
|---|---|---|---|
| `drwn analyze sessions` | 5 | ✅ 7/7 on main | `resolveToken` rewrite drops `api_url` from stored legacy v1 creds |
| `auth CLI E2E` | 4 | ✅ on main | `cli-auth-e2e.test.ts` tested the **old** flow (plaintext creds, `/api/auth/session`, visible device code); structurally incompatible with v2 |

## Outcome — what landed (and what didn't, and why)

While this task was in flight, the PR author independently pushed commit **`1566bc9` "fix(cli): align auth tests with DAH flow"**, which resolved 2 of the 3 planned workstreams by a parallel route:

| Workstream | Author's `1566bc9` | This task's commits |
|---|---|---|
| **A — `analyze sessions` regression** | Migrated the test to write v2 creds (sidesteps v1) | `d155207` — fixed `readCredentials` to recognize v1 records + `resolveToken` to fall back to `creds.api_url`. **Kept**: the author's fix only worked because the test stopped using v1; the underlying real-user regression (stored v1 creds → silent null auth) persisted on their branch. This commit closes it. |
| **B — `cli-auth-e2e` rewrite** | Rewrote the fake server to the 4 PKCE endpoints + revoke; asserted on encrypted v2 creds | **Dropped** — the author's rewrite was functionally equivalent and landed first. No value in a second rewrite. |
| **C — `cloud-http` 401-retry coverage** | Not addressed | `102ad5e` — added `test/core-cloud-http.test.ts` (4 cases). **Kept**: the only coverage for the retry path. |

**Final branch state:** `1566bc9` (author) → `d155207` (this task: v1 fix) → `102ad5e` (this task: cloud-http test). Full suite: **999 pass / 0 fail** (excluding the unrelated untracked `test/core-card-deprecate.test.ts` from separate card work).

## Root cause — the legacy-credential regression (Workstream A, two layers)

On `main`, `resolveToken` for **stored** credentials returned `{ token: creds.access_token, apiUrl: creds.api_url }`. PR #31's rewrite broke this in **two** compounding places:

**Layer 1 — `credentials.ts` `readCredentials` discards v1 records entirely.** PR #31 added `isCredentials` requiring `version === 2`, but `readCredentials` used it as the *only* validator. A legacy v1 record `{api_url, access_token, user_email, saved_at}` fails that check and is silently read as `null`. (Verified with a direct probe: `readCredentials` of a written v1 record returns `null`.) So `resolveToken` never saw legacy creds — its `"version" in creds` legacy branch was effectively dead code.

**Layer 2 — `resolve-token.ts` legacy branch ignored `creds.api_url`.** Even when creds arrived, the branch required `DRWN_ANALYZER_URL` in env and ignored the stored URL:

```ts
// PR #31 resolve-token.ts (buggy layer 2)
if (!("version" in creds)) {
  return input.env.DRWN_ANALYZER_URL
    ? { token: creds.access_token, source: "stored", apiUrl: trimTrailingSlashes(input.env.DRWN_ANALYZER_URL) }
    : null;
}
```

**Latent real-user regression:** anyone with stored v1 credentials loses analyzer auth unless they also set `DRWN_ANALYZER_URL`. The author's `1566bc9` did not fix either layer — it migrated the test away from v1, so the test passed while the production bug remained.

**Fix (`d155207`, both layers):** `readCredentials` recognizes v1 records via a sibling `isLegacyCredentials` validator; `resolve-token.ts`'s legacy branch uses `creds.api_url` as the fallback when env is absent. **Contract:** env wins over stored (env is the explicit override), but stored `api_url` is the fallback — never `null` when a URL is available.

## Root cause — untested `cloud-http.ts` 401-refresh-retry (Workstream C)

`cli/core/cloud-http.ts` is the single most security-relevant new file: it resolves a bearer, retries **once** after a 401 by refreshing stored credentials, and deliberately **does not** retry env-sourced tokens (`auth.source === "env"` short-circuits). It had **zero** dedicated coverage — the cloud-command tests set `DRWN_TOKEN` to bypass auth, so the retry branch never executed. **Fix (`102ad5e`):** `test/core-cloud-http.test.ts` with 4 cases (bearer attachment; 401 → refresh → retry with changed bearer; env-token no-retry short-circuit; not-authenticated guard), using the injectable `deps.fetcher`.

## Success Criteria

- [x] `bun run typecheck` is green.
- [x] **Full** `bun test` passes with 0 failures on macOS (999 pass; lone failure is the unrelated untracked card test from separate work).
- [x] `cli-auth-e2e.test.ts` exercises the new PKCE device flow + encrypted v2 credentials (author's `1566bc9`).
- [x] `resolveToken` uses the `api_url` already stored in legacy v1 credentials (this task's `d155207`).
- [x] `cli/core/cloud-http.ts`'s 401 → refresh-once → retry path has dedicated test coverage (this task's `102ad5e`).
- [ ] CI `Validate (ubuntu-latest)` completes green (not cancelled) — pending push.

## Out of scope

- Does **not** change `sessions.ts` auth messages (both correct in their branches).
- Does **not** address pre-existing Windows failures (Task 60).
- Does **not** add Zod validation to cloud command responses (PR #30 finding #2 full resolution — separate task).
- Does **not** migrate `commands-cloud.test.ts` off `globalThis.fetch` mutation.
