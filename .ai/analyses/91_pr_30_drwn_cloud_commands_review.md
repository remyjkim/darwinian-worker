# PR #30 — `feat(cli): add drwn cloud commands` — Review

**Date:** 2026-07-02 (consolidated; supersedes the divergent `.ai/analyses/87_*`)
**PR:** https://github.com/remyjkim/darwinian-minds/pull/30
**Branch:** `codex/drwn-cloud-cli-task17` → `main`
**Author:** junggyubae
**Size:** +929 / −0, 12 files (7 commands + `types.ts` + 2 core helpers + `index.ts` registration + 303-line test suite)
**Companion PR:** https://github.com/curation-labs/darwinian-services/pull/81 (`docs: align drwn cloud cli repo target`)
**Task source:** `darwinian-services/.ai/tasks/17_drwn_cloud_phase1_migrate_plan.md` (Phase 1 migrate)

> This is the consolidated canonical review. It folds in an earlier independent
> review (formerly `.ai/analyses/87_*`, since removed) and adds findings from a
> source-level verification pass against the deploy-api routes, the config/auth
> layering, and the HTTP-client conventions in this repo. Where the two reviews
> overlapped they agreed; the deltas are called out as **[new]** below.

---

## Executive Summary

PR #30 adds a `drwn cloud` command group — `deploy`, `list`, `status`,
`deployments`, `rollback`, `delete`, plus a parent help command — to the published
`drwn` CLI in `darwinian-minds`. It is the `darwinian-minds` half of Task 17
(Phase 1 migrate). The command surface is complete, the help tree is correct
(`drwn cloud login` is absent), output contracts (human table + stable `--json`)
are honored, secret values are redacted in stdout, and all 18 tests across the
three claimed test files pass with `bun run typecheck` green.

**Verdict: Approve with tracked follow-ups.** The PR correctly resolves the core
architectural problem — cloud commands live under the real `drwn` without
shadowing existing commands — and is safe to merge for the pre-auth Phase 1
window. It diverges from this repo's established CLI conventions (shared HTTP
client, layered config, injectable test fetch) in ways that are acceptable for
Phase 1 but should be reconciled before Phase 2 lands auth, because Phase 2's
"401 refresh-once retry" and "send bearer on every command" requirements will be
duplicated across seven commands instead of centralized in one client — and, as
the verification pass found, the existing `resolveToken` can't be reused as-is.

| # | Severity | Finding |
|---|----------|---------|
| 1 | **By-design gap (Phase 2 must-do, bigger than it looks)** | Zero auth on any of the seven commands — no `Authorization` header, no `resolveToken`. Correct for Phase 1 (deploy-api hardcodes `USER_ID = "local"`). But Phase 2 can't just "add `resolveToken`": the existing resolver is analyzer-URL-coupled and `DrwnCredentials` has one `api_url`. Needs a studio token resolver + credentials extension. |
| 2 | **Convention deviation (universal, not partial)** | Raw `fetch()` per command instead of `createAnalyzerClient`. Verified: **every** networked command in the repo (`login`/`whoami`/`logout`/`analyze sessions`) uses the client + `testDeps` — there is zero raw `fetch()` in `cli/commands/`. The cloud commands are the only ones breaking the pattern. |
| 3 | **Convention deviation** | `resolveCloudConfig` reads env directly, bypassing the layered `loadAnalyzerConfig`. Cloud URLs won't respect `~/.agents/drwn/config.json`. Clean fix is a sibling `loadStudioConfig` (not extending the analyzer resolver). |
| 4 | **Medium** | `status.ts` over-fetches: pulls the **entire** mind list and `.find()`s the slug client-side, then makes a second fetch. Wasteful today; **semantically wrong** once Phase 2 owner-scopes reads. `GET /api/minds/:slug` doesn't exist yet — it's a real endpoint gap. |
| 5 | Minor | `deploy.ts` poll loop swallows all fetch errors with `catch { continue; }` — a persistent outage looks identical to a slow deploy until the 5-min timeout. **[new]** That loop is only tested for the immediate-`ready` path; `pending→ready`, `failed`, and timeout are unverified. |
| 6 | Minor **[new]** | `deploy.ts` and `rollback.ts` call `res.json()` **before** checking `res.ok`; `delete.ts`/`list.ts` correctly check `ok` first. A non-JSON error (e.g. a gateway 502 in front of deploy-api) would throw inside the parse and surface a misleading "Cannot reach Deploy API." |
| 7 | Minor **[new]** | deploy-api supports `idempotencyKey` (unique index on `mind_id + idempotency_key`); the CLI never sends one. A retried/duplicated deploy creates orphan rows and, on success, a second `ready` row that overwrites the alias. |
| 8 | Nit | `deploy.ts` POST body includes `model: undefined` when `--model` is omitted; harmless (JSON.stringify drops it) but slightly leaky. |
| 9 | Minor | Windows CI fails on `cli-auth-e2e` + `cli-hook-write-e2e` — both **pre-existing** on `main`; the new cloud tests pass on Windows. |

