# ABOUTME: Investigation into the target architecture for the "mind" capability card with persona/beliefs/memory content stored and managed in BeginningDB per mind id, via the bgng CLI (agent surface) and the beginning-db client (drwn library surface).
# ABOUTME: Builds on analysis 112; maps BeginningDB/bgng facts, the source-of-truth question, mind-id mapping, three candidate architectures with a recommendation, and the testing strategy.

# Analysis 105 — Mind Card × BeginningDB: Target-Architecture Investigation

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Draft — investigation complete; architecture decision pending discussion
**References**: [.ai/analyses/112_persona-beliefs-memory-capability-card-investigation.md, .ai/analyses/103_persona-beliefs-memory-capability-card-design-capture.md, /Users/pureicis/dev/beginning-db/.ai/knowledges/, /Users/pureicis/dev/beginning-db/.ai/analyses/11_bgng_harness_card_target_architecture.md]

---

## 1. What changed since analysis 112

Analysis 112 investigated rebuilding persona/beliefs/memory as a filesystem-only capability card: content authored in the card source, shipped via the whole-tree publish, materialized and composed locally by `drwn`. The new requirement reshapes that: **mind content is uploaded/managed/updated/consumed through BeginningDB, keyed per mind id**, with

- the **bgng CLI as part of the card's core tools** — agents operate their mind content through card-shipped skills that wrap `bgng`/`bgdb`, and
- **beginning-db as a library** — `drwn` itself talks to BeginningDB programmatically for provisioning, sync, and diagnostics.

This resolves the deepest tension in the 103/112 model: cards are immutable versioned artifacts, but **memory is mutable runtime state**. A DB-backed mind gives memory a proper home; the design question becomes where persona/beliefs (the stable tiers) live and how the card, the DB, and the worker lifecycle bind together.

### Name-collision warning

`bgng` was also the **former name of this repo's own CLI** (pre-`drwn`; see analyses 30, 39 — `~/.agents/bgng/`, cards, `write`). Those docs are legacy self-reference. In this document and all future ones, `bgng` means **the beginning-db workspace CLI** (`/Users/pureicis/dev/beginning-db/apps/cli`, binaries `bgng` and `bgdb`).

## 2. BeginningDB / bgng: facts that constrain the design

From the beginning-db knowledges (`.ai/knowledges/{00_onboarding,02_cli,07_agent_harness,08_web_ide}`, plus `BeginningDB/.ai/knowledges/`) and code-level inspection of `apps/cli`:

