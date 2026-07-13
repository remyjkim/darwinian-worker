# ABOUTME: Test-first implementation plan for explicit Worker roots, one active Worker, aggregate Blueprint materialization, and minimum project/default isolation.
# ABOUTME: Implements only the ratified Analysis 116 core and delegates machine, Library, Store-transfer, and ambient-enforcement proposals to Tasks 79-83.

# Task 77: Worker Roots and Defaults Remediation Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task and `verification-before-completion` before every part gate.

**Goal:** Make drwn materialize one Worker per top-level root, select at most one active Worker per project, compose capabilities only through Cards in one Blueprint, and prevent machine capability defaults from becoming undeclared project inputs.

**Architecture:** Project requirements become a structured Worker-root graph instead of a flat Card list. Lockfile V6 stores roots, member edges, and independently pinned Card entries; effective state expands one selected root to its closure; `write` compiles installed roots but projects only the active one. This task isolates project output from machine defaults while preserving existing machine bootstrap and projection behavior for Task 80.

**Tech Stack:** Bun, TypeScript 6, Clipanion, JSON project/lock schemas, existing vendored Card store and managed-path reconciler, `bun:test`.

---

**Status**: Revision 4 - execution-ready for the ratified Task 77 core; Tasks 79-83 remain independently gated

**Created**: 2026-07-12

**Revised after execution-readiness audit**: 2026-07-12

**Priority**: High

**Target release**: 0.8.0. Task 0 must stop and revise the recorded floor if `package.json` is no longer 0.7.x when execution begins.

**Architecture authority**: Ratified core in `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md` section 0.1

**Separated follow-ups**:

- Task 79: fail-closed Store export security hotfix;
- Task 80: machine defaults/schema/projection remediation, blocked on D1;
- Task 81: Library lifecycle and persistence;
- Task 82: portable Store export/seed;
- Task 83: target-specific ambient conflict policy, blocked on D2.

**Historical context**: `.ai/analyses/100_workers-cli-target-architecture-and-decisions.md`, `.ai/analyses/101_workers-cli-implementation-strategy.md`, `.ai/analyses/114_drwn-worker-cli-architecture.html`, `.ai/tasks/69_worker-migration-unified-sequential-plan.md`

**Execution context**: Task 0 creates a dedicated worktree from `/Users/pureicis/dev/darwinian-minds`. Do not begin Task 1 in the source checkout. Consumer changes under `/Users/pureicis/dev/darwinian-cards` occur only at the explicit read-only and post-CLI rollout checkpoints in Task 13.

---

## 0. Ratified behavior

These decisions are closed for Task 77:

- Cards are the only stackable capability unit.
- A `kind:"blueprint"` Card composes plain Cards into one Worker.
- A plain Card root is a degenerate one-Card Worker.
- A project may install multiple Worker roots as alternatives.
- A project has zero or one active Worker, never an active Worker stack.
- Blueprint members remain independently locked, vendored, verified, and attributed.
- Only top-level roots receive generated Worker folders.
- `drwn write` never selects a Worker or changes project requirements.
- Project writes do not inherit machine defaults implicitly.
- `machine.json` is machine-default authority; `~/.agents/skills` is derived output.
- Notion OAuth and third-party MCP installation/authentication remain operator actions, not `write` responsibilities.

### Acceptance examples

| Scenario | Required result |
|---|---|
| One Blueprint root with three members | Four lock entries, four vendored artifacts, one generated Worker folder |
| Blueprint selected | Root plus all three member capabilities active |
| Member name passed to `use` | Rejected because the member is not an installed root |
| Two roots, no `activeWorker` | `write` fails with `MULTIPLE_WORKERS_REQUIRE_SELECTION` |
| Two installed roots, one selected | Both root bundles generated; only selected closure projected |
| Legacy `activeWorkers:[a,b]` | Migration stops with `WORKER_STACK_UNSUPPORTED`; no arbitrary winner |
| Legacy `cards:[a,b]` with no selection | Migration stops with `LEGACY_MULTI_CARD_COMPOSITION_AMBIGUOUS`; previous composition is not reclassified silently |
| Project write with machine curated skills | Skills remain absent unless the project Worker/overlay declares them |
| Machine default IDs change with project intent unchanged | Project output remains byte-identical |
| Ambient user-home capability exists | Status/doctor report it separately; it is never imported into project declaration |
| MCP definition exists only in an inactive root | ID-only project toggle fails with `MCP_DEFINITION_NOT_EFFECTIVE` |

### Analysis 116 traceability

| Analysis 116 contract | Owning tasks |
|---|---|
| Project config V2, lock V6, graph and closure | 1-3 |
| Root-only generated bundles and pure write | 4-5 |
| Canonical project commands and singular selection | 6-7 |
| One declared-state evaluator, overlays, local lanes, read-only ambient visibility | 8 |
| Minimum project isolation from machine capability state | 9 |
| Project Card capture boundary | 10 |
| Deploy and mind-store one-root closure | 11 |
| Forward documentation and migration guide | 12 |
| Explicit cross-project audit, release floor, consumer handoff | 13 |
| Stable Worker/migration diagnostics | 2, 3, 8-9 |

Analysis 116 follow-up proposals are intentionally deferred to Tasks 79-83. Task 77 completion does not imply that D1, D2, machine schema V2, Library lifecycle, portable Store transfer, or Store-wide persistence behavior has been approved or implemented.

---

## 1. Execution rules

1. Work in the numbered order below. Each task changes one contract and has a focused red/green gate.
2. Do not update snapshots to preserve flat or stacked behavior. Replace those assertions with the ratified behavior.
3. Keep lockfiles V2-V5 readable while writing V6 only.
4. Treat project config V1 as migration input and V2 as the only output of mutating commands.
5. Do not infer a winner from a legacy multi-Worker stack.
6. Keep historical `.ai/analyses` and completed tasks unchanged. Update forward-facing knowledge and CLI docs only.
7. Commit after every numbered task once its focused tests and typecheck pass.
8. Run `bun test` at each part boundary and `bun run verify:release --json` before completion.
9. A red baseline is a blocker. Fix or explicitly isolate it before Task 1; do not classify pre-existing failures as Task 77 regressions.
10. Every project mutation first builds and validates complete next-state bytes, then commits them through the transaction helper defined in Task 6.
11. Commands that inspect or validate effective capability state must call the evaluator defined in Tasks 3 and 8; they must not reconstruct precedence independently.
12. Do not change fresh machine defaults, machine projection cleanup, curation commands, ordinary Store export/seed, Library lifecycle, or ambient write-blocking semantics in this task.

---

### Task 0: Anchor the authority, prove the baseline, and create the worktree

**Files:**
- Add to prerequisite code commit: `test/commands-auth.test.ts`
- Add to architecture commit: `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md`
- Add to architecture commit: `.ai/tasks/77_drwn-cli-worker-roots-and-defaults-remediation-plan.md`
- Add to architecture commit: `.ai/tasks/79_drwn-store-export-security-hotfix-plan.md`
- Add to architecture commit: `.ai/tasks/80_drwn-machine-defaults-v2-remediation-plan.md`
- Add to architecture commit: `.ai/tasks/81_drwn-library-lifecycle-and-persistence-plan.md`
- Add to architecture commit: `.ai/tasks/82_drwn-portable-store-transfer-plan.md`
- Add to architecture commit: `.ai/tasks/83_drwn-ambient-capability-policy-plan.md`

