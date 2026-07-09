# ABOUTME: Implementation strategy for the mind card (target architecture in analysis 110): milestone work breakdown with TDD sequencing, harness build order, integration-point map, external-coordination timeline, and the strategy decisions surfaced by the code-level investigation.
# ABOUTME: Grounded in four investigations at HEAD — recovery delta from 1c92ae4, mind-store integration points, test-harness inputs, and the M0 card home — all with file:line citations.

# Analysis 111 — Mind Card: Implementation Strategy

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Draft — strategy for review; task plan (`.ai/tasks/`) follows ratification
**References**: [.ai/analyses/110_mind-card-target-architecture.md (ratified), .ai/analyses/109_shared-memory-pool-design-investigation.md, .ai/analyses/107_deploy-api-mind-binding-change-request.md]

---

## 1. Strategy in one paragraph

Build in the 110 §10 milestone order, but **start three things in parallel on day one**: (a) M0 — the `@darwinian/mind-tools` card in the `darwinian-minds-skills` submodule (no core changes, validates all DB conventions end-to-end); (b) M1 — the `mind-content` restoration, which is offline, nearly verbatim from `1c92ae4`, and touches exactly six core files + four command files; (c) **sending the two external asks** — the `@beginningdb/client` package request (hard critical path for M2) and the amended 107 (gates M4). M2/M3 build the `mind-store` module behind a client interface with a fake BeginningDB harness; M4 wires the deploy path. Every milestone lands with its tests per house TDD rules; the harness pieces are built just-in-time per the dependency table in §6.

## 2. What the investigation established (evidence base)

1. **The restoration is cheap and low-risk.** File-by-file mapping of `1c92ae4` → HEAD: types, `validateMindContentSection`, lock fields + `MINDS_MIN_DRWN_VERSION`, authoring functions + templates, `validatePublishedMindContentDirs`, the entire `visibility.ts` (89 lines), push-gate wiring, and the four command files are all **verbatim-adaptable** — every helper they import (`isSafePathPart`, `assertStoreWritable`, `writeAtomically`, `DrwnError`) survives at HEAD unchanged. Two real work items: `readCardSourceState` needs its mind-scanning branches rebuilt alongside today's skills/hooks logic, and `personaContent` is extracted into `mind-content/persona-composer.ts` with an array-of-cards signature (stack-order composition + fence parse for checkpoint). Exactly one HEAD test asserts the hard-reject (`test/core-card-manifest.test.ts:71-81`) and flips to positive assertions.
2. **mind-store has clean seams.** `fetchJsonWithWorkerAuth` (`cli/core/worker-http.ts:21-55`) is the pattern for the `bgdb-token` call; `resolveWorkerConfig` (`cli/core/worker-config.ts:9-22`) is the template for `resolveBgdbConfig` (`BGDB_*` env chain); the ordered active-card list + `contentRootsByCard` hand the seed engine its inputs — note `selectActiveCards` (`effective-state.ts:259-271`) and `expandBlueprints` (`card-project.ts:63-99`) are **module-private**; engines consume `buildEffectiveState().activeCards` (project scope) or `resolveProjectCards` (ref resolution) instead; `renderJson`/`SyncResult`/`writeManagedFile` cover output conventions; `worker stack` (`paths = [["worker","stack","use"]]`) is the sub-subcommand template for `worker mind`. Gaps to build: an interactive TTY confirm (none exists; needed for `pool retire`), a `ulid` dependency, `MIND_*` DrwnError codes, and a home for the binding cache (§4.1).
3. **The test harness has strong precedent and one process-boundary subtlety.** `cli-auth-e2e.test.ts` is the Bun.serve fake-server lifecycle model; `commands-worker.test.ts` already fakes the deploy API — but via `stubFetch` (patching `globalThis.fetch`), which only works for **in-process** command invocation, not `runAgentsCli` subprocesses. The fake BeginningDB (`test/fixtures/fake-bgdb.ts`, ~250 lines: filesystems, inode versions, placements with same-filesystem enforcement + LastPlacement fallback, ETag CAS, PATCH append, child-token check) must be Bun.serve since skills/CLI run as subprocesses. Real-DB e2e is heavier than assumed: `docker-compose.dev.yml` ships only SpiceDB; BeginningDB itself is a cargo-built binary (`BGDB_PROFILE/BGDB_DATA_DIR/BGDB_STORAGE=fs`, ~2–5 min Rust build) — gate with `DRWN_E2E_BGDB=1` and treat CI setup as its own small task (or ask beginning-db for a prebuilt image).
4. **M0 has a natural home with existing infrastructure — and a legacy surprise.** The `darwinian-minds-skills` submodule hosts cards (`cards/<name>/card.json`) with a canonical-skills + `npm run sync:cards` pipeline and established SKILL.md conventions (frontmatter / Assumes / Input / Directive / Output / Failure Modes / Wraps). The surprise: **pre-descope artifacts live there today** — `@darwinian/base-mind`'s card.json carries persona/beliefs sections (currently hard-rejected by HEAD validation) and skills like `author-mind-content` and `manage-active-mind-stack` reference retired commands. Deploy accepts only git-resolvable refs (`file:` rejected, `deploy.ts:59-61`), so deployed-worker use of the card requires the submodule's GitHub remote.