1. **Data model = multi-tenant virtual filesystem over HTTP.** Paths → dentries → inodes → content-addressed blocks. Rust single-active server; requests scoped by `x-tenant-id` + bearer token. Workspaces are subtrees (`/.bgdb-vfs/filesystems/<id>/…`) — a convention plus token scoping, not a hard namespace. No `mind`/`persona`/`memory`/layer concept exists anywhere in beginning-db today; we'd be defining the convention.
2. **File API is small and WebDAV-like.** `GET/PUT/DELETE /v1/fs{path}`, `MKCOL`, `MOVE`, `GET /v1/stat{path}`, `GET /v1/list{path}`, placements (hardlink-like multi-path), `GET /v1/search`, `GET /v1/changes` (cursor feed). `PATCH` supports **append/range writes** — a natural fit for `jsonl` memory layers.
3. **Concurrency = ETag CAS; no history.** Weak ETags `W/"<inode>:<version>"`; `If-Match`/`If-None-Match` preconditions give atomic create and compare-and-swap; 412 on conflict, application retries. **No snapshots, no version history, no rollback** — versioning of mind content is ours to design (the card's semver covers seeds; runtime state needs its own answer or explicit acceptance of mutability).
4. **Auth/targets.** Connection = `baseUrl` + `tenantId` + bearer token (+ optional `pathPrefix`). The `bgdb` CLI persists these in `~/.bgdb/targets.json` + `~/.bgdb/secrets.json` (0600); env overrides `BGDB_TARGET`/`BGDB_BASE_URL`/`BGDB_TENANT_ID`/`BGDB_TOKEN`/`BGDB_PATH_PREFIX` take precedence and are the headless/programmatic seam. Gateway deployments add workspace-scoped **child-tokens** (`POST /v1/auth/child-token {workspaceId}`) and a ReBAC layer (`authz`/`identity`/`share`/`link` commands, SpiceDB-backed).
5. **"As a library" needs one enabling step.** The `bgng` npm package is **unpublished** (v0.1.0, no `exports` map, workspace-internal). But the client layer is cleanly separable: `apps/cli/src/services/beginningdb/client.ts` (`beginningDbRequest`/`beginningDbJsonRequest`, pure fetch, no CLI deps) plus `services/bgdb/{target-resolver,target-store,path}.ts`. In-house consumers demonstrate three patterns: the VSCode extension spawns the CLI with a **CLI contract version check** (`CLI_CONTRACT_VERSION = 1`); the same extension also uses a **direct HTTP client**; the web-ide uses a BFF. Since we own both repos, the clean options are (a) extract/publish a small client package from the beginning-db workspace, or (b) vendor the ~4 client files into `drwn`.
6. **Proven agent-surface precedent.** beginning-db's own repo consumes `drwn` via the `@remyjkim/bgng` card: four skills wrapping the CLI surfaces (`bgng-knowledge-base`, `bgng-ide`, `bgng-direct-db`, `bgng-s3-admin`), no MCP servers — agents run the CLI as subprocess with `--json`. The mind card's agent-facing tooling can follow this exact pattern.

## 3. Two consumption surfaces, one card

The requirement implies a split the architecture should make explicit:

| Surface | Consumer | Mechanism | Used for |
|---|---|---|---|
| **Agent runtime** | Worker agents (Claude Code / Codex / …) | Card-shipped **skills** wrapping `bgng`/`bgdb` CLI (subprocess, `--json`), following the `@remyjkim/bgng` card pattern | Reading persona/beliefs at session start; **writing memory** during/after sessions; querying/searching mind content |
| **Lifecycle plumbing** | `drwn` CLI | beginning-db **client library** (imported or vendored; not subprocess) | Provisioning mind ids, seeding content on activation/deploy, sync on card update, doctor/status checks, teardown |

The card is the package that carries both: the manifest declaration of mind structure, the skills (agent surface), the seed content (depending on §5), and the binding conventions.

## 4. The two pivotal questions

### 4.1 Source of truth

"Uploaded/managed/updated via beginning db" implies a local origin that gets uploaded. Three positions:

- **DB-only**: content is born in the DB; the card carries no content files, only structure + skills. Authoring happens through drwn commands or agents writing to the DB directly.
- **Card-seeded, DB-runtime** (hybrid): persona/beliefs are authored in the card source (103 schema: `persona/<entry>/PERSONA.md`, `beliefs/<entry>/`, publish-validated, semver-versioned, reviewable in git) and act as **seeds/templates**; activation/deploy composes and uploads them to the mind's DB subtree. Memory layers are **DB-native runtime state** — seeded empty (or from templates), never overwritten by re-sync.
- **DB-primary with card snapshots**: DB is authoritative; drwn can snapshot DB state back into a card version for distribution/backup.

### 4.2 What is a "mind id"?

The old model composed the active card stack into one local bundle. With a DB, the composed mind becomes **a subtree per mind id** — but what owns a mind id?

| Mapping | Meaning | Fit |
|---|---|---|
| **Per deployed worker** | Each `worker deploy` mints (or is given) a mind id; the W4 deploy contract carries it; the worker's runtime memory accrues under it | Best fit for memory-as-runtime-state; aligns with worker identity/governance (blueprint `identity` field is forward-declared already) |
| **Per project** | A project's active stack = one mind id (local dev worker) | Needed anyway for undeployed/local use; the "degenerate worker" |
| **Per card** | Each mind card = one mind id | Poor fit — composition of multiple cards into one worker's mind is the point of the stack |

Likely answer: mind id ∈ worker instance (deployed) or project workspace (local), with the mind card(s) contributing *content*, not identity. Needs Remy's confirmation — it determines provisioning, the deploy contract change, and multi-agent concurrency semantics.

## 5. Candidate architectures

### Architecture A — DB-native mind (card = structure + tools, no content)

The card manifest declares mind structure (sections, layers, formats, visibility) and ships the agent skills; all content — persona, beliefs, memory — lives only in BeginningDB under `/minds/<mind-id>/…`. `drwn` provisions the subtree on activation/deploy (atomic create via `If-None-Match: *`) and writes scaffolding templates. Authoring persona/beliefs = drwn commands (or agents) PUTting to the DB.

- **Pros**: one source of truth; no sync machinery; memory model is uniform.
- **Cons**: persona/beliefs lose git-versioned, reviewable, semver-distributed authoring — the entire card value proposition; publish validation has nothing to validate; hard runtime dependency on a reachable BeginningDB for *everything*, including reading your own persona; no offline authoring.

### Architecture B — Card-seeded, DB-runtime (hybrid) ← recommended

Persona/beliefs authored in the card per the 103 schema **verbatim** (source dirs, manifest sections, publish validation, semver, doctor) — the card remains the reviewable, distributable **definition** of a mind. Memory layers are declared in the manifest (layers/formats) but carry no card content beyond optional templates. The DB is the **runtime home**:

1. **Provision**: on `worker deploy` (and on first local activation), `drwn` mints/receives the mind id and atomically creates `/minds/<mind-id>/` (workspace + path conventions from config).
2. **Seed/sync**: `drwn` composes the active stack's persona/beliefs in order (the 103 composition semantics, retargeted from `generated/mind/` to DB paths) and uploads: `persona.md` (concatenated with provenance fences), `beliefs/<card>/<entry>/…`, `memory/{l4,l5,l6}/` scaffolding. A `mind.json` index (103's composed index shape + card versions/integrity + ETags) records what was seeded from which card version.
3. **Update**: card version bump → re-sync persona/beliefs with ETag CAS against the recorded versions; 412 means someone edited the DB copy — surface as drift (doctor), don't clobber. **Memory paths are never written by sync** after seeding.
4. **Runtime**: agents use card-shipped skills wrapping `bgng`/`bgdb` to read persona/beliefs and append memory (`PATCH` append for `jsonl` layers; CAS for `md`).
5. **Local materialization** becomes thin: the per-worker generated bundle carries the **binding** (mind id, target, path prefix — a `mind.json` pointer), not the composed content; the composed content lives in the DB. (Optionally keep a local composed bundle as offline cache — decide by YAGNI, default no.)