**Step 1: Verify the environment-independent auth-test repair**

The command fixture must inject a non-TTY `stdin` rather than forwarding the executor's real terminal. This prevents the login test from waiting for Enter when the full suite is launched from a PTY.

Run both modes:

```bash
bun test test/commands-auth.test.ts
script -q /dev/null bun test test/commands-auth.test.ts
```

Expected: both runs report 7 pass, 0 fail. On platforms where `script` has a different argument shape, use the platform equivalent that allocates a PTY and record the exact command.

**Step 2: Commit the unrelated auth fixture independently**

```bash
git add test/commands-auth.test.ts
git diff --cached --check
git diff --cached --name-only
git commit -m "test(auth): isolate login fixture from terminal state"
```

Expected staged path: exactly `test/commands-auth.test.ts`.

**Step 3: Establish a clean baseline**

Run:

```bash
bun run typecheck
bun test
bun run verify:release --json
```

Expected: typecheck exit 0, test failures 0, and release verification `ok:true`. Record exact test counts in the execution log. Stop here if any command is red.

**Step 4: Commit the architecture and separated plans**

Confirm that only the intended preparation files are staged:

```bash
git add .ai/analyses/116_drwn-cli-card-worker-target-architecture.md .ai/tasks/77_drwn-cli-worker-roots-and-defaults-remediation-plan.md .ai/tasks/79_drwn-store-export-security-hotfix-plan.md .ai/tasks/80_drwn-machine-defaults-v2-remediation-plan.md .ai/tasks/81_drwn-library-lifecycle-and-persistence-plan.md .ai/tasks/82_drwn-portable-store-transfer-plan.md .ai/tasks/83_drwn-ambient-capability-policy-plan.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs(cli): scope worker root migration and follow-ups"
```

Expected staged paths: exactly the seven architecture/task paths above. The auth test and unrelated Task 78 completion record must not be staged.

**Step 5: Create and enter the implementation worktree**

From `/Users/pureicis/dev/darwinian-minds`:

```bash
git worktree add ../darwinian-minds-task-77 -b feat/task-77-worker-roots
cd ../darwinian-minds-task-77
git status --short
```

Expected: the worktree contains Analysis 116 and Tasks 77/79-83 and starts clean. All remaining Task 77 implementation work runs there; the separated plans are not implicitly authorized by their presence.

---

## Part A: Root graph and single selection

### Task 1: Add the structured Worker graph and lockfile V6

**Files:**
- Create: `cli/core/worker-graph.ts`
- Modify: `cli/core/card-lock.ts`
- Modify: `cli/core/card-project.ts` initially; rename/move consumer functions in Task 6
- Modify: `cli/core/config-local.ts`
- Create: `test/core-worker-graph.test.ts`
- Modify: `test/core-card-lock.test.ts`
- Modify: `test/core-blueprint-composition.test.ts`

**Step 1: Write failing lock graph tests**

Add tests proving:

- a Blueprint root resolves to one root record plus its member Card entries;
- a plain Card resolves to a root with `members:[]`;
- two roots sharing an identical member store one Card entry and two edges;
- two roots resolving the same Card name to incompatible versions fail;
- nested Blueprints still fail with `BLUEPRINT_MEMBER_IS_BLUEPRINT`;
- `writeCardLock` writes V6 and validates every root/member reference;
- V2-V5 fixtures remain readable;
- `card.lock.local` may replace a locked root/member or add a local-only root without corrupting committed V6 identity;
- a local replacement whose manifest name/kind disagrees with the edge it replaces fails before effective-state construction.

Use this target shape:

```ts
export interface WorkerRootLockEntry {
  name: string;
  requested: string;
  kind: "card" | "blueprint";
  members: string[];
}

export interface CardLockfileV6 {
  lockfileVersion: 6;
  store?: CardLockStoreMetadata;
  workerRoots: WorkerRootLockEntry[];
  cards: CardLockEntry[];
}
```

Run:

```bash
bun test test/core-worker-graph.test.ts test/core-card-lock.test.ts test/core-blueprint-composition.test.ts
```

Expected: FAIL because V6 and `resolveWorkerGraph` do not exist.

**Step 2: Implement graph resolution**

Implement a single root-aware resolver:

```ts
export interface ResolvedWorkerGraph {
  roots: WorkerRootLockEntry[];
  cards: CardLockEntry[];
}

export async function resolveWorkerGraph(
  agentsDir: string,
  specs: string[],
  options: ResolveCardOptions = {},
): Promise<ResolvedWorkerGraph>;
```

Resolve each top-level spec first, then resolve a Blueprint's direct `composedFrom` members. Preserve root and member order. Deduplicate by name only when version, integrity, and tree SHA agree. Return errors before writing project config or lock state.

**Step 3: Implement V6 validation and persistence**

Change `writeCardLock` and `persistCardLock` to receive the graph rather than only `cards`. Validate:

- unique root names;
- unique Card names;
- root Card exists;
- member Card exists and is not a Blueprint;
- root `kind` agrees with its manifest;
- no unreachable Card entries;
- all current integrity/tree-SHA rules remain enforced.

Keep a legacy read union for V2-V5. Do not synthesize fake roots inside `validateCardLockfile`; root reconstruction needs project config and belongs in the migration adapter added in Task 2.

Define the local-lock V6 shape in this task. It uses the same `workerRoots`/`cards` graph, remains ignored by Git, and overlays by Card name. Local-only roots are selectable only through `config.local.json activeWorker`; committed `config.json` must never persist a local-only name.

**Step 4: Run focused tests**

Run the command from Step 1. Expected: PASS.

**Step 5: Typecheck and commit**

```bash
bun run typecheck
git add cli/core/worker-graph.ts cli/core/card-lock.ts cli/core/card-project.ts cli/core/config-local.ts test/core-worker-graph.test.ts test/core-card-lock.test.ts test/core-blueprint-composition.test.ts
git commit -m "feat(worker): persist explicit root dependency graph"
```

---

### Task 2: Introduce project config V2 and migrate to one active Worker

**Files:**
- Modify: `cli/core/types.ts`
- Create: `cli/core/project-config-migration.ts`
- Modify: `cli/core/project.ts`
- Modify: `cli/core/project-writes.ts`
- Modify: `cli/core/config-local.ts`
- Create: `test/core-project-config-migration.test.ts`
- Modify: `test/core-effective-state-overlay.test.ts`

**Step 1: Write failing normalization tests**

Cover this matrix:

```text
V1 cards=[]; activeWorkers absent      -> workers=[]; activeWorker absent
V1 cards=[a]; activeWorkers absent     -> workers=[a]; activeWorker absent (implicit a)
V1 cards=[a,b]; activeWorkers absent   -> LEGACY_MULTI_CARD_COMPOSITION_AMBIGUOUS; zero writes
V1 activeWorkers=[]                    -> activeWorker=null
V1 activeWorkers=[a]                   -> activeWorker=a
V1 activeWorkers=[a,b]                 -> WORKER_STACK_UNSUPPORTED
V2 activeWorker=member                 -> ACTIVE_WORKER_NOT_INSTALLED
config.local activate=[]               -> activeWorker=null
config.local activate=[a]              -> activeWorker=a
config.local activate=[a,b]            -> WORKER_STACK_UNSUPPORTED
```

