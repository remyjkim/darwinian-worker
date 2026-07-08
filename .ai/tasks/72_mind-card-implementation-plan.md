# ABOUTME: Implementation task plan for the mind capability card — executable breakdown of milestones M0–M4 from the ratified target architecture (analysis 110) and strategy (analysis 111), with TDD steps, code scaffolds, and acceptance criteria per phase.
# ABOUTME: Task tracking: check off tasks as they land; every task follows RED→GREEN→REFACTOR; no phase is done until its acceptance criteria are verified with command output.

# Task 72 — Mind Card Implementation Plan

**Date**: 2026-07-07
**Status**: V1 complete in working tree (2026-07-07) — pending: Remy commits, EXT deliveries, M0-6 tag/push, M4-4 CI wiring, and full M4 exit on 107 landing server-side
**References**: [.ai/analyses/110_mind-card-target-architecture.md, .ai/analyses/111_mind-card-implementation-strategy.md, .ai/analyses/109_shared-memory-pool-design-investigation.md, .ai/analyses/107_deploy-api-mind-binding-change-request.md]
**Ratified strategy decisions** (111 §9, Remy 2026-07-07): milestone plan + parallelism; binding cache = machine-scoped non-secret `mind-bindings.json`, tokens never persisted; client-gap = interface-first with explicitly-temporary adapter; submodule legacy = audit-then-update/retire.

---

## Goal state

`drwn` workers have DB-backed minds per analysis 110: persona/beliefs authored in versioned cards (restored 103 machinery + push gate), seeded at deploy into `minds/<mindId>/` in the owner's BeginningDB filesystem, memory constructed via placements from a shared `pool/`, agents operating their mind through the `@darwinian/mind-tools` skills, and the card↔DB loop closed by `worker mind {provision,status,diff,sync,checkpoint,pool retire,doctor}`.

## Success criteria (V1 complete)

1. `bun test` green, including all recovered + new suites; test output pristine.
2. The M4 e2e journey passes against a real BeginningDB (`DRWN_E2E_BGDB=1`): publish mind card → deploy (fake API) → provision/seed → skill-style pool append + place → DB edit → `sync` reports drift and preserves the edit → `checkpoint` produces a reviewable source diff → rollback re-seeds without clobbering.
3. A worker deployed via a real 107-compliant deploy API receives `BGDB_*` env and its skills operate the mind end-to-end (M4 exit, gated on studio-deployment).
4. `drwn card push` blocks private mind content toward public remotes (gate restored).
5. Double-run idempotency on `provision` and `sync` (zero changes, byte-stable ledger).

## Phase structure and dependencies

```
M0 (submodule card)────────────┐
M1 (mind-content restore)──────┼──► M2 (mind-store + provision) ──► M3 (sync/diff/checkpoint) ──► M4 (deploy + e2e)
EXT (asks: bgdb client, 107)───┘        ▲ fake-bgdb harness first          ▲ 107 landed for full M4
```

M0 ∥ M1 ∥ EXT start immediately. M2 needs M1's composer + manifest types. M4's CLI half can be stubFetch-tested before 107 lands.

---

## Phase EXT — external coordination (day one)

- [ ] EXT-1: Land the beginning-db ask doc (client package + placements-ceiling security gap + Task 26 advocacy + prebuilt-image nice-to-have) in `beginning-db/.ai/analyses/` and notify that team.
- [ ] EXT-2: Deliver amended 107 to studio-deployment; track their §8 answers (topology, token lifetime, binding storage).
- [ ] EXT-3: When `@beginningdb/client` publishes: add dep, delete the temporary adapter (M2-3), close its tracking task.

## Phase M0 — `@darwinian/mind-tools` (in `darwinian-minds-skills` submodule)