- **Pros**: keeps everything durable in git/cards (persona/beliefs = code-reviewed, versioned, distributable), puts everything mutable in the DB (memory = runtime state with append semantics), reuses the recovered 103 implementation for authoring/validation/composition with the *output target* swapped from local dir to DB paths; degrades gracefully (cards usable without DB for authoring; DB needed only at activation/runtime).
- **Cons**: two stores with a sync boundary — needs explicit drift rules (the ETag ledger in `mind.json` is the mechanism); more moving parts than A or C.

### Architecture C — Thin skills card only

Like `@remyjkim/bgng`: the mind card ships skills + a conventions document; agents manage `/minds/<id>/…` entirely themselves; `drwn` changes nothing.

- **Pros**: shippable immediately; zero core work.
- **Cons**: no provisioning, no schema/publish validation, no composition, no lifecycle binding to workers/deploy, no drift detection; "per mind id" is left to agent discipline. Viable as a **milestone 0** (the agent surface of A/B is this card), not as the target.

### Recommendation

**B**, with C's skill set as its agent surface and its first shippable milestone. B is the only option that uses both halves of what already exists: the recovered 103 machinery (authoring/validation/composition — analysis 112 §4 showed it's recoverable nearly verbatim) and BeginningDB's actual strengths (mutable runtime state, append writes, CAS, change feed). A discards the card pipeline's value; C discards the lifecycle integration Remy is asking for.

## 6. Component sketch (Architecture B)

New/changed pieces in `drwn`, layered on the 112 §5 module-boundary plan (`cli/core/mind-content/` restored from `1c92ae4`):

- **`cli/core/mind-store/`** (name TBD): the beginning-db client seam. Vendored/imported client (`beginningDbRequest` + target resolution honoring `BGDB_*` env and `~/.bgdb/targets.json`), plus mind-path conventions (`mindRoot(mindId)`, section paths) and the sync engine (seed, CAS re-sync, drift report). Everything network lives behind this module.
- **Manifest**: 103 sections verbatim + a small binding block (TBD: workspace id/target name defaults; possibly card-level `mind.target` config vs project config — leaning project config, since targets are deployment-specific, not card-specific).
- **Lifecycle hooks**: `worker deploy` mints/propagates mind id (deploy contract extension — server needs to know the id, maybe nothing else); local activation path (`drwn write` or an explicit `drwn mind provision`) for the project-scoped mind. Teardown policy on `worker delete` (default: keep DB content; explicit flag to purge).
- **Commands** (beyond the six restored authoring commands): `mind provision`, `mind sync [--dry-run]`, `mind status` (drift/ETag ledger vs DB), `mind open/cat` conveniences (TBD — YAGNI check each).
- **Doctor**: source checks (restored) + DB checks (binding present, subtree exists, drift, unreachable target → warning not failure).
- **Card content**: the shipped mind card also includes the agent skills (bgng wrappers specialized to mind paths: "read my persona", "append episodic memory", "search my memory") — authored once, distributed via the standard pipeline.
- **Visibility/push gate**: 103's gate protected against pushing private *card content* to public remotes — still applies to persona/beliefs seeds in the card. Runtime DB access control is **ReBAC/child-tokens on the BeginningDB side**, not a drwn concern beyond provisioning sensible defaults. This shrinks the gate's scope vs 103 (memory content never enters the card, so the highest-sensitivity tier is out of push-gate scope by construction).

## 7. Risks and honest concerns