Run:

```bash
bun test test/core-project-config-migration.test.ts test/core-effective-state-overlay.test.ts
```

Expected: FAIL because V2 fields and migration errors do not exist.

**Step 2: Add target config types**

Represent V2 explicitly:

```ts
export interface ProjectConfigV2 extends ProjectConfigBase {
  version: 2;
  workers?: string[];
  activeWorker?: string | null;
}
```

Retain a private `ProjectConfigV1` input type with `cards?` and `activeWorkers?`. Runtime code past the loader must consume only normalized V2.

Change local activation from `activate?: string[]` to `activeWorker?: string | null`, while accepting legacy `activate` during migration.

**Step 3: Implement read and write policy**

- Read V1 and V2.
- Normalize V1 in memory without modifying files during `status`, `doctor`, dry-run, or `write`.
- Mutating commands persist V2 atomically.
- Return migration warnings in structured output.
- Never collapse a multi-name legacy stack.
- Treat multiple V1 `cards[]` with absent `activeWorkers` as previous implicit composition, not alternative roots. Return `LEGACY_MULTI_CARD_COMPOSITION_AMBIGUOUS` before config, lock, vendor, generated, or downstream writes.
- Let `doctor --fix --active <name>` explicitly classify the old Cards as alternatives and choose one, or let `doctor --fix --blueprint <ref>` replace them with a previously published Blueprint. Neither path authors or publishes a Blueprint implicitly.
- Include the old Card list, previous effective capabilities, and exact proposed V2/V6 bytes in dry-run JSON.

Add a fixture matching `/Users/pureicis/dev/darwinian-cards/.agents/drwn/config.json`: three top-level Cards, no `activeWorkers`. Assert the migration error and byte identity for every project-owned file.

**Step 4: Run tests and typecheck**

Expected: focused tests PASS; `bun run typecheck` PASS.

**Step 5: Commit**

```bash
git add cli/core/types.ts cli/core/project-config-migration.ts cli/core/project.ts cli/core/project-writes.ts cli/core/config-local.ts test/core-project-config-migration.test.ts test/core-effective-state-overlay.test.ts
git commit -m "feat(project): migrate to one active worker"
```

---

### Task 3: Make effective state select one root and expand its closure