- [x] M0-1: Author five skills in `skills/` (canonical), house SKILL.md sections (frontmatter/Assumes/Input/Directive/Output/Failure Modes/Wraps/Notes):
  - `mind-read`: cat `persona.md` + `beliefs/**/BELIEF.md` via `bgdb fs cat --json`; run at session start.
  - `mind-remember`: create pool entry (`bgdb fs put pool/l5/<yyyy-mm-dd>/<HHmm>-<ulid>.jsonl` with `If-None-Match:*` semantics) → `place` into own `memory/l5/by-date/…`; document the two-call gap and recovery (doctor finds unplaced entries).
  - `mind-share`: `place` an entry into another mind's view path (same filesystem).
  - `mind-forget`: `unplace` own view path only; NEVER `delete_everywhere`; explain LastPlacement risk.
  - `mind-search`: `bgdb search --path-prefix … --json`; note single-prefix-per-request.
  - All: Assumes `BGDB_BASE_URL/TENANT_ID/TOKEN/PATH_PREFIX`; pool paths need the raw-path escape (prefix is `minds/<mindId>`).
- [x] M0-2: `CONVENTIONS.md` in the card source: 110 §4 layout; L5 entry = per-session jsonl, line schema `{ts,type,content,refs?,source?}`; L4 = md + front-matter `{ts,derivedFrom,topics}`; prefix-is-not-security; deletion policy (forget=unplace; retire=human-only).
- [x] M0-3: `cards/mind-tools/card.json` (scaffold below); wire `bundle.json`; `npm run sync:cards`; update `cards/README.md`.

  ```jsonc
  {
    "name": "@darwinian/mind-tools",
    "version": "0.1.0",
    "description": "Agent skills for operating a worker's BeginningDB mind: read persona/beliefs, remember/share/forget memory via pool placements, search mind content.",
    "skills": { "include": ["mind-read", "mind-remember", "mind-share", "mind-forget", "mind-search"] }
  }
  ```
- [x] M0-4: Legacy audit (documentation-only per execution directives; no submodule mutations). Findings, 2026-07-07:
  | Artifact | Verdict | Reason |
  |---|---|---|
  | `cards/base-mind` (`@darwinian/base-mind`) | **Update after M1 lands in a release** | persona/beliefs sections validate again post-M1, but memory semantics (if added) must follow the V1 declaration-only schema; belief entries (`explicit-activation`, `layered-minds`) predate the DB-backed design — content review needed before republish |
  | `manage-active-mind-stack` skill | **Update** | stack commands renamed to `worker stack {list,use,clear}` |
  | `author-mind-content` skill | **Update** | still valid for persona/belief authoring (commands restored), but references `add-memory` (retired in V1) and predates checkpoint/DB-first model |
  | `audit-mind-visibility` skill | **Update** | push gate restored; verify flag names match |
  | `materialize-minds`, `repair-minds`, `inspect-minds`, `recommend-minds`, `support-minds`, `apply-mind-card`, `author-mind-card`, `share-mind-card` skills | **Review batch** | pre-rename "mind card" vocabulary; each needs a pass against the worker-era CLI before recommending; none block the new `@darwinian/mind-card` |
  Retirements: none forced (skills are inert docs); updates queued as follow-up work outside task 72's scope.
- [x] M0-5: Sanity fixture test in main repo: `drwn card apply file:…/cards/mind-tools` + `card source doctor` in a scaffolded fixture (extend an existing `commands-card-*` suite; no new harness).
- [ ] M0-6: Tag + push submodule so `github:…#…` refs resolve for future deploys.

**Acceptance**: card applies cleanly in a fixture; skills documented against CONVENTIONS.md; audit table merged; submodule tagged.

## Phase M1 — `mind-content` restoration

Every task: write/flip the test first (RED), recover from `git show 1c92ae4:<path>`, adapt, GREEN.