1. **bgng is v0.1.0, unpublished, with an explicit CLI contract-version mechanism** — the library seam requires either publishing a client package from the beginning-db workspace (preferred; we own it) or vendoring ~4 files with a documented upstream SHA. Subprocess-only integration for drwn plumbing would add a binary-installation prerequisite for every drwn user of the mind card; skills already impose that for agents, but drwn core shouldn't.
2. **No version history in BeginningDB.** Memory is destructive-by-default; `jsonl` append layers mitigate; `md` layers do not. If mind-state history matters (it plausibly does for a "darwinian" system), that's an application-level design (e.g., append-only layers + periodic snapshot files) to decide now, not retrofit.
3. **Concurrency across agents sharing a mind id**: CAS gives safety, not merge. Multiple concurrent workers on one mind id will hit 412s on `md` files; the answer is layer discipline (append-only jsonl for concurrent-write tiers) — should be stated in the card's conventions.
4. **Network dependency in a hitherto-offline CLI.** Every DB-touching drwn command needs defined offline behavior (fail with actionable error vs warn-and-skip). Tests must not require a network (see §8).
5. **Tenancy/provisioning is undefined**: who creates the tenant/workspace and issues drwn's token (manual `bgdb target create` at first; gateway child-tokens later?). Fine to start manual; the design should not hard-code the gateway.
6. **Name collision** (§1) will keep biting in docs and searches; recommend a glossary note in `.ai/knowledges` when implementation starts.

## 8. Testing strategy

Extends 112 §7 (the restored suite still covers authoring/validation/composition unit+command tiers). New DB-facing tiers:

1. **Unit — path/convention + sync planning**: pure functions (mind paths, compose-to-upload plan, ETag ledger diff) — no I/O, `core-*` style.
2. **Command tier — fake BeginningDB server**: `Bun.serve` implementing the ~8 routes used (`/v1/fs` GET/PUT/PATCH/DELETE, MKCOL, `/v1/stat`, `/v1/list`, `/v1/changes`) with real ETag/412 semantics, following the existing `cli-auth-e2e.test.ts` fake-server precedent; drwn pointed at it via `BGDB_BASE_URL`/`BGDB_TOKEN` env. Covers provision/seed/sync/drift/doctor and offline-failure behavior (server down → assert the exact error).
3. **E2E tier — real BeginningDB**: house rule forbids mocks in e2e; BeginningDB ships `docker-compose.dev.yml` and a runnable server. A CI-gated (or `DRWN_E2E_BGDB=1`-gated) suite runs the full journey against a real instance: publish mind card → provision → seed → agent-style `bgdb` append → card bump → re-sync with CAS → drift detection. **Tension to resolve with Remy**: the fake-server tier is precedented in this repo (auth e2e uses one) but sits close to the "no mocks in e2e" line — proposal: classify tier 2 as command/integration tests (fake server = test double for an external service, per unit-tier rules) and reserve "e2e" labeling for tier 3 with the real DB.
4. **Contract tests**: one suite asserting our client's request/response expectations against the real server (tier 3) so fake-server drift is caught.
5. **Determinism/idempotency**: `mind sync` twice → second run reports zero changes; byte-identical `mind.json` ledger — matching the repo's double-write idempotency convention.

## 9. Open questions for Remy

1. **Mind id ownership** (§4.2): per deployed worker + per project for local? Who mints — drwn, the deploy server, or the user?
2. **Source of truth** (§4.1): confirm hybrid B (card-seeded persona/beliefs, DB-native memory) over DB-only A.
3. **Library seam**: publish a client package from beginning-db (preferred) or vendor the client files into drwn?
4. **Composed-mind location**: DB-only (thin local binding) vs DB + local offline cache?
5. **Memory history**: accept mutable-no-history, or design append-only + snapshot conventions now?
6. **Sync authority on conflict**: card re-sync hits 412 on a persona file (DB copy was hand-edited) — default to preserving DB edits and reporting drift (proposed), or offer `--force` card-wins?
7. **Deploy contract**: does the Foundry/server need the mind id and target in the deployment body (W4 extension), or is mind provisioning purely CLI-side?
8. **Testing tiers** (§8): bless the fake-server tier as integration (not e2e) so the no-mocks-in-e2e rule stays intact?
9. **Milestone 0**: ship the thin skills card (Architecture C surface) first while B's plumbing is built?

## 10. Suggested next step

Settle §9 (especially 1–3), then draft the implementation task plan merging 112 §7's restored-suite sequencing with §8's DB tiers — likely phased: M0 skills card → M1 restored authoring/validation (112 plan) → M2 mind-store client + provision/seed → M3 sync/drift/doctor → M4 deploy integration.