**Files:**
- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/types.ts`
- Modify: `cli/core/card-skill-resolver.ts`
- Retire: `test/core-effective-state-stack.test.ts`
- Create: `test/core-effective-state-worker.test.ts`
- Modify: `test/core-effective-state.test.ts`
- Modify: `test/core-skill-conflict.test.ts`
- Modify: `test/core-worker-hook-stack.test.ts`

**Step 1: Replace stack tests with single-root tests**

Assert:

- zero roots produces no active closure;
- one root with no explicit selection is implicitly active;
- multiple roots without selection throws `MULTIPLE_WORKERS_REQUIRE_SELECTION`;
- explicit selection expands root plus members;
- selection of a dependency Card throws `ACTIVE_WORKER_NOT_INSTALLED`;
- `activeWorker:null` produces no active closure;
- no code path unions two roots.

Run:

```bash
bun test test/core-effective-state-worker.test.ts test/core-effective-state.test.ts test/core-skill-conflict.test.ts test/core-worker-hook-stack.test.ts
```

Expected: FAIL against the current `selectActiveCards` name filter.

**Step 2: Replace flat selection with root selection**

Remove `selectActiveCards`. Add a selector with no merge path:

```ts
export function selectActiveWorker(
  graph: ResolvedWorkerGraph,
  requested: string | null | undefined,
): { root: WorkerRootLockEntry | null; cards: CardLockEntry[] };
```

The selected closure is `[rootCard, ...memberCards]`. `skillApplyOrderCards`, server collection, hook composition, and instruction generation must receive this closure. `lockedCards` remains the full artifact set for vendoring and integrity.

**Step 3: Add strict capability collision reporting**

Retain existing duplicate-skill diagnostics but make conflicts closure-local and source-attributed. Add the stable `WORKER_CAPABILITY_CONFLICT` code for incompatible skill or MCP definitions. Project overlays remain explicit last precedence and must emit provenance in status output later.

**Step 4: Run tests, typecheck, commit**

```bash
bun test test/core-effective-state-worker.test.ts test/core-effective-state.test.ts test/core-skill-conflict.test.ts test/core-worker-hook-stack.test.ts
bun run typecheck
git add cli/core/effective-state.ts cli/core/types.ts cli/core/card-skill-resolver.ts test/core-effective-state-stack.test.ts test/core-effective-state-worker.test.ts test/core-effective-state.test.ts test/core-skill-conflict.test.ts test/core-worker-hook-stack.test.ts
git commit -m "fix(worker): activate one root with its card closure"
```

**Part A gate:** Run `bun run typecheck` and `bun test`. Expected: typecheck exit 0 and test failures 0.

---

## Part B: Aggregate Worker materialization

### Task 4: Generate one aggregate bundle per root

**Files:**
- Modify: `cli/core/worker-generator/sync-worker.ts`
- Modify: `cli/core/store-paths.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/write-record.ts`
- Modify: `test/core-sync-worker.test.ts`
- Modify: `test/core-reconcile.test.ts`

**Step 1: Write failing generated-layout tests**

Create a fixture with one Blueprint and two member Cards. Assert:

- `generated/workers/<blueprint>/` exists;
- member Worker directories do not exist;
- aggregate skills, MCP definitions, hooks, and instructions are present under the Blueprint directory;
- `worker.json` names the root and lists member name/version/integrity provenance;
- `workers.json` lists roots only;
- switching active roots changes downstream projection but retains both root bundles;
- removing a root cleans its stale generated directory.
- inactive-root bundles contain only their own locked closure and never receive active-root content or project overlays;
- project overlays appear only in downstream project surfaces and active status, not in any reusable generated root bundle.

Run:

```bash
bun test test/core-sync-worker.test.ts test/core-reconcile.test.ts
```

Expected: FAIL because `syncWorkers` loops over every lock entry and `materializeWorker` consumes one Card.

**Step 2: Refactor materialization around a root closure**

Change the internal contract to:

```ts
async function materializeWorker(
  state: EffectiveState,
  root: WorkerRootLockEntry,
  cards: CardLockEntry[],
  result: SyncResult,
): Promise<GeneratedWorkerIndex>;
```

Compile each installed root from `membersByRoot`. Use the Blueprint's Worker-level instructions first, then capability instructions in declared order. Preserve per-Card hook consent and provenance. Do not pull capabilities from another root.

Do not use active effective-state capability maps as the bundle input. Root bundle compilation receives the root, its locked closure, machine policy ceilings, and target adapters only. Project skill/MCP/extension overlays are applied in the downstream projection phase after the active root is selected.

**Step 3: Write root-only registries**

Write:

- `generated/workers.json` with installed roots, closure metadata, and active flag;
- `generated/active-worker.json` with the selected root and pinned closure;
- `generated/instructions.md` from the active root only.

When no Worker is active, remove active projection artifacts through the existing managed-path reconciler while retaining installed root bundles.

**Step 4: Run tests, typecheck, commit**

```bash
bun test test/core-sync-worker.test.ts test/core-reconcile.test.ts
bun run typecheck
git add cli/core/worker-generator/sync-worker.ts cli/core/store-paths.ts cli/core/sync.ts cli/core/write-record.ts test/core-sync-worker.test.ts test/core-reconcile.test.ts
git commit -m "feat(worker): materialize one aggregate bundle per root"
```

---

### Task 5: Prove `write` is a pure projection over selected state

**Files:**
- Modify: `cli/commands/write.ts`
- Modify: `cli/core/sync.ts`
- Modify: `test/commands-write.test.ts`
- Modify: `test/core-write-idempotent.test.ts`
- Modify: `test/core-write-offline.test.ts`
- Modify: `test/core-write-vendor-provenance.test.ts`
- Modify: `test/scenarios-card-materialization.test.ts`
- Modify: `test/scenarios-card-bundled-only.test.ts`

**Step 1: Add purity regressions**

Snapshot project config and lock before `write`; assert byte identity afterward for normal, dry-run, target-only, skills-only, MCP-only, and offline writes. Add explicit failure tests for ambiguous or stale selection and verify no downstream files change on preflight failure.

**Step 2: Add preflight validation**

Build and validate effective state before reconciling vendor or downstream paths. A selection or graph error must stop before writes. Keep existing version-floor, hook-consent, scope-confirmation, dry-run, and watch behavior.

**Step 3: Rename misleading write/install language**

Update help text so "apply" means project requirement mutation and "write" means materialization. Do not call the write phase "apply" in output. Prepare `install --no-write` in Task 7.

**Step 4: Verify and commit**

```bash
bun test test/commands-write.test.ts test/core-write-idempotent.test.ts test/core-write-offline.test.ts test/core-write-vendor-provenance.test.ts test/scenarios-card-materialization.test.ts test/scenarios-card-bundled-only.test.ts
bun run typecheck
git add cli/commands/write.ts cli/core/sync.ts test/commands-write.test.ts test/core-write-idempotent.test.ts test/core-write-offline.test.ts test/core-write-vendor-provenance.test.ts test/scenarios-card-materialization.test.ts test/scenarios-card-bundled-only.test.ts
git commit -m "fix(write): keep worker selection and requirements immutable"
```

**Part B gate:** Run `bun run typecheck` and `bun test`. Expected: typecheck exit 0 and test failures 0.

---

## Part C: Command contract migration

### Task 6: Move project requirement mutations out of the Card namespace

**Files:**
- Create: `cli/core/worker-project.ts`
- Create: `cli/core/project-state-transaction.ts`
- Modify: `cli/core/project.ts`
- Modify: `cli/core/card-lock.ts`
- Create: `cli/commands/project/add.ts`
- Create: `cli/commands/project/apply.ts`
- Create: `cli/commands/project/remove.ts`
- Create: `cli/commands/project/pin.ts`
- Create: `cli/commands/project/update.ts`
- Modify: `cli/commands/card/project-command.ts`
- Modify: `cli/index.ts`
- Modify: `cli/commands/card/add.ts`
- Modify: `cli/commands/card/apply.ts`
- Modify: `cli/commands/card/remove.ts`
- Modify: `cli/commands/card/pin.ts`
- Modify: `cli/commands/card/update.ts`
- Modify: `cli/commands/card/detach.ts`
- Create: `test/commands-project-workers.test.ts`
- Create: `test/core-project-state-transaction.test.ts`
- Modify: `test/commands-card-apply-summary.test.ts`
- Modify: `test/core-update-revendor.test.ts`

**Step 1: Write the mutation state-machine tests**

Cover:

- `add` appends a root and leaves a valid current selection unchanged;
- adding the first root allows implicit single-root activation;
- adding a second root persists the previously implicit first root as `activeWorker`;
- `apply` replaces all roots, preserves a surviving active root, and requires `--active` or `--none` when a multi-root replacement would otherwise be ambiguous;
- `remove` deletes unreachable dependencies and sets `activeWorker:null` if it removes the active root while alternatives remain;
- `pin` and `update` preserve selection by root name;
- every mutation writes config V2 and lock V6 atomically;
- failed resolution leaves both files unchanged;
- `--write` chains materialization only after successful mutation;
- an injected failure before commit cleanup leaves immutable recovery sources and a recoverable journal; cleanup failures leave committed targets and at most unreferenced transaction staging;
- recovery handles a crash after target replacement but before its journal phase update by trusting verified target hashes rather than phase text alone;
- concurrent project-state mutations fail with `PROJECT_STATE_TRANSACTION_BUSY` rather than interleaving;
- a same-host lock whose recorded PID is dead is quarantined and recovered; a live, foreign-host, or malformed lock fails conservatively without mutation;
- dry-run creates no lock, journal, staging file, config, or lock mutation.

**Step 2: Implement root-aware project mutations**

Move the consumer lifecycle out of `card-project.ts`:

```ts
addProjectWorkerRoot(...)
applyProjectWorkerRoots(...)
removeProjectWorkerRoot(...)
pinProjectWorkerRoot(...)
updateProjectWorkerGraph(...)
```

Build and validate complete normalized config V2 and lock V6 bytes before mutation. The transaction helper operates on a local filesystem and uses this concrete roll-forward protocol:

1. Acquire `.agents/drwn/.state-transaction.lock` with exclusive `wx` creation. Its JSON owner record contains `version`, transaction ID, hostname, PID, and start time. Flush the owner file and state directory before mutation.
2. If the lock exists, validate the owner. A live same-host PID returns `PROJECT_STATE_TRANSACTION_BUSY`. A dead same-host PID is atomically renamed to a unique, non-overwriting quarantined stale-lock path before acquisition is retried; a competing recovery that wins the rename causes a clean retry. A foreign-host or malformed owner returns `PROJECT_STATE_TRANSACTION_LOCK_UNRECOVERABLE`; elapsed time alone never proves staleness.
3. Under the lock, recover any existing journal before beginning a new mutation. Only after establishing that no malformed or unresolved journal remains, transaction directories not referenced by a journal are abandoned staging from a pre-journal crash or post-journal cleanup crash and may be removed under this lock.
4. Create `.agents/drwn/.transactions/<id>/` and write immutable `config.next` and `lock.next` source files with exclusive creation. Flush both files and the transaction directory, then record their SHA-256 hashes.
5. Atomically write and flush `.agents/drwn/.state-transaction.json` with `version`, `id`, `phase:"prepared"`, target paths, immutable source paths, transaction-owned install paths, and hashes. Every path must canonicalize under the project state root.
6. Install config without consuming `config.next`: copy its bytes to a transaction-owned `config.install` file in the same filesystem, flush that file, rename the install file over `config.json`, and flush the target directory. Atomically advance the journal to `phase:"config-written"`.
7. Install the lock the same way through transaction-owned `lock.install` from retained `lock.next`, then advance to `phase:"lock-written"`.
8. Verify both target hashes. Write `phase:"committed"` and flush it. Unlink the journal and flush the state directory before removing the now-unreferenced transaction directory and flushing its parent. Release the lock only after rereading it and confirming the owner transaction ID, then flush the state directory again.

Recovery treats journal phases as progress hints and target hashes as authority. It validates both immutable sources and their hashes first. For each target whose hash differs, it removes only that transaction's recorded install file, repeats the copy-to-install, flush, rename, and directory-flush sequence from the retained source, and updates the phase after each target. A crash after a target rename but before phase advancement is therefore idempotent. Cleanup occurs only after both target hashes match. Removing the journal before retained sources makes a crash during cleanup recover as committed state plus harmless unreferenced staging, never as a journal whose recovery bytes were consumed.

Operations that need config and lock together use `readProjectStateSnapshot`, which acquires the same lock, runs recovery, reads both files, and then releases the lock. Do not compose a state snapshot from two independently unlocked reads.

Use dependency-injected filesystem checkpoints in tests to fail after source flush, journal flush, each target rename, each phase update, committed-journal flush, journal unlink, transaction-directory removal, and lock release. Missing sources, hash mismatch, malformed/escaping journals, and unrecoverable locks preserve evidence and fail with typed errors; they are never auto-deleted.

**Step 3: Register canonical top-level commands**

Support:

```text
drwn add <ref>
drwn apply <refs...>
drwn remove <name>
drwn pin <ref>
drwn update [name]
```

Do not expose Blueprint roots as Card-only project mutations. Keep old `drwn card add/apply/remove/pin/update/detach` paths for 0.8.0 only as non-mutating `COMMAND_MOVED` errors that print the exact top-level replacement. They must not silently delegate, and the migration guide records their 0.9.0 removal milestone.

**Step 4: Verify and commit**

```bash
bun test test/commands-project-workers.test.ts test/core-project-state-transaction.test.ts test/commands-card-apply-summary.test.ts test/core-update-revendor.test.ts
bun run typecheck
git add cli/core/worker-project.ts cli/core/project-state-transaction.ts cli/core/project.ts cli/core/card-lock.ts cli/commands/project/add.ts cli/commands/project/apply.ts cli/commands/project/remove.ts cli/commands/project/pin.ts cli/commands/project/update.ts cli/commands/card/project-command.ts cli/commands/card/add.ts cli/commands/card/apply.ts cli/commands/card/remove.ts cli/commands/card/pin.ts cli/commands/card/update.ts cli/commands/card/detach.ts cli/index.ts test/commands-project-workers.test.ts test/core-project-state-transaction.test.ts test/commands-card-apply-summary.test.ts test/core-update-revendor.test.ts
git commit -m "refactor(cli): make project commands manage worker roots"
```

---

### Task 7: Replace Worker stack commands with singular `use`

**Files:**
- Modify: `cli/commands/use.ts`
- Retire: `cli/commands/worker/stack/list.ts`
- Retire: `cli/commands/worker/stack/use.ts`
- Retire: `cli/commands/worker/stack/clear.ts`
- Modify: `cli/commands/install.ts`
- Modify: `cli/index.ts`
- Retire: `test/commands-worker-stack.test.ts`
- Create: `test/commands-use-worker.test.ts`
- Modify: `test/scenarios-card-pr2-bash.test.ts`

**Step 1: Write failing `use` tests**

Assert:

- `use <installed-name>` selects it and writes without changing `workers[]`;
- `use <new-ref>` installs, selects, and writes it without removing existing roots;
- `use --none` persists `activeWorker:null` and removes active downstream projection;
- `use <member-card-name>` fails because it is not a root;
- a failed write after selection reports the persisted selection and failure without rolling back unrelated valid graph state;
- `--no-write` changes selection only;
- `--dry-run` reports install/selection/write actions and changes nothing.

**Step 2: Implement singular selection**

Remove all ordered-list options and output. `drwn use` is the sole local Worker selector. `drwn status` added in Task 8 replaces stack listing.

Change install's canonical option to `--no-write`; the bounded `--no-apply` alias is governed by the fixed policy below.

The compatibility policy is fixed for this release:

- `drwn card add/apply/remove/pin/update/detach` remain registered for 0.8.0 only as non-mutating `COMMAND_MOVED` errors that print the exact top-level replacement;
- `drwn worker stack`, `stack use`, and `stack clear` are deleted and unregistered in 0.8.0; invocation receives Clipanion's ordinary unknown-command/usage failure and cannot mutate state;
- `WORKER_STACK_UNSUPPORTED` is reserved for persisted V1 `activeWorkers` state and is not a compatibility command path;
- `drwn install --no-apply` is the sole behavior-preserving warning alias, maps exactly to `--no-write`, and carries a documented 0.9.0 removal milestone;
- help and new documentation show canonical commands only.

**Step 3: Remove stack registration and tests**

Assert `worker --help` omits stack commands and invoking each removed path exits nonzero with no project/store mutation. `rg -n "worker stack|active stack|activeWorkers" cli test` must find only explicit legacy migration code, migration tests, and the removed-command assertions themselves.

**Step 4: Verify and commit**

```bash
bun test test/commands-use-worker.test.ts test/scenarios-card-pr2-bash.test.ts
bun run typecheck
git add cli/commands/use.ts cli/commands/install.ts cli/commands/worker/stack/list.ts cli/commands/worker/stack/use.ts cli/commands/worker/stack/clear.ts cli/index.ts test/commands-worker-stack.test.ts test/commands-use-worker.test.ts test/scenarios-card-pr2-bash.test.ts
git commit -m "feat(cli): select one project worker with use"
```

---

## Part D: Project isolation and downstream alignment

### Task 8: Unify declared project evaluation, local overlays, and read-only ambient visibility

**Files:**
- Modify: `cli/commands/status.ts`
- Modify: `cli/commands/doctor.ts`
- Modify: `cli/commands/mcp/list.ts`
- Modify: `cli/commands/add/skill.ts`
- Modify: `cli/commands/add/mcp.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `cli/core/effective-state.ts`
- Create: `cli/core/ambient-capabilities.ts`
- Modify: `cli/core/config-local.ts`
- Modify: `cli/core/sync.ts`
- Modify: `test/commands-status.test.ts`
- Modify: `test/commands-doctor.test.ts`
- Modify: `test/commands-mcp.test.ts`
- Modify: `test/core-effective-state-overlay.test.ts`
- Modify: `test/commands-add-skill.test.ts`
- Modify: `test/commands-add-mcp.test.ts`