## 3. Milestones — work breakdown and TDD order

### M0 — `@darwinian/mind-tools` (submodule; parallel with M1; no gates)

1. **Author five skills** in `darwinian-minds-skills/skills/`: `mind-read`, `mind-remember` (create-in-pool + place, two-call pattern), `mind-share`, `mind-forget` (unplace only — never delete-everywhere), `mind-search` (single-`path_prefix` note). Follow the house SKILL.md sections; wrap `bgdb` subprocess with `--json`; document `BGDB_*` assumptions and raw-path escape for `pool/…` (prefix = `minds/<mindId>`).
2. **CONVENTIONS.md** in the card: 110 §4 layout, entry schemas (L5 per-session jsonl `{ts,type,content,refs?,source?}`; L4 md + front-matter `ts/derivedFrom/topics`), pool paths `pool/l4|l5/<yyyy-mm-dd>/<HHmm>-<ulid>.*`, prefix-is-not-security, deletion policy.
3. **Card** `cards/mind-tools/card.json` (skills-only; no persona/beliefs/memory sections — so it validates at HEAD *before* M1 lands); wire `bundle.json` + `sync:cards`; publish locally; tag for git-ref deploys.
4. **Legacy audit** (small, bounded): inventory the submodule's pre-descope artifacts (`base-mind` persona/beliefs sections; `author-mind-content`, `manage-active-mind-stack`, `inspect-minds` skills) — mark each *update after M1* / *retire*; don't let stale directives ship alongside the new card.
5. **Tests**: skills are prose, but the conventions get executable checks in M2's fake-bgdb suites (skill-documented command sequences replayed against the fake). V0 sanity: `drwn card apply file:…` + `card source doctor` in a fixture.

### M1 — `mind-content` restoration (offline; parallel with M0; no gates)

TDD order per the recovery map (RED first on each step):

1. Flip `core-card-manifest.test.ts:71-81` to positive/negative mind-section assertions → remove hard-reject (`card-manifest.ts:249-255`), restore types + `validateMindContentSection` (memory: layers/formats only, no `include` in V1).
2. Lock: restore fields + `MINDS_MIN_DRWN_VERSION` (value: next release, e.g. `"0.7.0"`) + `writeCardLock` floor logic; recover the deleted `core-card-lock.test.ts` cases.
3. `readCardSourceState` mind branches + doctor issue codes; recover `core-card-source.test.ts` mind cases.
4. Authoring functions + four commands (`add/remove-{persona,belief}`) + `cli/index.ts` registration (after `CardSourceSetCommand`, line 55); recover `commands-card-source-mind-content.test.ts` **minus** memory-command cases.
5. Publish validation (`validatePublishedMindContentDirs`, persona/beliefs; memory validation stubbed with a V2 note); recover `core-card-publish-mind-content.test.ts`.
6. `visibility.ts` verbatim + push-gate wiring in `push.ts`; recover the deleted `commands-card-push.test.ts` gate cases.
7. `mind-content/persona-composer.ts`: compose (ordered cards → fenced persona.md) + parse (fence-aware entry extraction — checkpoint's foundation). New unit tests (the old sync-mind/composed-mind tests are **obsolete** — local materialization died with the DB-only decision; salvage only their composition assertions).
8. Recover `scenarios-mind-card-pr1-bash.test.ts` (publish→apply→lock journey), adapted.

Module layout note: restored code lands in `cli/core/mind-content/` where separable (composer, visibility); type/lock/source/store integrations stay in their host files at the marked seams — chasing full physical extraction of manifest/lock wiring isn't worth the churn (matches 112's "narrow seams" intent).