---

## Verification performed

Independent of the PR description, the following was confirmed against the code:

| Claim | How verified | Result |
|---|---|---|
| Command surface complete + `cloud login` absent | `bun test test/commands-cloud.test.ts` | ✅ all 10 cloud tests pass, incl. `cloud login is not registered` |
| Help tree preserves existing commands | `cli-help-shape.test.ts` + `commands-cloud.test.ts` assert `login/whoami/logout/card list/status` present, `cloud login` absent | ✅ pass |
| Typecheck green | `bun run typecheck` (`tsc --noEmit`) on the PR branch | ✅ no errors |
| Tests pass | `bun test test/cli-smoke.test.ts test/cli-help-shape.test.ts test/commands-cloud.test.ts` | ✅ 18 pass / 0 fail / 417 expect() calls |
| Auth genuinely absent | `grep resolveToken / Authorization` in `cli/commands/cloud/*` | ✅ none present |
| **Raw fetch is the deviation, not the norm [new]** | `grep 'fetch(' cli/commands/` | ✅ only 2 hits, both `git.fetch()`; **zero** HTTP `fetch()` outside cloud. All 4 networked commands use `createAnalyzerClient` + `testDeps`. |
| `BaseCommand` exposes no injectable fetch | `cli/commands/base.ts` | ✅ literally `abstract class BaseCommand extends Command<AgentsContext> {}` — `testDeps` is a per-command convention, not a base feature |
| `resolveToken` is analyzer-coupled **[new]** | `cli/core/auth/resolve-token.ts`, `credentials.ts`, `auth/login.ts` | ✅ requires `DRWN_ANALYZER_URL`+`DRWN_TOKEN`; `DrwnCredentials` has one `api_url` written from `loadAnalyzerConfig` at login |
| Response casing matches CLI reads | `studio-deployment/workers/deploy-api/src/worker.ts` route inventory | ✅ action responses camelCase (`deploymentId`, `activeDeploymentId`); row DTOs snake_case (`card_ref`, `active_deployment_id`) — CLI reads both correctly |
| `GET /api/minds/:slug` does not exist **[new]** | deploy-api route table | ✅ only PATCH/DELETE on single slug; single-mind reads use list-and-filter or `getMindIdBySlug` (returns id only) |
| Idempotency supported but unused **[new]** | `worker.ts:220-258`, `0001_init.sql:28` | ✅ `idempotencyKey` parsed, unique index exists; CLI sends no key |
| Rollback casing is NOT a bug **[new]** | `rollback.ts` vs `worker.ts:368` | ✅ CLI reads `body.activeDeploymentId` (camelCase); deploy-api returns `{ slug, activeDeploymentId }` — match |

---

## Context