**Step 1: Add the structured project-state contract**

Status and doctor JSON must include:

```json
{
  "schemaVersion": 2,
  "installedWorkers": [],
  "activeWorker": null,
  "implicitSelection": false,
  "activeCards": [],
  "selectionSource": "none",
  "localOverrides": {
    "activeWorker": null,
    "cardReplacements": [],
    "localOnlyRoots": [],
    "sourceOverrides": []
  },
  "projectOverlays": {
    "skills": [],
    "mcp": [],
    "extensions": [],
    "targets": [],
    "hookControls": []
  },
  "declaredCapabilities": {
    "skills": [],
    "mcp": [],
    "hooks": []
  },
  "ambientCapabilities": {
    "observations": [],
    "enforcement": "diagnostic-only"
  },
  "projection": {
    "current": false,
    "issues": []
  },
  "migration": {
    "required": false,
    "issues": []
  }
}
```

Every declared item includes source kind, source ID/path, target, and health. Ambient observations identify their target and user-home path but never enter `declaredCapabilities`.

Run:

```bash
bun test test/commands-status.test.ts test/commands-doctor.test.ts test/commands-mcp.test.ts test/core-effective-state-overlay.test.ts
```

Expected: FAIL because current status vocabulary is flat/stack-shaped and `mcp list` reconstructs state independently.

**Step 2: Make `buildEffectiveState` the declared-state authority**