### M2 — `mind-store` foundation + provision (gate: client package, softened by §4.2)

1. Harness first: `test/fixtures/fake-bgdb.ts` (Bun.serve; state model per investigation sketch) + `bgdbEnvFor` helper extension.
2. `resolveBgdbConfig` (env chain), path conventions (mind root, pool paths, ULIDs — add `ulid` dep), `MIND_*` error codes.
3. Client seam: `mind-store/client.ts` defining the narrow interface the engines use (get/put/patch/delete/mkcol/stat/list/place/unplace/placements/search/child-token), implemented by `@beginningdb/client` (§4.2 for the gap plan).
4. Seed engine: ordered active cards → composed persona (M1 composer) + belief copies + memory scaffolding + `mind.json` ledger; **provision** verb (atomic-create aware, idempotent — double-run test).
5. `status` (drift table from ledger vs live ETags) + `doctor` (GC states: unplaced, pool-orphaned, dangling refs; DB-unreachable = warning). TTY confirm utility + `pool retire` (human-only).
6. Command group `cli/commands/worker/mind/{mind,provision,status,doctor,pool-retire}.ts` (`worker stack` pattern). Tests: in-process with `stubFetch` where the verb is thin; subprocess + fake-bgdb for the engine paths.

### M3 — rebase / diff / checkpoint (gate: M2)

1. `sync` (rebase): CAS re-upload per ledger; 412 → skip + drift (DB-wins); `--force`; `--dry-run`; idempotency tests; rollback-re-seed case.
2. `diff`: fence-aware DB-vs-seed diff (composer parse + ledger) — ships before checkpoint.
3. `checkpoint`: write DB edits back to card source entries; outside-fence → fail-with-guidance; belief per-entry mapping; end-to-end test: seed → DB edit (via fake) → checkpoint → git-visible source diff.
4. Recover/adapt `scenarios-mind-card-pr2-bash.test.ts` as the M3 journey.

### M4 — deploy integration (gate: 107 landed server-side)

1. `deploy.ts`: consume `mindId` (+ optional binding) from the create response (`deploy.ts:122-137`); call `POST /api/minds/:slug/bgdb-token` via `fetchJsonWithWorkerAuth`; run provision/seed post-ready.
2. Binding cache (§4.1) + `status` integration.
3. Deploy-API fake: extend the `commands-worker.test.ts` stubFetch contract with `mindId`+binding; add a Bun.serve deploy fake for subprocess journeys.
4. `DRWN_E2E_BGDB=1` e2e suite: real BeginningDB journey (publish → deploy(fake API) → provision → skill-append → DB-edit → rebase → checkpoint); CI job builds/caches the Rust binary (or uses a prebuilt image if beginning-db provides one).

## 4. Strategy decisions surfaced by the investigation

### 4.1 Binding cache location — **decide: machine-scoped, non-secret**

`ProjectConfig` is committed to repos — tokens can never live there, and bindings are deployment artifacts, not project intent. **Proposal**: non-secret binding coordinates (`mindId`, `baseUrl`, `filesystemId`, `pathPrefix`, slug) cached in `~/.agents/drwn/mind-bindings.json`; tokens are **never persisted by drwn** — fetched on demand from `POST /api/minds/:slug/bgdb-token` (DAH-authed) and held in memory per invocation. Container-side tokens are the runner's business (107 R3). Revisit only if token-fetch latency hurts.

### 4.2 The client-package gap — **decide: interface-first, no permanent fallback**

R-6 ruled out vendoring; the package doesn't exist yet. Plan: (i) the ask goes out **now** (§5); (ii) M0/M1 need no client; (iii) M2's engines depend only on the `mind-store/client.ts` interface. If the package isn't published when M2's engine work starts, implement the interface with a minimal internal fetch adapter **explicitly marked temporary**, with a tracked removal task gated on package availability — the adapter is ~10 small methods against a documented HTTP surface, not vendored beginning-db code. This keeps R-6's destination while refusing to hard-block M2 on another repo's release schedule. Needs Remy's nod, since it grazes R-6's spirit.

### 4.3 Test-invocation split — in-process vs subprocess