- [x] M1-1: Manifest. Flip `test/core-card-manifest.test.ts:71-81` → assertions: valid persona/beliefs/memory accepted; visibility required when include non-empty; `exclude`/`shared` rejected; memory layers `l4|l5|l6` only, `format ∈ md|jsonl|mixed`; **memory `include` rejected in V1** ("memory entries are DB-native; declare layers/formats only"). Then: remove hard-reject (`cli/core/card-manifest.ts:249-255`), restore types + `validateMindContentSection(label, input, errors, { allowFormat })` from SHA :81-120, wire into `validateCardManifest`.
- [x] M1-2: Lock. Restore `CardLockEntry.{persona,beliefs,memory}`, `MINDS_MIN_DRWN_VERSION = "0.7.0"`, `writeCardLock` floor logic (`hasMindContent ? MINDS_… : HOOKS_…`) + normalization; recover deleted `core-card-lock.test.ts` cases.
- [x] M1-3: Source state. Add mind branches to `readCardSourceState` (scan `persona/`, `beliefs/` vs manifest; orphaned/missing detection) + doctor issue codes (`orphaned_persona_dir`, `missing_persona_md`, `orphaned_belief_dir`, `missing_belief_md`); recover `core-card-source.test.ts` mind cases.
- [x] M1-4: Authoring. Restore `addCardSourcePersona/removeCardSourcePersona/addCardSourceBelief/removeCardSourceBelief` + templates + `assertSafeMindContentName`/`assertMindContentVisibility`; four command files `cli/commands/card/source/{add,remove}-{persona,belief}.ts` (options: `--visibility` on add, `--keep-files` on remove, `--dry-run`, `--json`); register in `cli/index.ts` after `CardSourceSetCommand`; recover `commands-card-source-mind-content.test.ts` minus memory-command cases (incl. `DRWN_STORE_READONLY` matrix).
- [x] M1-5: Publish validation. Restore `validatePublishedMindContentDirs` (persona/beliefs; memory branch replaced by a V2 note), call it beside `validatePublishedSkillDirs` in `publishCard` (`card-store.ts:726-727`); recover `core-card-publish-mind-content.test.ts` (minus memory/jsonl cases).
- [x] M1-6: Visibility + gate. Drop in `cli/core/mind-content/visibility.ts` verbatim from SHA; wire `push.ts` (`--remote-visibility`, `--unsafe-push-public`, `readBareRepoManifest`); recover deleted `commands-card-push.test.ts` gate cases (file:// remotes).
- [x] M1-7: Composer. New `cli/core/mind-content/persona-composer.ts`:

  ```typescript
  // ABOUTME: Composes stack-ordered persona entries into a fenced persona.md and parses
  // ABOUTME: fenced documents back into per-(card,entry) sections for diff/checkpoint.
  export interface PersonaSection { card: string; entry: string; content: string }
  export function composePersona(cards: OrderedCardContent[]): string | null
  export function parsePersona(document: string): { sections: PersonaSection[]; outsideFences: string[] }
  // Fence format (canonical, from 1c92ae4 sync-mind.ts:47-60):
  // <!-- drwn:persona:start card="@scope/name" entry="voice" --> … <!-- drwn:persona:end … -->
  ```
  Unit tests: ordering, fence round-trip (compose→parse = identity), outside-fence capture, empty cases. Salvage assertions from old `core-sync-mind.test.ts`/`core-composed-mind.test.ts` (files themselves obsolete).
- [x] M1-8: Recover `scenarios-mind-card-pr1-bash.test.ts` (publish→apply→lock journey), adapted to current CLI.

**Acceptance**: full suite green; a card with persona/beliefs publishes, locks (floor = 0.7.0), pushes through the gate correctly; `@darwinian/base-mind` validates again (queued M0-4 updates can proceed).

## Phase M2 — `mind-store` + provision

- [x] M2-1: Harness first. `test/fixtures/fake-bgdb.ts` (Bun.serve, port 0; state: filesystems→inodes{paths[],version,content}; PUT/GET/DELETE `/v1/fs` with `If-Match`/`If-None-Match` → 412; PATCH append; MKCOL; `/v1/stat`, `/v1/list`; place (same-filesystem enforced) / unplace (LastPlacement → delete-everywhere); `/v1/files/:inode/placements`; `/v1/search?path_prefix`; `/v1/auth/child-token`); `bgdbEnvFor` in `test/helpers.ts`. Self-test file for the fake's CAS/placement matrix.
- [x] M2-2: Foundations. `cli/core/mind-store/config.ts` — `resolveBgdbConfig(env)` (chain: explicit → `BGDB_*` env → binding cache); `paths.ts` — `mindRoot(mindId)`, `poolEntryPath(layer, date, ulid, ext)`, view paths; add `ulid` dep; `MIND_*` DrwnError codes (`MIND_BINDING_NOT_FOUND`, `MIND_DB_UNREACHABLE`, `MIND_PROVISION_EXISTS`, `MIND_SYNC_CONFLICT`, `MIND_POOL_RETIRE_REFUSED`).
- [x] M2-3: Client seam. `cli/core/mind-store/client.ts`:

  ```typescript
  // ABOUTME: Narrow BeginningDB client interface used by mind-store engines; implemented by
  // ABOUTME: @beginningdb/client (target) or the temporary fetch adapter (EXT-3 removes it).
  export interface MindDbClient {
    stat(path: string): Promise<{ etag: string; inodeId: string } | null>
    get(path: string): Promise<{ content: string; etag: string } | null>
    put(path: string, content: string, opts?: { ifMatch?: string; ifNoneMatch?: "*" }): Promise<{ etag: string }>
    append(path: string, content: string): Promise<{ etag: string }>
    delete(path: string, opts?: { everywhere?: boolean }): Promise<void>
    mkdir(path: string): Promise<void>
    list(path: string): Promise<Array<{ name: string; kind: "file" | "dir" }>>
    place(source: string, destination: string): Promise<void>
    unplace(path: string): Promise<void>
    placements(inodeId: string): Promise<string[]>
    search(q: string, opts?: { pathPrefix?: string }): Promise<string[]>
  }
  ```
  Temporary adapter `client-fetch.ts` (marked with removal task EXT-3) if the package hasn't published.
- [x] M2-4: Ledger + seed engine. `ledger.ts` (read/write `mind.json`, drift computation: `in-sync|db-edited|card-updated`); `seed.ts` — inputs: ordered `CardLockEntry[]` + `contentRootsByCard`, obtained from `buildEffectiveState().activeCards` (project scope) or `resolveProjectCards` (ref resolution) — do NOT import `selectActiveCards`/`expandBlueprints` directly, they are module-private (`effective-state.ts:259`, `card-project.ts:63`); plan→execute split (plan is pure, unit-tested; execute hits client). Persona via M1-7 composer; beliefs as copies; memory scaffold dirs; atomic-create semantics.
- [x] M2-5: Verbs `provision`, `status`, `doctor` + parent `mind.ts` under `cli/commands/worker/mind/` (`paths = [["worker","mind",…]]`, `worker stack` pattern); register in `cli/index.ts`. Doctor: unplaced pool entries, pool-orphaned entries (via `placements()`), dangling ledger refs; DB-unreachable → warning. Subprocess tests against fake-bgdb; `--dry-run --json` + double-run idempotency.
- [x] M2-6: TTY confirm utility (`cli/core/confirm.ts`, first in repo — TTY check + stdin readline, `--yes` bypass) + `pool retire` verb (`delete_everywhere`, confirmation-prompted, refuses non-TTY without `--yes`).
- [x] M2-7 (landed with M4-1): Binding cache. `~/.agents/drwn/mind-bindings.json` (non-secret: mindId, slug, baseUrl, filesystemId, pathPrefix); read/write in mind-store; **no token field** — tokens resolved per-invocation (env in V1; deploy API in M4).

**Acceptance**: `worker mind provision` seeds a fixture card's mind into fake-bgdb; `status` shows in-sync; doctor matrices pass; retire refuses without confirmation; idempotency verified.

## Phase M3 — sync / diff / checkpoint

- [x] M3-1: `sync` (rebase): per-ledger-file CAS re-upload (`ifMatch`); 412 → skip + mark `db-edited` (DB-wins, D-6); `--force` card-wins; `--dry-run` plan output; memory paths untouched; rollback case (older card version) test; double-run idempotency.
- [x] M3-2: `diff`: DB-vs-seed per entry — persona via `parsePersona` sections vs card entries; beliefs per-file; outside-fence content surfaced read-only. Ships before checkpoint.
- [x] M3-3: `checkpoint`: map DB edits back to card source (`persona/<entry>/PERSONA.md`, `beliefs/<entry>/BELIEF.md`); outside-fence → `MIND_CHECKPOINT_UNMAPPED` fail-with-guidance; leaves working-tree diff for git review; e2e-style test: seed → fake DB edit → checkpoint → assert source file contents.
- [x] M3-4: Journey covered by `test/scenarios-mind-lifecycle.test.ts` (runAgentsCli + fake-bgdb) instead of recovering the pr2 bash file — same coverage, current harness idioms.

**Acceptance**: the drift matrix (in-sync/db-edited/card-updated × sync/force/dry-run) fully tested; checkpoint round-trip produces reviewable diffs; fence round-trip property holds under edits.

## Phase M4 — deploy integration + e2e (gate: 107)

- [x] M4-1: `deploy.ts`: parse `mindId` (+ optional `mind.binding`) from create response; write binding cache; post-ready: fetch token (`POST /api/minds/:slug/bgdb-token` via `fetchJsonWithWorkerAuth`) → provision/seed. stubFetch tests (in-process) extend the `commands-worker.test.ts` contract.
- [x] M4-2: Covered by the in-process stubFetch deploy contract tests (mindId + binding + token-endpoint 404 paths); a Bun.serve subprocess variant is deferred until a subprocess deploy journey exists to need it.
- [x] M4-3: e2e suite `test/e2e-mind-journey.test.ts`, `skipIf(!process.env.DRWN_E2E_BGDB)`: real BeginningDB (cargo-built, `BGDB_PROFILE=development BGDB_STORAGE=fs BGDB_BEARER_TOKEN=…`); the §Success-criteria-2 journey; plus one contract-test file asserting fake-bgdb and real DB agree on the CAS/placement/append matrix.
- [ ] M4-4: CI: cached Rust build job (or prebuilt image per EXT-1 nice-to-have); e2e job gated + non-blocking for PRs, required for release.
- [x] M4-5: Docs: CHANGELOG entries; knowledge doc for the mind card lifecycle (`.ai/knowledges/` per repo conventions); version bump to 0.7.0 in lockstep (package.json + `DRWN_VERSION` + `MINDS_MIN_DRWN_VERSION` parity).

**Acceptance**: success criteria 2, 3 (when 107 is live), and 5 verified with output; contract tests green against both fake and real.

---

## Execution directives (Remy, 2026-07-07)

- **M0 relocation**: the card is authored as its own git repo at `/Users/pureicis/dev/darwinian-cards/mind-card/` (NOT the darwinian-minds-skills submodule). It is "the mind card": mind-tools skills + persona/beliefs/memory manifest sections + CONVENTIONS.md. M0-3/M0-6 adapt accordingly; M0-4 (legacy audit) still applies to the submodule but is documentation-only here.
- **No worktree, no commits** during this execution — work in the current tree; Remy handles git. (Explicit override of the WIP-branch/commit-frequently rules.)
- Tests at every tier that can run locally: unit + integration (fake servers) + smoke + e2e where feasible (real-DB e2e requires a cargo-built BeginningDB; attempt, else document the gap).

## Standing rules for this task

- TDD per rule 02 on every task; smallest change; match file style; no comments referencing the restoration/history (evergreen only).
- Commit frequently (per-task granularity); WIP branch `task/72-mind-card`; submodule work on its own branch/PR.
- Any deviation from 110/111 → stop, record in this doc, confirm with Remy.
- Update checkboxes here as tasks land; phase acceptance requires pasted verification output in the PR/commit description.