Route `write`, status, doctor, `mcp list`, and project add validation through `buildEffectiveState`. It accepts an explicit project or machine scope and returns Worker graph, selected closure, project overlays, provenance, migration issues, and projection inputs.

Delete `mcp list`'s independent `loadEffectiveConfig` / `mergeProjectConfig` / `buildActiveServers` evaluator. Add a fixture where machine MCP defaults exist but the project declares none; list, status, doctor, and write must agree that the machine capability is absent from declared project state.

This task does not change machine-scope default evaluation. Task 80 owns that behavior.

**Step 3: Reject inactive-root definition toggles**

- `add skill` and `add mcp` remain explicit project overlays.
- An MCP `{enabled:true}` toggle may resolve a Library definition or an active-closure definition.
- A definition supplied only by an inactive installed root fails with `MCP_DEFINITION_NOT_EFFECTIVE` and names the owning root.
- A same-ID skill already supplied by the active closure is reported as redundant and cannot replace Card-owned bytes.
- Project overlays remain visible as outside the Blueprint.

**Step 4: Add diagnostic-only ambient inspection**

Inspect existing Claude, Codex, and Cursor user-home capability surfaces sufficiently to report IDs, target, path, and whether the same ID also appears in declared state. Do not infer project capability bytes from those surfaces.

This task does not introduce a universal equality algorithm, coalescing rule, or write blocker. Preserve the existing Codex transport guard and its current force behavior until Task 83 resolves D2. Claude/Cursor collisions remain diagnostics. A `--target` write must never fail because of an unselected target's ambient state.

**Step 5: Preserve every local overlay lane**

Migrate local activation to singular `activeWorker` while retaining Card replacements, local-only roots, and source overrides. A local-only root can be selected only from `config.local.json` and must never leak into committed config. Status and doctor show each lane and its provenance.

**Step 6: Verify and commit**

```bash
bun test test/commands-status.test.ts test/commands-doctor.test.ts test/commands-mcp.test.ts test/core-effective-state-overlay.test.ts test/commands-add-skill.test.ts test/commands-add-mcp.test.ts
bun run typecheck
git add cli/commands/status.ts cli/commands/doctor.ts cli/commands/mcp/list.ts cli/commands/add/skill.ts cli/commands/add/mcp.ts cli/core/diagnostics.ts cli/core/effective-state.ts cli/core/ambient-capabilities.ts cli/core/config-local.ts cli/core/sync.ts test/commands-status.test.ts test/commands-doctor.test.ts test/commands-mcp.test.ts test/core-effective-state-overlay.test.ts test/commands-add-skill.test.ts test/commands-add-mcp.test.ts
git commit -m "fix(cli): evaluate one declared worker state"
```

---

### Task 9: Isolate project output from machine capability state

**Files:**
- Modify: `cli/core/skills.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/sync.ts`
- Modify: `test/core-skills.test.ts`
- Modify: `test/core-effective-state.test.ts`
- Modify: `test/commands-write.test.ts`
- Modify: `test/scenarios-root-scope.test.ts`
- Modify: `test/scenarios-card-bundled-only.test.ts`

**Step 1: Write the isolation matrix**

Assert:

- project write resolves skills only from the selected closure and explicit project includes;
- arbitrary `~/.agents/skills` entries are absent from project output;
- undeclared repository `claude-only` and `codex-only` skills are absent;
- changing machine default IDs leaves project output byte-identical;
- changing undeclared compatibility/repository skill directories leaves project output byte-identical;
- project target/extension/skill/MCP overlays still work;
- machine `write --root` retains the current 0.7.0 bootstrap/default behavior byte-for-byte;
- this task does not rewrite `machine.json`, compatibility output, defaults, curation state, or user-home target files during a project write.

Run:

```bash
bun test test/core-skills.test.ts test/core-effective-state.test.ts test/commands-write.test.ts test/scenarios-root-scope.test.ts test/scenarios-card-bundled-only.test.ts
```

Expected: FAIL because skill synchronization currently scans curated and target-specific inventory in project scope.

**Step 2: Make skill synchronization scope-explicit**

For project scope, pass explicit desired skill IDs and sources from the active Worker closure plus project overlays. Never discover desired project state by scanning user-home compatibility directories or repository target-specific inventory.

For machine scope, preserve the existing resolver and output behavior. Do not add explicit-empty seeding, optional/parallel fallback retirement, curation removal, machine policy migration, or root projection cleanup here.

**Step 3: Add non-mutation proof**

Hash `machine.json`, user-home compatibility directories, user-home target configs, project config, and lock before project `write`. Assert machine/user-home bytes and project intent bytes remain unchanged after normal, dry-run, target-only, skills-only, and MCP-only project writes.

**Step 4: Verify and commit**

```bash
bun test test/core-skills.test.ts test/core-effective-state.test.ts test/commands-write.test.ts test/scenarios-root-scope.test.ts test/scenarios-card-bundled-only.test.ts
bun run typecheck
git add cli/core/skills.ts cli/core/effective-state.ts cli/core/sync.ts test/core-skills.test.ts test/core-effective-state.test.ts test/commands-write.test.ts test/scenarios-root-scope.test.ts test/scenarios-card-bundled-only.test.ts
git commit -m "fix(write): isolate project capabilities from machine state"
```

**Part D gate:** Run `bun run typecheck` and `bun test`. Expected: typecheck exit 0 and test failures 0.

---

## Part E: Capture, deploy, documentation, and rollout

### Task 10: Align project Card capture with one declared root closure

**Files:**
- Modify: `cli/commands/card/new.ts`
- Modify: `cli/core/card-capture.ts`
- Modify: `test/commands-card-new-from-project.test.ts`
- Modify: `test/core-card-capture.test.ts`

**Step 1: Write project-capture boundary tests**

Assert `card new --from-project` captures the active root closure plus explicit project overlays, never inactive roots, machine defaults, ambient user-home capabilities, or platform connectors. Ambiguous legacy composition fails before source creation. Capture must not change project intent or downstream projection.

**Step 2: Implement declared-state capture**

Consume the Task 8 evaluator and serialize only declared project capabilities with provenance. Blueprint authoring remains `worker new/compose/publish`; capture does not merge several installed roots.

Do not change `card new --from-defaults`. Task 80 owns its behavior after D1.

**Step 3: Verify and commit**

```bash
bun test test/commands-card-new-from-project.test.ts test/core-card-capture.test.ts
bun run typecheck
git add cli/commands/card/new.ts cli/core/card-capture.ts test/commands-card-new-from-project.test.ts test/core-card-capture.test.ts
git commit -m "fix(card): capture one declared project worker"
```

---

### Task 11: Align deploy and mind-store consumers with one root closure

**Files:**
- Modify: `cli/core/worker-deploy.ts`
- Modify: `cli/commands/worker/deploy.ts`
- Modify: `cli/core/mind-store/project.ts`
- Modify: `cli/core/mind-store/seed.ts`
- Modify: `cli/core/mind-store/rebase.ts`
- Modify: `cli/core/mind-store/ledger.ts`
- Modify: `test/core-worker-deploy.test.ts`
- Create: `test/commands-worker-deploy.test.ts`
- Modify: `test/core-mind-store-seed.test.ts`
- Modify: `test/contract/deploy-payload.v1.json`

**Step 1: Write single-root downstream tests**