`stubFetch` cannot cross the `runAgentsCli` process boundary. Rule: **engine/integration tests run subprocess against Bun.serve fakes** (fake-bgdb + fake deploy API); **thin-verb unit tests may run in-process with stubFetch** (existing `commands-worker.test.ts` pattern). The fake-bgdb is therefore a hard prerequisite for M2's first engine test — it's step 1 of M2, not an afterthought.

### 4.4 Submodule legacy artifacts

`@darwinian/base-mind` (persona/beliefs sections) is invalid against HEAD today and becomes valid again after M1 — but its content and the three mind-era skills predate the whole DB-backed design. M0's audit (step 4) decides update-vs-retire per artifact; nothing ships in the new card's blast radius without passing that audit.

## 5. External coordination (start immediately — critical path)

| Ask | To | Gates | Action |
|---|---|---|---|
| `@beginningdb/client` package (109 §7.1: client fns, target resolution, path utils, types, exports map, publish pipeline, placements + child-token coverage, 0.x stability statement) | beginning-db repo | M2 engines (softened by §4.2) | Draft request doc in that repo's `.ai/` — **first action after this doc is ratified** |
| Placements-listing ceiling gap (109 §2.6) | beginning-db | nothing (security hygiene) | Include in same doc |
| Task 26 (ReBAC-on-VFS) prioritization + append-capable folder grants | beginning-db | V2 org pools only | Include as advocacy section |
| 107 (amended) — binding, bgdb-token, env injection, topology | studio-deployment | M4 | Already drafted; deliver |
| Prebuilt BeginningDB image (nice-to-have for e2e CI) | beginning-db | e2e CI ergonomics | One line in the ask doc |

## 6. Harness build order (TDD dependency table)

| Harness piece | Must exist before | Est. size |
|---|---|---|
| (none — prose + fixture apply) | M0 | — |
| (none — pure unit + existing helpers) | M1 | — |
| `test/fixtures/fake-bgdb.ts` + `bgdbEnvFor` | M2 first engine test | ~250 lines |
| fake deploy API (stubFetch contract ext. + Bun.serve variant) | M4 first test | small |
| Real-DB e2e runner (`DRWN_E2E_BGDB=1`, cargo-built binary or image) | M4 e2e suite (does not block feature work) | CI task |

## 7. Sizing and parallelism

Relative sizing (not hours): **M0 = S–M** (five skills + conventions + audit), **M1 = M** (mostly recovery; the two rewrite spots are bounded), **M2 = L** (new module + harness + three verbs), **M3 = M–L** (checkpoint's fence mapping is the hardest new logic in the project), **M4 = M** (thin CLI work + e2e plumbing, mostly waiting on 107). M0 ∥ M1 immediately; M2 starts when M1's composer + manifest land (fake-bgdb can be built during M1); M3 strictly after M2; M4 whenever 107 lands (its CLI side can be stubFetch-tested earlier).

## 8. Execution risks

1. **Client package timing** — mitigated by §4.2; residual risk is API drift between our interface assumption and the published package (mitigate: pin the ask doc to the HTTP surface we verified).
2. **Checkpoint fence mapping** — the one algorithmically novel piece; de-risk by shipping `diff` first (M3.2) and keeping outside-fence handling fail-closed.
3. **Fake-vs-real semantic drift** — the fake-bgdb encodes our *reading* of placement/CAS semantics; the M4 e2e suite is the safety net, plus one contract-test file asserting fake and real agree on the core matrix (412, LastPlacement, append).
4. **Submodule coordination** — M0 lives in a separate git repo (submodule) with its own PR flow; keep card version tags in lockstep with the audit outcome.
5. **107 latency** — M4 is the only milestone hostage to it; everything else proceeds.

## 9. Ratification asks (then the task plan)

1. Bless the milestone plan + parallelism (§3, §7).
2. §4.1 binding cache (machine-scoped non-secret JSON; tokens never persisted by drwn).
3. §4.2 client-gap plan (interface-first with explicitly-temporary adapter if the package lags) — this one grazes R-6, so it's yours to call.
4. §4.4 audit-then-update/retire approach for the submodule's legacy mind artifacts.

On ratification: task plan lands as `.ai/tasks/<next>_mind-card-implementation-plan.md` with per-milestone task lists, code scaffolds, and acceptance criteria per rule 06; the beginning-db ask doc goes out in parallel.