The PR implements the `darwinian-minds` side of darwinian-services Task 17. The
companion docs PR (#81 in `darwinian-services`) updates the Task 17/18/19 planning
docs to clarify that the published `drwn` CLI must be this repo, with `cloud`
added as a subcommand group while preserving all existing commands. Together the
two PRs deliver Task 17's "Phase 1 mechanical + output-contract" scope.

### Files added

| File | Lines | Purpose |
|---|---|---|
| `cli/commands/cloud/cloud.ts` | 33 | Parent help command (`drwn cloud` / `drwn cloud --help`) |
| `cli/commands/cloud/deploy.ts` | 153 | Deploy a card ref, upload secrets, poll to ready |
| `cli/commands/cloud/list.ts` | 69 | List deployed Minds |
| `cli/commands/cloud/status.ts` | 97 | Show latest + active deployment for a Mind |
| `cli/commands/cloud/deployments.ts` | 75 | Deployment history per Mind |
| `cli/commands/cloud/rollback.ts` | 51 | Repoint alias to a prior ready deployment |
| `cli/commands/cloud/delete.ts` | 50 | Delete a Mind (requires `--force`) |
| `cli/commands/cloud/types.ts` | 39 | Deploy-API DTOs + `displayModel`/`displayValue` helpers |
| `cli/core/cloud-config.ts` | 22 | Resolve studio API/gateway URLs (DRWN env → IMINDS env → defaults) |
| `cli/core/cloud-secrets.ts` | 23 | Parse `.drwn.secrets` / `.iminds.secrets` |
| `cli/index.ts` | +14 | Register the seven cloud commands |
| `test/commands-cloud.test.ts` | 303 | Config precedence, secrets parsing, routing, all API commands |

---

## Findings

### 1. By-design auth gap — and Phase 2 is bigger than "add resolveToken"

None of the seven cloud commands send an `Authorization` header or call
`resolveToken`. Every command does:

```ts
const { apiBaseUrl } = resolveCloudConfig();
const res = await fetch(`${apiBaseUrl}/api/minds`, { /* no auth */ });
```

The established auth pattern (from `analyze/sessions.ts`, `whoami.ts`) is
`resolveToken` → bearer header → `"Not authenticated, run drwn login"` guard.

**This is correct for Phase 1.** The deploy-api hardcodes
`USER_ID = "local"` (`studio-deployment/workers/deploy-api/src/worker.ts:68`) and
applies only CORS middleware on `/api/*` — no bearer enforcement.

**[new] But Phase 2 can't just drop in `resolveToken`.** The verification pass
found the existing resolver is hard-coupled to the analyzer:

- `resolveToken` (`cli/core/auth/resolve-token.ts:20-33`) **requires**
  `DRWN_ANALYZER_URL` alongside `DRWN_TOKEN`; setting `DRWN_TOKEN` without the
  analyzer URL returns `null`. The returned `apiUrl` is always the analyzer URL.
- `DrwnCredentials` (`cli/core/auth/credentials.ts:6-11`) has exactly **one** URL
  field (`api_url`), written at login from `loadAnalyzerConfig`
  (`cli/commands/auth/login.ts:55,92-95`). There is no place for a studio/gateway URL.

So Phase 2 needs, before wiring the seven commands:

1. A `resolveStudioToken` (or a generalized, service-aware `resolveToken`) reading
   `DRWN_STUDIO_TOKEN` + studio URL, mirroring the studio config resolver.
2. A `DrwnCredentials` extension to hold per-service tokens/URLs (or a separate
   studio credential record).
3. Then the bearer wiring into all seven commands.

**The risk if underestimated:** the moment deploy-api enables bearer enforcement,
all seven commands break simultaneously with `401`/`403`, and the current error
messages (`List failed (401).`) won't tell users to run `drwn login`. This must be
an explicit, sized Task 18 checklist item — not "call resolveToken," but "extend
the credentials model + add a studio token resolver + wire all seven commands."

### 2. Raw `fetch()` instead of the shared client-factory pattern — and it's the only deviation in the repo

The established HTTP convention is `createAnalyzerClient` in
`cli/core/http/analyzer-client.ts`. It provides:

- **Injectable `fetch`** via `createAnalyzerClient(apiUrl, fetcher = fetch)` — no
  `globalThis.fetch` mutation. Tests pass a fake fetcher per-call.
- **Zod-schema response validation** (`schemas.ts`) so a shape drift throws a
  parse error rather than silently yielding `undefined`.
- **Typed errors** — `AuthExpiredError` (401) and `ServerError` (5xx) from
  `cli/core/http/errors.ts`, mapped to stable UX via `handleError`
  (`sessions.ts:208-230`).

The cloud commands call `fetch()` directly with ad-hoc, per-command error handling
and `as`-casts:

```ts
created = (await res.json()) as { deploymentId?: string; error?: string };
```

**[new] This isn't a tolerated alternative — it's the only deviation.** The grep
is decisive: every networked command in the repo (`login`, `whoami`, `logout`,
`analyze sessions`) uses `createAnalyzerClient` + a per-command
`static testDeps = { fetch? }` field. There is **zero** raw HTTP `fetch()` in
`cli/commands/` outside the new cloud code (the only other `fetch(` hits are
`git.fetch()`, a different API). So the cloud commands are the sole breakers of a
universal convention.

Consequences:

- **Untyped responses.** `as { deploymentId?: string }` casts without validation.
  A deploy-api schema drift would silently produce `undefined`. (Shapes match
  today — verified — but nothing enforces it.)
- **No auth-retry hook.** Phase 2's 401-refresh-once-retry must touch seven
  commands, not one client.
- **Test fragility.** Tests mutate `globalThis.fetch` and restore in `afterEach`,
  rather than injecting per-command via `testDeps`. More fragile under parallel
  runs and diverges from how every other command is tested.

**Recommendation:** not a merge blocker for Phase 1, but add a shared
`cli/core/http/studio-client.ts` mirroring `createAnalyzerClient` (a **separate**
file — the analyzer client is too tightly coupled to analyzer-specific schemas to
generalize), plus a `studio-schemas.ts`. Reuse `AuthExpiredError`/`ServerError`
as-is. Each cloud command then declares its own `static testDeps` and threads
`deps.fetch ?? fetch` into `createStudioClient`. Land this before Phase 2.

### 3. Parallel config system (`resolveCloudConfig`) — fix toward a sibling resolver

`cli/core/cloud-config.ts` reads env vars directly:

```ts
apiBaseUrl: env.DRWN_STUDIO_API_URL ?? env.IMINDS_API_URL ?? "https://studio.darwiniantools.com",
```

The repo convention is `loadAnalyzerConfig` (`cli/core/auth/config.ts:31-51`),
which layers env → user config (`~/.agents/drwn/config.json` via
`loadEffectiveConfig`) → packaged repo config. The cloud commands now have their
own resolution path that ignores user config files entirely.

**[new] The clean fix is a sibling `loadStudioConfig`, not extending
`loadAnalyzerConfig`.** The verification pass shows `loadAnalyzerConfig` is
deliberately analyzer-scoped: its return type `AnalyzerConfig`, its imports
(`DRWN_ANALYZER_*`), its file location (`cli/core/auth/`), and its ABOUTME all say
"analyzer." Stuffing studio fields into `AnalyzerConfig` would muddy it. Note also
the config schema (`CanonicalConfig` in `cli/core/types.ts:50-88`) is a plain TS
interface with an `analyzer?` section but **no `studio?`/`gateway?` section** and
**no Zod validation** on load — so adding a `studio` section is a type edit plus
reusing `loadEffectiveConfig`'s merge logic.

Minor for Phase 1 (env-first is fine), but align before Phase 2 so all `drwn`
commands share one config story. Pairs naturally with finding #2's studio client
and #1's studio token resolver.

### 4. Medium — `status` over-fetches and filters client-side

`status.ts` fetches the **full** mind list and filters for the slug client-side,
then makes a second fetch for deployment history:

```ts
const { minds } = (await res.json()) as { minds: MindSummary[] };
mind = minds.find((candidate) => candidate.slug === this.slug);
// ...then a second fetch:
fetch(`${apiBaseUrl}/api/minds/${this.slug}/deployments`);
```

Two issues:

- It pulls every mind across (today) the single `local` user just to find one.
  Wasteful as the mind count grows.
- **[new] It becomes semantically wrong once Phase 2 owner-scopes reads** — the
  slug lookup should be server-side, not a client-side filter over another user's
  (or a shared) mind list.

**[new] `GET /api/minds/:slug` genuinely does not exist** in deploy-api (verified
via the full route inventory: only PATCH/DELETE operate on a single slug; the only
single-mind helper is `getMindIdBySlug` which returns an id, not a summary). So
the fix is a real endpoint addition — add `GET /api/minds/:slug` returning a single
snake_case `MindSummary` (consistent with the GET-row casing convention), then
have `status` fetch exactly one mind + one history call.

Not a blocker — current behavior is correct today — but it's the right thing to
clean up before Phase 2 owner-scoping makes "fetch all minds" wrong.

### 5. Minor — deploy poll loop silently swallows network errors (and the loop is under-tested)

In `deploy.ts`, the poll loop:

```ts
try {
  deployment = (await (await fetch(`${apiBaseUrl}/api/deployments/${depId}`)).json()) as { ... };
} catch {
  continue;
}
```

A persistent failure (DNS, deploy-api crash, a future auth flip to 401) produces
no output for up to 5 minutes, then times out with "Timed out waiting for
deployment…". The user has no signal that the API is unreachable vs. the deploy is
slow. A transient blip should `continue`, but a repeated failure should break
early — count consecutive catch-failures and surface after N.

**[new]** The loop is **only tested for the immediate-`ready` path** (the test
returns `{ status: "ready" }` on the first poll). No test covers the
`pending → materializing → ready` transition output, the `failed` terminal branch,
or the 5-minute timeout. The `failed` branch is reachable but unverified — a real
coverage gap given it sits in the same loop as the error-swallowing `catch`.

### 6. Minor [new] — `res.json()` before `res.ok` in deploy and rollback

`deploy.ts` and `rollback.ts` read `await res.json()` **before** checking
`res.ok`, then read `body.error`:

```ts
// deploy.ts
created = (await res.json()) as { deploymentId?: string; error?: string };
if (!res.ok || !created.deploymentId) { ... body.error ... }
```

`delete.ts` and `list.ts` correctly check `res.ok` first (then read `.text()` /
`.json()`). Works today because deploy-api always returns JSON error bodies
(`{error: ...}` — verified across all error paths in the route inventory). But if
a non-JSON error ever appears (e.g. a 502 from a gateway or proxy in front of
deploy-api), `deploy.ts`/`rollback.ts` would throw inside the JSON parse and fall
to the generic "Cannot reach Deploy API at …" message, losing the real status
code. Minor consistency fix: check `res.ok` first in all four commands.

### 7. Minor [new] — no `idempotencyKey` sent on deploy

deploy-api's `POST /api/deployments` has a real idempotency contract:
`idempotencyKey` is parsed (`worker.ts:220-221`), stored
(`deployments.idempotency_key`), and enforced via a unique index
`idx_deploy_idem ON deployments (mind_id, idempotency_key)`
(`0001_init.sql:28`). On a matching key it replays the existing deployment with
`idempotent: true` (HTTP 200 vs 201).

The CLI never sends a key, so every POST creates a fresh `dep_` row even for an
identical `cardRef + name` (content-hash dedupe only happens later, inside the
workflow). A retried/duplicated deploy therefore creates orphan `pending`/`failed`
rows and, on success, a second `ready` row that immediately overwrites the alias.

Minor for Phase 1 (no auto-retry in the CLI yet), but a natural hardening item —
and exactly the kind of thing the `studio-client.ts` from finding #2 should
generate per-attempt (e.g. a UUID or a hash of `cardRef + name + model`).

### 8. Nit — `model: undefined` leaked into the deploy POST body

`deploy.ts` unconditionally includes `model`:

```ts
const body: Record<string, unknown> = { cardRef: this.cardRef, name: this.name, model: this.model };
```

When `--model` is omitted, `this.model` is `undefined`; `JSON.stringify` drops it,
so the wire payload is correct and deploy-api treats a missing `model` as optional.
Harmless, just slightly leaky. Cleaner to conditionally include it.

### 9. Windows CI failure is pre-existing

| Check | Status | Notes |
|---|---|---|
| Validate (ubuntu-latest) | **PASS** | All cloud tests pass. |
| Validate (windows-latest) | **FAIL** | `cli-auth-e2e.test.ts` (file mode `0o600`: expected `384`, received `438`) and `cli-hook-write-e2e.test.ts` (exit-code mismatch). Both are **pre-existing** tests that fail on `main` too; unrelated to this PR. |
| Linux secret-tool backend | **PASS** | |

The new `commands-cloud.test.ts` passes on **both** platforms (10 tests green on
Windows in CI). The Windows failures are a known file-permission / card-publish
issue that predates this PR.

---

## What the PR gets right

- **Correct architectural outcome.** `drwn --help` now shows existing commands
  plus the `cloud` group. No command shadowing. `drwn cloud login` is correctly
  absent — verified by the routing test.
- **Output contracts honored.** `list`, `status`, `deployments` all support
  `--json` with stable, API-shaped output, plus human-readable table output via
  the shared `renderTable` / `renderJson` from `cli/core/output.ts`. The JSON for
  `deployments` is the verbatim API response; the human table marks the active
  deployment with `*`.
- **Secrets handling is safe.** `parseSecretsFile` is line-oriented, ignores
  comments/blank lines, handles `=` inside values (`k=a=b=c` → `k: "a=b=c"`), and
  `deploy` redacts token values in stdout (`notion: **** (set)`). The fallback
  order (`.drwn.secrets` then `.iminds.secrets`, break-on-first-found) matches the
  documented one-release behavior. The test explicitly asserts `secret_token`
  never appears in output.
- **`delete` safety.** Requires `--force`, exits 1 without it before any network
  call. Good default for a destructive op.
- **`status` separates latest vs. active.** Thoughtful UX that makes pending
  first-deploys visible before a Mind has an active alias — directly addresses
  Task 17 acceptance item 8.
- **IMINDS env/secrets fallback is one-release and explicit.** Both
  `cloud-config.ts` and `cloud-secrets.ts` prefer `DRWN_*` names with `IMINDS_*`
  as documented fallback.
- **Tests are thorough.** 303 lines covering config precedence, secrets parsing,
  command routing (including the `cloud login` absence assertion), and every API
  command's happy path + JSON output + error cases.
- **Response-shape reading is actually correct.** Despite the lack of Zod
  validation (finding #2), the field names the CLI reads match the live deploy-api:
  camelCase for action responses (`deploymentId`, `activeDeploymentId`), snake_case
  for row DTOs (`card_ref`, `active_deployment_id`, `content_hash`). Verified
  against the full route inventory — including confirming the rollback casing
  match that was initially suspected as a bug.

---

## Cross-PR coupling note

This PR and darwinian-services PR #81 are a coupled pair implementing Task 17.
Merge order is flexible but they're a unit:

- Merge #30 first → PR #81's docs become accurate retroactively.
- Merge #81 first → docs describe a state that doesn't yet exist until #30 lands.

**The sharp edge to watch:** PR #30's auth gap (finding #1) and PR #81's Task 18
auth plan must stay synchronized. PR #81's Task 18 additions specify the
`resolveToken` + bearer pattern for top-level `login`/`whoami`/`logout` — but do
**not** explicitly extend it to the 7 cloud commands, and (per finding #1) the
naive `resolveToken` call won't even work without a credentials-model extension.
That's the gap to close in the Task 18 checklist, or the cloud commands get
orphaned when auth turns on. See the companion review in `darwinian-services`.

---

## CI Status

| Check | Status | Notes |
|---|---|---|
| Validate (ubuntu-latest) | **PASS** | |
| Validate (windows-latest) | **FAIL** | Pre-existing (`cli-auth-e2e`, `cli-hook-write-e2e`); not caused by this PR. Cloud tests pass on Windows. |
| Linux secret-tool backend | **PASS** | |

---

## Recommendation

**Approve.** This is solid, well-tested Phase 1 work that correctly establishes
the `drwn cloud` command surface in the right repo. The auth gap (finding #1) is
by-design and correctly deferred to Phase 2 — but size it correctly: Phase 2 must
extend the credentials model + add a studio token resolver + wire all seven
commands, not just "call `resolveToken`." Make that an explicit Task 18 checklist
item. The HTTP-client/config deviations (findings #2, #3) and the `status`
over-fetch (finding #4) are worth follow-up issues but don't block the pre-auth
Phase 1 window; #2 and #3 should land before Phase 2 so auth-retry and typed
responses centralize in one client.

Suggested review comment to leave on the PR:

> Phase 1 looks good — command surface is complete, `cloud login` is correctly
> absent, output contracts are honored, and tests are thorough on both platforms.
> Verified locally: 18/18 tests pass, typecheck green. Follow-ups to track (none
> blocking for the pre-auth window):
>
> 1. **Auth (Phase 2 must-do, bigger than it looks):** none of the seven commands
>    send a bearer or call `resolveToken`. And `resolveToken` can't be dropped in
>    as-is — it's coupled to `DRWN_ANALYZER_URL` and `DrwnCredentials` has one
>    `api_url`. Phase 2 needs a studio token resolver + a credentials extension +
>    bearer wiring on all seven commands. Please make that an explicit, sized
>    Task 18 checklist item, not just for `login`/`whoami`/`logout`.
> 2. **HTTP client:** every other networked command uses `createAnalyzerClient` +
>    injectable `testDeps.fetch` + Zod; the cloud commands are the only ones on
>    raw `fetch()` + `globalThis.fetch` stubbing. Add a shared `studio-client.ts`
>    before Phase 2 so auth-retry and typed responses land in one place.
> 3. **Config:** `resolveCloudConfig` bypasses `loadAnalyzerConfig`'s user-config
>    layering. Add a sibling `loadStudioConfig` (not an analyzer-extension) before
>    Phase 2.
> 4. **`status` over-fetches:** it pulls the full mind list and filters
>    client-side. Add `GET /api/minds/:slug` to deploy-api and fetch one mind —
>    becomes necessary once Phase 2 owner-scopes reads.
> 5. **Minor polish:** deploy poll loop swallows persistent errors (and is only
>    tested for immediate-`ready`); `deploy`/`rollback` read `res.json()` before
>    `res.ok`; no `idempotencyKey` sent on deploy.
>
> Windows CI failures are pre-existing (`cli-auth-e2e`, `cli-hook-write-e2e`),
> not from this PR.

---

## References

- PR: https://github.com/remyjkim/darwinian-minds/pull/30
- Companion: https://github.com/curation-labs/darwinian-services/pull/81
- Companion review: `darwinian-services/.ai/analyses/28_pr_81_drwn_cloud_cli_repo_target_docs_review.md`
- Task source: `darwinian-services/.ai/tasks/17_drwn_cloud_phase1_migrate_plan.md`
- Strategy: `darwinian-services/.ai/analyses/22_drwn_cloud_migrate_auth_billing_strategy.md`
- Removed divergent review: formerly `.ai/analyses/87_pr_30_drwn_cloud_commands_review.md`
- Convention references: `cli/commands/base.ts` (bare `Command<AgentsContext>`),
  `cli/core/http/analyzer-client.ts` (client factory + Zod + typed errors),
  `cli/core/http/errors.ts` (`AuthExpiredError`/`ServerError`),
  `cli/core/http/schemas.ts` (5 Zod schemas, 100% Zod),
  `cli/core/auth/resolve-token.ts` (token precedence; analyzer-URL-coupled),
  `cli/core/auth/credentials.ts` (`DrwnCredentials`, single `api_url`),
  `cli/core/auth/config.ts` (`loadAnalyzerConfig` layering),
  `cli/core/types.ts:50-88` (`CanonicalConfig`, no `studio`/`gateway` section),
  `cli/core/output.ts` (`renderTable`/`renderJson`)
- Deploy-api state: `studio-deployment/workers/deploy-api/src/worker.ts:68`
  (`USER_ID = "local"`, CORS-only, no bearer enforcement); route inventory confirms
  no `GET /api/minds/:slug`, idempotency supported at `:220-258` + `0001_init.sql:28`