Deploy and mind seeding receive one root plus its ordered closure. They reject member-only selection and arrays of independent roots.

**Step 2: Reuse the graph contract**

Remove flat-card selection logic. The mind ledger may record `worker` and `cards` but never an `activeWorkers` stack.

**Step 3: Preserve deploy contract V1**

The preliminary audit confirms `deploy-payload.v1` already represents the target: `entrypoint` identifies one root and `lockfile.cards` carries its pinned closure. Keep network `contractVersion:1`, lockfile V5, and config V1. Local V2/V6 names are not forwarded. Prove bare-Card and Blueprint fixtures contain exactly one entrypoint and every closure Card with integrity/tree SHA. No Foundry change belongs in Task 77.

**Step 4: Verify and commit**

```bash
bun test test/core-worker-deploy.test.ts test/commands-worker-deploy.test.ts test/core-mind-store-seed.test.ts
bun run typecheck
git add cli/core/worker-deploy.ts cli/commands/worker/deploy.ts cli/core/mind-store/project.ts cli/core/mind-store/seed.ts cli/core/mind-store/rebase.ts cli/core/mind-store/ledger.ts test/core-worker-deploy.test.ts test/commands-worker-deploy.test.ts test/core-mind-store-seed.test.ts test/contract/deploy-payload.v1.json
git commit -m "fix(worker): deploy and seed one pinned worker closure"
```

---

### Task 12: Update Worker-root and project-isolation documentation

**Files:**
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `.ai/knowledges/09_cards-manual-test-guide.md`
- Modify: `.ai/knowledges/10_drwn-cli-architecture.md`
- Modify: `.ai/knowledges/11_card-usage-guide.html`
- Modify: `docs/cli-quickref.md`
- Modify: `README.md`
- Modify: `INSTALL.md`
- Modify: `cli/commands/worker/worker.ts`
- Modify: `test/cli-help-shape.test.ts`
- Create: `docs/migrations/0.8-single-worker-roots.md`

**Step 1: Add the core migration guide**

Document:

- `cards[]` to `workers[]` and `activeWorkers` to `activeWorker`;
- fail-closed multi-Card migration and explicit Blueprint/alternative repair paths;
- multiple installed Workers as alternatives;
- root versus member lock/materialization behavior;
- removal of `worker stack` and top-level project command replacements;
- project declaration versus machine defaults and ambient visibility;
- Notion OAuth and external stdio installation as operator state;
- generated directory cleanup;
- Tasks 79-83 as proposed follow-ups, not shipped Task 77 behavior.

Do not claim machine schema V2, empty fresh defaults, curation retirement, full Library lifecycle, portable export, or universal ambient blocking.

**Step 2: Update live vocabulary**

Teach:

```text
author Cards -> compose Blueprint -> add root -> use one Worker -> write
```

Historical analyses remain unchanged. Live architecture docs link to the ratified core and label follow-up policies proposed.

**Step 3: Scan for contradictions**

```bash
rg -n "activeWorkers|worker stack|all installed workers are active|one worker per card|cards array|defaults.*every project|universal ambient|portable store" README.md INSTALL.md docs .ai/knowledges cli/commands
```

Expected: only migration examples, explicit removed-command assertions, or links to proposed follow-ups.

**Step 4: Verify and commit**

```bash
bun run typecheck
bun test test/cli-help-shape.test.ts
git add .ai/knowledges/01_agents-cli-usage-guide.md .ai/knowledges/02_per-project-config-guide.md .ai/knowledges/09_cards-manual-test-guide.md .ai/knowledges/10_drwn-cli-architecture.md .ai/knowledges/11_card-usage-guide.html docs/cli-quickref.md README.md INSTALL.md cli/commands/worker/worker.ts test/cli-help-shape.test.ts docs/migrations/0.8-single-worker-roots.md
git commit -m "docs(cli): publish the single-worker root model"
```

---

### Task 13: Gate release migration and record cross-project rollout

**Files:**
- Modify: `scripts/verify-release-readiness.ts`
- Create: `scripts/audit-worker-root-migrations.ts`
- Create: `test/scripts-audit-worker-root-migrations.test.ts`
- Modify: `package.json`
- Modify: `cli/core/card-lock.ts`
- Create: `.ai/tasks/77_completion_worker-roots-and-defaults-remediation.md` during execution

**Step 1: Add core release checks**

Fail release when:

- production code outside migration adapters reads `activeWorkers`;
- `worker stack` commands are registered;
- `syncWorkers` treats every locked Card as a root;
- V6 writes omit `workerRoots`;
- project skill sync scans machine compatibility or undeclared target-specific directories;
- project commands reconstruct declared state outside `buildEffectiveState`;
- an inactive-root MCP definition can be activated by an ID-only toggle;
- a legacy multi-Card composition can be reclassified without explicit operator input;
- forward documentation teaches stack behavior or claims a proposed follow-up shipped.

Do not add Task 80-83 release gates.

**Step 2: Set the CLI floor**

Set `package.json` to `0.8.0` and V6/V2 project-feature floors to that release. Notion/Momentic startup failures are operator auth/install state and do not require the bump.

**Step 3: Implement the non-mutating migration audit**

The script accepts repeated `--project <path>` and `--discover-root <path>`, unions them with `projects.json`, canonicalizes/deduplicates paths, and reports provenance and stale entries. A drwn project without Git is valid and reports `versionControl:"none"`. Tests snapshot hashes and mtimes before and after audit.

```bash
bun test test/scripts-audit-worker-root-migrations.test.ts
bun run scripts/audit-worker-root-migrations.ts --project /Users/pureicis/dev/darwinian-minds --project /Users/pureicis/dev/darwinian-cards --discover-root /Users/pureicis/dev --json
```

Expected: both explicit project paths appear even when absent from the registry.

**Step 4: Record the `darwinian-cards` handoff**

The non-Git parent workspace currently declares:

```text
@remyjkim/fal@^0.2.0
@darwinian/operator@^1.0.0
@leeminseung/notion@0.1.0
```

It requires a separately published `@darwinian/darwinian-cards-worker` Blueprint and explicit `doctor --fix --blueprint <published-ref>` migration. The Card-source repository/remote remains unassigned; never initialize Git in the parent implicitly.

After publication, update these independent repositories in separate commits:

- `/Users/pureicis/dev/darwinian-cards/mind-tools/README.md`
- `/Users/pureicis/dev/darwinian-cards/mind-starter/README.md`

The Task 77 completion record marks ecosystem rollout pending until publication, workspace migration, and both README commits finish.

**Step 5: Run final verification**

```bash
bun run typecheck
bun test
bun run verify:release --json
```

Expected: typecheck exit 0, test failures 0, release verification `ok:true`.

**Step 6: Record evidence and commit**

```bash
git add scripts/verify-release-readiness.ts scripts/audit-worker-root-migrations.ts test/scripts-audit-worker-root-migrations.test.ts package.json cli/core/card-lock.ts .ai/tasks/77_completion_worker-roots-and-defaults-remediation.md
git commit -m "chore(release): gate worker root migration"
```

---

## 2. Required regression inventory

Before declaring Task 77 complete, run this scan and classify every remaining match:

```bash
rg -n "activeWorkers|worker stack|active stack|defaultActiveWorkers|selectActiveCards|for \(const card of state\.lockedCards\)" cli test README.md docs .ai/knowledges
```

Allowed matches:

- V1 config migration adapter;
- migration tests;
- migration guide showing old-to-new syntax;
- stable error output explaining `WORKER_STACK_UNSUPPORTED`.

Everything else is an incomplete migration.

Run and classify these core authority scans as well:

```bash
rg -n "loadEffectiveConfig|mergeProjectConfig|buildActiveServers" cli/commands/status.ts cli/commands/doctor.ts cli/commands/mcp/list.ts cli/commands/add
rg -n "listCuratedSkills|resolveCuratedSkillsDir|claude-only|codex-only" cli/core/skills.ts cli/core/effective-state.ts
rg -n "AMBIENT_CAPABILITY_CONFLICT|capabilityConflicts|--force" cli/core/ambient-capabilities.ts cli/core/sync.ts test/commands-write-codex-conflict.test.ts
```

Expected classifications:

- command consumers import/call `buildEffectiveState`, not the lower-level evaluators;
- curated and target-specific directory names occur only in inventory or machine-scope logic, never implicit project activation;
- ambient inspection remains diagnostic-only in Task 77 and does not introduce a universal blocker;
- current machine optional/parallel behavior remains untouched for Task 80.

Key test files that currently lock in the behavior being removed:

- `test/commands-worker-stack.test.ts`;
- `test/core-effective-state-stack.test.ts`;
- `test/core-worker-hook-stack.test.ts`;
- `test/scenarios-card-pr2-bash.test.ts`;
- `test/core-blueprint-composition.test.ts`;
- `test/core-sync-worker.test.ts`.

These must be replaced by single-root and root-closure assertions, not simply deleted.

---

## 3. Rollback and compatibility strategy

This migration changes persisted formats, so rollback must be explicit:

- Before first V2/V6 write, preserve normal Git-visible config/lock changes so repository rollback is available through version control.
- Every project-state read recovers a prepared config/lock transaction before parsing either target; malformed journals stop with evidence intact.
- V6 readers should produce a clear minimum-version error on older CLIs.
- The new CLI continues to read V1/V2-V5 but writes V2/V6 after mutation.
- Do not write both `cards`/`workers` or `activeWorkers`/`activeWorker`; dual-write would recreate authority ambiguity.
- Generated files are disposable and can be removed/rebuilt.
- Vendored immutable Card bytes remain valid across the schema migration.
- A project blocked by a legacy multi-Worker stack must first author one Blueprint or choose one Worker. The migration must not synthesize an unpublished Blueprint silently.
- Transaction recovery retains immutable source bytes until both config and lock hashes verify; phase text alone is never recovery authority.
- Task 77 does not migrate `machine.json` or change Store seed/export semantics, so those surfaces require no Task 77 rollback.

---

## 4. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Flat lock entries are misclassified as roots | Reconstruct roots only from top-level project requirements; persist explicit V6 edges |
| Legacy implicit multi-Card composition is reclassified as alternatives | Fail with `LEGACY_MULTI_CARD_COMPOSITION_AMBIGUOUS`; require explicit Blueprint or operator classification |
| Existing scripts depend on `card add` or `worker stack` | Keep Card project aliases as bounded `COMMAND_MOVED` errors; remove stack commands and ship exact replacement recipes in the migration guide |
| A selected Blueprint loses member capabilities | Root-closure tests at resolver, effective-state, write, deploy, and E2E levels |
| Aggregate bundle silently resolves collisions | Strict conflict errors with source attribution; project overrides explicit and reported |
| Config writes before failed resolution | Resolve to temporary graph, then atomically write config and lock |
| Crash between config and lock replacement | Retained immutable sources, per-target journal phases, hash-authoritative roll-forward, and snapshot reads under the transaction lock |
| Machine defaults continue leaking through curated directories | Scope-aware sync tests and release grep gate |
| Task 77 accidentally changes machine bootstrap/default behavior | Machine-scope byte snapshots and explicit scope freeze; Task 80 owns all machine changes |
| Diagnostic ambient state becomes an unapproved write blocker | Task 77 enforces diagnostic-only inspection and preserves existing target behavior; Task 83 owns D2 |
| Unsafe whole-store export remains available during Worker work | Task 79 is an independent security prerequisite and ships before or alongside the 0.8.0 release cut |
| Mind-store or deploy retains stack vocabulary | Dedicated downstream task and contract tests |
| Other repositories break after CLI upgrade | Explicit path/discovery audit plus registry union, dry-run doctor report, and separate consumer rollout |
| Notion auth is mistaken for materialization failure | Diagnostics category and migration documentation keep auth separate |

---

## 5. Out of scope

- Implementing the new `darwinian-cards` Blueprint Card itself.
- Reinstalling Momentic or any third-party stdio MCP server.
- Completing Notion OAuth login or adding user secrets.
- Nested Blueprints.
- Multi-Worker orchestration, dispatch, concurrency, or runtime messaging.
- Foundry server changes; the preliminary V1 contract audit confirms one entrypoint plus its pinned Card closure is already representable.
- Automatic conversion of arbitrary project overlays into published Cards.
- Machine schema/default migration, fresh-seed changes, direct-curation retirement, and user-home projection repair (Task 80).
- Complete Library remove/update/reference/GC and Library-scoped persistence hardening (Task 81). Store-wide cross-domain concurrency remains unplanned.
- Portable inventory export/seed or full-machine backup (Task 82 or a later encrypted-backup design).
- Universal or target-specific ambient write-blocking changes (Task 83/D2).
- The Task 79 Store export hotfix implementation, except that Task 79 must complete before the Task 77 release cut.

---

## 6. Completion checklist

- [ ] Only Analysis 116 section 0.1 ratified core is implemented; proposals remain explicitly deferred.
- [ ] Project config V2 stores `workers[]` and singular `activeWorker`.
- [ ] Lockfile V6 stores `workerRoots` and every independently pinned Card entry.
- [ ] Effective state expands exactly one selected root closure.
- [ ] Generated Worker directories correspond only to roots.
- [ ] Worker stack commands and production stack vocabulary are removed.
- [ ] Project mutation commands use retained-source transaction recovery and consistent snapshot reads.
- [ ] `write` is state-pure and fails before partial output on invalid selection.
- [ ] Project writes exclude machine capability defaults and compatibility-directory inventory.
- [ ] Machine-scope bootstrap/default behavior remains byte-compatible and `machine.json` is not migrated.
- [ ] `write`, status, doctor, `mcp list`, and project mutation validation consume one declared-state evaluator.
- [ ] Declared and ambient capabilities are separate in human and JSON output.
- [ ] Ambient visibility is diagnostic-only; no universal blocker or new force policy ships.
- [ ] Inactive-root MCP definitions cannot be enabled by an ID-only project toggle.
- [ ] Project Card capture reads declared state only; `--from-defaults` remains unchanged.
- [ ] Deploy and mind-store consume one Worker root closure.
- [ ] Forward documentation teaches the ratified model and labels Tasks 79-83 separately.
- [ ] Explicit, discovered, and registered projects receive a non-mutating migration audit, including the non-Git `darwinian-cards` workspace.
- [ ] Task 79 security hotfix is complete before or alongside the 0.8.0 release cut.
- [ ] Tasks 80-83 are not reported as Task 77-delivered behavior.
- [ ] `bun run typecheck`, `bun test`, and `bun run verify:release --json` pass with recorded evidence.

---
