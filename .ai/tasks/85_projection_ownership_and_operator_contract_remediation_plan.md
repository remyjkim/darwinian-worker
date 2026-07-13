# ABOUTME: Defines the hard-cut remediation for partial projection ownership, stale Operator guidance, and profile publication.
# ABOUTME: Coordinates Task 82 integration and Task 84 without compatibility code, generated-source conflicts, or unsafe consumer state.

# Task 85: Projection Ownership and Operator Contract Remediation Plan

**Status:** Tasks 0-6 are implemented, verified, and committed locally. Task 7
and the Task 84 integration/publication/reset gates remain open.

**Date:** 2026-07-13

**Primary repository:** `/Users/pureicis/dev/darwinian-minds`

**Implementation branch:** `feat/task-81-inventory-lifecycle` in the primary checkout

**Controlled consumer:** `/Users/pureicis/dev/darwinian-cards`

**Canonical Operator skill repository:** `/Users/pureicis/dev/darwinian-minds/darwinian-worker-skills`

**Architecture authority:** `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md`, as amended by completed Tasks 77-83 and the clean-slate prelaunch directive

**Parallel dependency:** Task 84 is owned by another implementer. Task 85 must preserve `.ai/analyses/117_worker-mind-semantic-memory-target-architecture.md` and `.ai/tasks/84_worker-mind-semantic-memory-implementation-plan.md` and must obey the integration checkpoints below.

### Execution record: current operator constraints

- Stay in the current primary checkout and current feature branch. Do not
  create a worktree.
- Task 82 is frozen by `c07fc05` and `24ce8ef`.
- Tasks 1-5 are recorded in `016e8d4`, `f677274`, `e8c9fa5`, `ff58248`, and
  focused follow-up commits `0a67850` and `73ddc9a`.
- Task 6 is recorded by submodule commit `d46f7c9` and parent gitlink commit
  `b25dcb5`.
- Commits are permitted. Tags, pushes, merges, real Card publication, and real
  Store mutation remain blocked until explicitly authorized.
- Work directly with Task 84 in the same checkout. Canonical Operator source
  edits are combined before one generated-card sync; do not hand-edit generated
  copies.
- Keep Docusaurus paths unchanged in this pass. Task 82 Docusaurus changes are
  baseline-owned in `c07fc05` and must be preserved.
- Tests may use disposable temporary Git repositories. They do not constitute
  release evidence for durable repositories or the real Store.
- Parts E publication and F destructive rollout are release gates. Complete
  all local code, fixture, integrity, and isolated-store preparation, but do not
  claim immutable coordinates or consumer rollout until those operations are
  permitted.

This record changes execution mechanics only. The strict write-record V1,
Operator V2, no-compatibility policy, Task 84 integration order, and acceptance
criteria remain unchanged.

---

## 0. Goal and Non-Negotiable Decisions

Task 85 closes four release-blocking gaps found after Tasks 77-83 and the Task 82 implementation:

1. A project `write --mcp-only`, `write --skills-only`, or `write --target` can delete previously managed but unselected project outputs.
2. Project status and doctor can report a projection as current even when a normal dry-run plans destructive cleanup.
3. The pinned Darwinian Operator Card and generated Worker instructions teach removed project, Library, defaults, Store, and Mind-stack commands, including the disabled whole-Store export workflow.
4. Release readiness checks command registration and forward documentation, but not active runtime remediation strings or the exact bytes projected by the pinned Operator profile.

The implementation follows these approved policies:

- The CLI is prelaunch. The target state is the first supported contract.
- Do not read, migrate, rewrite, or diagnose prototype write records as a compatibility format.
- The first supported write record is a strict namespaced schema numbered V1.
- Existing development machine and project state is cleaned with the old CLI before installing the new contract, then recreated from scratch.
- One project has at most one active Worker. Cards compose into one Blueprint closure.
- Project writes remain pure projection and do not inherit machine capability intent.
- Partial writes reconcile selected ownership only and retain unselected ownership exactly.
- The public command surface has no `drwn library`, `drwn store`, `drwn skills`, `drwn mind list/use/clear`, `drwn worker stack`, old project mutation under `drwn card`, or `install --no-apply` aliases.
- Whole-Store backup, restore, seed, and migration workflows remain unavailable. Task 82 transfers allowlisted standalone machine inventory only.
- Operator skill IDs that encode the obsolete stack, Library, defaults, or plural materialization models are removed, not aliased.
- Task 85 does not update Docusaurus. Active CLI runtime guidance, canonical Operator sources, contract tests, and release gates are in scope; Task 84 owns its already-planned documentation work.
- The remote Worker deploy payload contract is unchanged.

---

## 1. Investigation Record

### 1.1 Partial project writes lose ownership

`cli/core/sync.ts` currently skips emitters according to `skillsOnly`, `mcpOnly`, and `target`, then diffs the resulting partial `managedPaths` list against the complete previous write record. `retainUnselectedMachineOwnership` retains omitted entries only when `writeScope === "machine"`; project scope returns the partial desired set unchanged.

The cleanup phase therefore interprets "not selected in this invocation" as "no longer desired" and removes the omitted project paths. Existing tests in `test/sync-mcp-compat.test.ts` start without a complete prior write record, while `test/commands-write.test.ts` protects config and lock bytes rather than all projection bytes. Neither setup exercises destructive cleanup after a full write.

Observed against `/Users/pureicis/dev/darwinian-cards` with the current CLI:

```text
drwn write --dry-run --json
  -> remove /Users/pureicis/dev/darwinian-cards/.cursor/mcp.json

drwn write --mcp-only --dry-run --json
  -> removes the existing Claude and Codex project skill projections

drwn write --target=cursor --dry-run --json
  -> removes unselected Claude and Codex projections
```

The live project write record contains 91 paths. This is not a missing-Card or stale-lock problem.

### 1.2 Path heuristics are not a stable fix

The machine-only workaround infers target and capability from path strings. That misses project-specific paths such as `.mcp.json` and target-specific generated hook composers under dynamic Worker directories. Future adapter path changes would silently change ownership behavior again.

The stable contract is explicit ownership metadata on every managed entry. Paths identify filesystem objects; they must not also be the only source of truth for selection semantics.

### 1.3 Same-path kind changes can delete the desired file

`cli/core/write-record.ts::diffWriteRecord` currently returns both `toRemove` and `toAdd` when a desired path exists under a different managed kind. `syncRepository` writes desired output first and performs cleanup second. A whole-path removal can therefore delete the newly written desired path.

The live Cursor path demonstrates the defect: the prior record owns `.cursor/mcp.json` as `managed-content`, the current adapter desires `managed-fields`, and the file bytes are already correct. The writer performs no byte write, then cleanup removes the path from the prior entry.

V1 must define this as an ownership handoff. A desired path survives. The old whole path must never be queued for cleanup merely because its storage strategy changed.

### 1.4 Status and doctor do not use the write planner

`buildProjectStatusV1` currently sets `projection.current` from write-record presence plus overlay warnings. It does not inspect planned writes or removals.

Project doctor renders MCP content independently. Byte equality cannot detect a write-record ownership handoff that schedules cleanup. The live consumer reports:

```json
{
  "projection": { "current": true, "issues": [] }
}
```

while normal `write --dry-run --json` schedules `.cursor/mcp.json` for removal. Status, doctor, and write need one dry-run planning authority.

### 1.5 Active Operator guidance is on the removed contract

The canonical source is the `darwinian-worker-skills` Git submodule, not the generated copies under `cards/*/skills`. Fifteen canonical skill/reference files currently contain removed command grammar. The stale workflows include:

- `drwn card add/apply/pin/remove/update/detach` for project mutation;
- `drwn mind list/use/clear` and active stack behavior;
- `drwn library ...` and `drwn library defaults ...`;
- `drwn skills curate/uncurate/list`;
- `drwn store status/verify/export/seed/migrate/gc`;
- `drwn install --no-apply`;
- claims that whole machine state can be archived, seeded, migrated, or restored.

Five production core modules also emit obsolete remediation commands:

- `cli/core/card-meta.ts`;
- `cli/core/card-project.ts`;
- `cli/core/card-skill-resolver.ts`;
- `cli/core/vendor-manifest.ts`;
- `cli/core/vendor-reconcile.ts`.

The current machine profile pins public `@darwinian/operator@1.0.2`, commit `6b2998c51b7c736c70c2e522cb8d7b3170e816d8`, tree `2297dfc30783200a2b6a0da1189d7de20a01f23c`, and integrity `sha256-284cd3ba4880a60ba93b81c0be0dd15796b27a640ed697fdb1a18fe6b5ff30d9`. Those exact pinned bytes contain the stale guidance.

### 1.6 Task 82 and branch state

Tasks 77, 83, 79, 80, and 81 already form one linear ancestry ending at `2935ecb`. There is no remaining code merge among those task branches.

Task 82 is fully implemented, verified, and committed as `c07fc05` plus
completion record `24ce8ef`. Analysis 117 and Task 84 remain independently
owned even where Analysis 116 summarizes both boundaries.

---

## 2. Target Contracts

### 2.1 Strict write-record V1

Replace the prototype `writeRecordVersion` object with this first supported shape:

```ts
type ProjectionSurface = "worker" | "mcp" | "skill" | "hook";
type ProjectionTarget = "claude" | "codex" | "cursor" | "mastra";

interface ManagedOwnership {
  surface: ProjectionSurface;
  target?: ProjectionTarget;
}

interface WriteRecordV1 {
  schema: "drwn.write-record";
  schemaVersion: 1;
  scope: "project" | "machine";
  lastWriteAt: string;
  lastWriteHarnessVersion: string;
  managedPaths: ManagedPathV1[];
}
```

Every `ManagedPathV1` carries `ManagedOwnership` in addition to its existing kind-specific fields. Validation is strict:

- unknown keys fail;
- duplicate paths fail;
- a record scope mismatch fails;
- MCP and skill entries require a supported target;
- hook entries require `claude`, `codex`, or `mastra`;
- worker entries do not claim a downstream target;
- machine records may contain only machine-supported skill and MCP ownership;
- prototype `writeRecordVersion` records fail as `WRITE_RECORD_INVALID`;
- missing and invalid records remain distinguishable in status and doctor.

Do not add a legacy reader, migration command, fallback parser, dual write, or version adapter. The controlled reset removes prototype records.

### 2.2 Selection and retention matrix

Common Worker generation and the independently sidecar-owned vendor reconciliation keep their current behavior: they are reconciled whenever the existing orchestrator runs them. Vendor trees are not write-record entries. Downstream ownership follows this matrix:

| Invocation | Reconcile | Retain from prior record |
|---|---|---|
| `write` | all surfaces and targets | none except still-desired ownership |
| `write --mcp-only` | MCP for all enabled targets | all skills, hooks, and unselected ownership |
| `write --skills-only` | skills for Claude and Codex | all MCP, hooks, and unselected ownership |
| `write --target=claude` | selected Claude MCP, skills, and hooks plus common output | Codex, Cursor, and Mastra target ownership |
| `write --target=codex` | selected Codex MCP, skills, and hooks plus common output | Claude, Cursor, and Mastra target ownership |
| `write --target=cursor` | selected Cursor MCP plus common output | Claude, Codex, and Mastra target ownership |
| `write --mcp-only --target=<t>` | MCP for `<t>` | every other surface and target |
| `write --skills-only --target=<t>` | skills for `<t>` when supported | every other surface and target |

Rules:

- Desired entries from the selected invocation override retained entries for the same path.
- An unselected prior entry remains byte-identical and remains in the next record.
- A selected surface still removes stale owned entries that are no longer desired.
- A full write remains the authority that reconciles all stale ownership.
- Dry-run computes the same next record and cleanup set without writing any file.
- The same policy applies to project and machine scopes. There is no machine-only special case.

### 2.3 Same-path ownership handoff

`diffWriteRecord` must obey these invariants:

- `toRemove` contains a whole path only when no desired entry owns that path.
- Managed-field to managed-field changes may remove only fields absent from the desired entry.
- If kind, surface, or target changes at a still-desired path, verify the prior owned bytes during preflight, let the selected adapter materialize the desired representation, record the new ownership, and do not enqueue whole-path cleanup.
- If an adapter cannot safely perform a representation handoff, it must fail before mutation. Do not implement a generic delete-then-recreate fallback.

### 2.4 Projection diagnostics

Expose one read-only `planRepositoryProjection` path backed by the same orchestration as `write --dry-run`. Project status and doctor consume that planner.

`projection.current` is true only when:

- the strict supported record is present;
- full-project planning produces zero changes;
- no ownership or drift preflight fails;
- no overlay issue prevents an exact projection.

Status reports stable issue codes and concise paths. Doctor includes the same stale plan in `projectConfigIssues` or a dedicated existing-compatible project projection section. Neither command mutates Store, project, target, Git hygiene, or write-record bytes.

### 2.5 Operator skill contract

The Operator Card is a Worker, Blueprint, capability Card, and machine-capability
operator. It does not own the optional Worker Mind. Mind operation remains in
`@darwinian/mind-tools`; Mind quickstart composition remains in
`@darwinian/mind-starter`; any retained Mind authoring or visibility tooling is
owned by a separate Mind-specific Card and Task 84.

Remove these obsolete or out-of-bound IDs from the Operator Card, generated
Operator copies, machine profile allowlist, and pinned payload:

```text
apply-mind-card
manage-active-mind-stack
manage-library
manage-defaults
materialize-minds
author-mind-card
install-project
inspect-minds
repair-minds
recommend-minds
share-mind-card
support-minds
sync-card-skills
import-mcp-from-claude
author-mind-content
audit-mind-visibility
```

Add these IDs with no aliases:

```text
manage-project-worker
inspect-worker
repair-worker
author-card
share-card
manage-machine-inventory
manage-machine-capabilities
```

The first supported Operator V2 allowlist contains exactly eight skills:

```text
bootstrap-project
manage-project-worker
inspect-worker
repair-worker
author-card
share-card
manage-machine-inventory
manage-machine-capabilities
```

The consolidation rules are part of the public contract:

- `bootstrap-project` covers fresh initialization and installation from an
  existing supported lock;
- `manage-project-worker` covers installed roots, singular active selection,
  project capability selection, and pure `write` projection;
- `inspect-worker` absorbs read-only discovery and recommendations;
- `repair-worker` remains separate because it crosses into mutation;
- `author-card` covers capability Card and Worker Blueprint source authoring,
  including bundled-skill synchronization;
- `share-card` remains separate because it crosses remote and publication
  boundaries;
- `manage-machine-inventory` covers standalone package/MCP lifecycle,
  portable transfer, GC, and import from Claude;
- `manage-machine-capabilities` covers profile-owned and explicit machine
  activation and machine projection.

`support-minds` may remain independently discoverable inventory but is not in
the Recommended Operator profile. No Operator skill teaches persona, beliefs,
memory, Mind visibility, `drwn worker mind`, or BeginningDB workflows.

The root skill bundle moves from `0.4.0` to `0.5.0`. `@darwinian/operator` moves to `2.0.0`, with `harness.minVersion` and `lastValidatedWith` set to the Task 84 `drwn 0.9.0` release candidate. `@darwinian/darwinian-cards-worker` moves to `2.0.0` and composes exact `@darwinian/operator@2.0.0`.

### 2.6 Supported command mapping

Canonical skills and runtime remediation text use this mapping:

| Removed guidance | Supported guidance |
|---|---|
| `drwn card add <ref>` | `drwn add <root-ref>` |
| `drwn card apply ...` | `drwn apply ...` |
| `drwn card pin <ref>` | `drwn pin <root-ref>` |
| `drwn card remove <name>` | `drwn remove <root-name>` |
| `drwn card detach` | `drwn use --none` to clear selection, or `drwn apply --none` to replace installed roots with none |
| `drwn card update` | `drwn update`, `drwn up --fetch`, or `drwn install --no-write`, according to the actual repair need |
| `drwn mind list` | `drwn status --json` |
| `drwn mind use <ref>` | `drwn use <root-name-or-ref>` |
| `drwn mind clear` | `drwn use --none` |
| `drwn install --no-apply` | `drwn install --no-write` |
| `drwn library list skills` | `drwn machine skill list --json` |
| `drwn library show <skill>` | `drwn machine skill show <id> --json` or `--package <name>` |
| `drwn library add skill` | `drwn machine skill install` |
| `drwn library list/show/add mcp` | `drwn machine mcp list/show/add` |
| `drwn library defaults add/remove skill` | `drwn machine skill enable/disable` |
| `drwn library defaults add/remove mcp` | `drwn machine mcp enable/disable` |
| `drwn library catalog ...` | `drwn catalog ...` |
| `drwn skills curate/uncurate` | removed with no replacement |
| `drwn store status/verify` | `drwn status --machine --json`, `drwn doctor --json`, and typed machine inventory inspection |
| `drwn store export/seed/migrate` | removed with no whole-state replacement |
| `drwn store gc` | `drwn machine inventory gc`, only for Task 81 standalone inventory garbage |

Task 82 `machine inventory export|bundle|verify|sync` must be described only as portable standalone inventory transfer. It is not a Store backup, restore, seed, or credential transfer path.

### 2.7 Exact pinned payload gate

Keep release verification offline and deterministic. Do not fetch GitHub during `verify:release`.

The release gate must prove:

- `darwinian-worker-skills/skills` is the canonical source;
- `npm run sync:cards --check` passes;
- canonical `cards/operator/card.json`, package metadata, and `card-map.mjs`
  expose the exact eight-skill V2 contract; root bundle metadata may also carry
  separately owned non-Operator skills but must not classify them as Operator;
- the canonical Operator directory's computed content integrity equals `registry/machine-profiles.json`;
- the registry source is an exact `#v2.0.0` ref and its version, commit, tree, integrity, skill list, and MCP list match the centralized runtime contract;
- generated Operator copies contain no retired ID or forbidden command grammar;
- production `cli/**/*.ts` user-facing guidance contains no retired command grammar;
- no Operator skill claims whole-Store backup, restore, seed, or migration
  support;
- no Operator skill claims optional Worker Mind ownership or duplicates a
  Mind-specific tooling Card.

The public tag's commit and tree are verified once during the controlled publication/rollout and recorded in the registry. Runtime profile resolution still compares the resolved tag to those exact coordinates. Network access is not added to CI.

---

## 3. Repository and Parallel-Work Protocol

### 3.1 No worktree

Use the primary checkout. Before each branch switch, require a named commit for every owned change or leave unrelated coworker files untouched. Do not stash, clean, reset, or checkout away coworker changes.

### 3.2 Task 82 baseline

Create the Task 82 baseline before Task 85 implementation and before Task 84 consumes CLI code. The current ancestry already contains Tasks 77-81.

Do not stage these coworker-owned paths in a Task 82 commit:

```text
.ai/analyses/110_mind-card-target-architecture.md
.ai/analyses/115_mind-substrate-split-architecture.md
.ai/analyses/116_drwn-cli-card-worker-target-architecture.md
.ai/analyses/117_worker-mind-semantic-memory-target-architecture.md
.ai/tasks/78_completion_v0.7.0_release_finalization.md
.ai/tasks/84_worker-mind-semantic-memory-implementation-plan.md
```

Analysis 116 remains unstaged because its current diff mixes Task 82 and Task 84 ownership. Task 84's eventual document commit must preserve the Task 82 portable inventory sections.

### 3.3 Task 84 file ownership

Task 84 owns semantic-memory edits in the dedicated Mind-specific sources:

```text
darwinian-worker-skills/skills/author-mind-content/SKILL.md
darwinian-worker-skills/skills/audit-mind-visibility/SKILL.md
darwinian-worker-skills/skills/manage-active-mind-stack/SKILL.md
darwinian-worker-skills/cards/base-mind/**
/Users/pureicis/dev/darwinian-cards/mind-tools/**
/Users/pureicis/dev/darwinian-cards/mind-starter/**
```

Task 85 owns Operator command grammar and the eight Operator skill identities.
Therefore:

1. Task 85 lands its canonical command/identity commit in the `darwinian-worker-skills` submodule first.
2. The Task 84 owner rebases or cherry-picks that submodule commit before Task 84 Task 7.
3. Task 84 applies semantic-memory edits only to Mind-specific canonical
   sources and never adds them back to Operator.
4. Only canonical files are hand-edited. Task 85 syncs Operator; Task 84 syncs
   base-mind/mind-tools/mind-starter from their respective owners.
5. The parent repository records the final submodule SHA after both sets of changes.
6. Operator publication waits for that final combined SHA and the local `drwn 0.9.0` release candidate.

Task 85 also adds a focused Operator contract verifier. Task 84 must merge Task 85 before its release-readiness Task 8, then preserve the new check while adding semantic-memory gates.

---

## Part A: Commit and Freeze Task 82

### Task 0: Create an Audited Task 82 Baseline

**Files for the implementation commit:**

- Modify: `README.md`
- Modify: `cli/commands/machine/inventory.ts`
- Modify: `cli/core/inventory.ts`
- Create: `cli/core/inventory-bundle.ts`
- Create: `cli/core/inventory-portable.ts`
- Create: `cli/core/inventory-transfer.ts`
- Modify: `cli/index.ts`
- Modify: `docs-docusaurus/docs/concepts/local-store.md`
- Modify: `docs-docusaurus/docs/reference/cli/machine.md`
- Modify: `docs/cli-quickref.md`
- Modify: `scripts/verify-release-readiness.ts`
- Modify: `test/cli-help-shape.test.ts`
- Modify: `test/commands-machine-inventory-shape.test.ts`
- Create: `test/commands-machine-inventory-transfer.test.ts`
- Create: `test/core-inventory-bundle.test.ts`
- Create: `test/core-inventory-portable.test.ts`
- Create: `test/core-inventory-transfer-recovery.test.ts`
- Create: `test/core-inventory-transfer.test.ts`
- Create: `test/e2e-machine-inventory-transfer.test.ts`
- Modify: `test/docs-readiness.test.ts`
- Modify: `test/scripts-verify-machine-inventory-contract.test.ts`

**Files for the completion commit:**

- Modify: `.ai/knowledges/10_drwn-cli-architecture.md`
- Delete: `.ai/tasks/82_drwn-portable-store-transfer-plan.md`
- Create: `.ai/tasks/82_drwn-portable-machine-inventory-transfer-plan.md`
- Create and update: `.ai/tasks/82_completion_portable-machine-inventory-transfer.md`

**Step 1: Re-run the Task 82 focused gate**

```bash
bun test test/commands-machine-inventory-transfer.test.ts test/core-inventory-bundle.test.ts test/core-inventory-portable.test.ts test/core-inventory-transfer-recovery.test.ts test/core-inventory-transfer.test.ts test/e2e-machine-inventory-transfer.test.ts test/commands-machine-inventory-shape.test.ts test/scripts-verify-machine-inventory-contract.test.ts test/docs-readiness.test.ts
bun run typecheck
bun run verify:release --json
git diff --check
```

Expected: all pass before staging.

**Step 2: Stage from the explicit implementation allowlist**

Use explicit `git add` paths. Do not use `git add -A` or `git add .`. Inspect:

```bash
git diff --cached --name-status
git diff --cached --check
```

Expected: no Analysis 110/115/116/117, Task 78, or Task 84 path is staged.

**Step 3: Commit implementation**

```bash
git commit -m "feat(machine): add portable inventory transfer"
```

Record the resulting SHA in the completion note, replacing its obsolete statement that no Task 82 commit exists.

**Step 4: Stage and commit completion records**

```bash
git commit -m "docs(tasks): record portable inventory transfer"
```

**Step 5: Verify the baseline and record it for both tasks**

```bash
git status --short --branch
git log -2 --oneline
bun test
bun run typecheck
bun run verify:release --json
```

Set `TASK82_BASE` to the completion commit SHA. Task 85 and Task 84 must both identify that baseline in their completion records.

Execution remained on `feat/task-81-inventory-lifecycle` under the later
no-worktree/no-new-branch instruction. Do not recreate the hypothetical Task 85
branch; use `24ce8ef` as the recorded Task 82 completion baseline.

---

## Part B: Make Projection Ownership Explicit

### Task 1: Freeze the Strict Write-Record Contract with Red Tests

**Files:**

- Create: `test/core-write-record-v1.test.ts`
- Modify: `test/core-write-record.test.ts`
- Modify: `test/core-write-record-managed-content.test.ts`
- Modify: `test/scenarios-root-scope.test.ts`

**Step 1: Add schema rejection tests**

Cover:

- valid project and machine `drwn.write-record` V1 records;
- missing record versus malformed record;
- prototype `writeRecordVersion` rejection;
- unknown keys, duplicate paths, invalid kind payloads, scope mismatch, invalid surface/target combinations, and path traversal rejection;
- no migration or rewrite side effect after rejection.

**Step 2: Add diff invariant tests**

Cover:

- absent desired path produces whole-path removal;
- retained desired path never produces whole-path removal;
- managed-fields removes only dropped fields;
- same-path kind, surface, or target handoff does not remove the desired whole path;
- desired ownership wins over a retained entry for the same path.

**Step 3: Run red tests**

```bash
bun test test/core-write-record-v1.test.ts test/core-write-record.test.ts test/core-write-record-managed-content.test.ts test/scenarios-root-scope.test.ts
```

Expected: fail because the current record is unnamespaced, has no explicit ownership, and treats kind changes as remove plus add.

### Task 2: Implement Strict Ownership Metadata

**Files:**

- Modify: `cli/core/write-record.ts`
- Create: `cli/core/projection-ownership.ts`
- Modify: `cli/core/materialize.ts`
- Modify: `cli/core/skills.ts`
- Modify: `cli/core/hook-generator/sync-hooks.ts`
- Modify: `cli/core/worker-generator/sync-worker.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/surface-kind.ts`
- Modify: `cli/core/types.ts`
- Modify: `test/core-materialize.test.ts`
- Modify as required by compile errors: focused managed-path test fixtures

**Step 1: Add the strict parser and schema**

Make missing records return an explicit missing result. Make invalid existing records throw `WRITE_RECORD_INVALID` with the path and a reset remediation. Do not silently convert invalid content to `null`.

`saveWriteRecord` retains its atomic temp-file, fsync, and rename behavior, but writes only the namespaced V1 shape.

**Step 2: Decouple materialization from projection ownership**

`materialize.ts` is also used by non-projection helpers. Make its generic return value a materialized representation rather than a persisted `ManagedPath`. Projection call sites then attach explicit ownership before adding an entry to `SyncResult.managedPaths`.

**Step 3: Require ownership at every projection producer**

Attach ownership explicitly in skills, MCP adapters, hook adapters, and Worker generation. Do not derive ownership from the output path inside retention logic. Vendor reconciliation continues to use its existing manifest sidecars and does not create write-record entries.

Mark target-specific hook files generated inside Worker directories as `surface: "hook"` with their actual target. Mark aggregate Worker identity/instructions/skill indexes as `surface: "worker"`.

**Step 4: Replace the machine-only retention helper**

Delete `managedPathTarget`, `machineManagedCapability`, and `retainUnselectedMachineOwnership`. Implement the selection matrix in `projection-ownership.ts` and apply it for both scopes.

**Step 5: Implement same-path handoff**

Change `diffWriteRecord` so a still-desired path cannot enter whole-path `toRemove`. Preserve managed-field subset cleanup. Add a preflight assertion for unsupported adapter handoffs rather than deleting the path.

**Step 6: Run green unit tests**

```bash
bun test test/core-write-record-v1.test.ts test/core-write-record.test.ts test/core-write-record-managed-content.test.ts test/core-materialize.test.ts test/scenarios-root-scope.test.ts
bun run typecheck
```

**Step 7: Commit**

```bash
git add cli/core/write-record.ts cli/core/projection-ownership.ts cli/core/materialize.ts cli/core/skills.ts cli/core/hook-generator/sync-hooks.ts cli/core/worker-generator/sync-worker.ts cli/core/sync.ts cli/core/surface-kind.ts cli/core/types.ts test/core-write-record-v1.test.ts test/core-write-record.test.ts test/core-write-record-managed-content.test.ts test/core-materialize.test.ts test/scenarios-root-scope.test.ts
git commit -m "refactor(write): define projection ownership v1"
```

### Task 3: Prove Partial Project Writes Preserve Unselected Output

**Files:**

- Create: `test/commands-write-partial-ownership.test.ts`
- Modify: `test/sync-mcp-compat.test.ts`
- Modify: `test/cli-hook-write-e2e.test.ts`
- Modify: `test/core-worker-hook-stack.test.ts`
- Create: `test/commands-write-intent-purity.test.ts`
- Modify: `test/commands-project-workers.test.ts`
- Modify: `test/core-project-machine-isolation.test.ts`

**Step 1: Build a complete prior projection fixture**

The fixture must include:

- one active Blueprint closure;
- Claude and Codex skills;
- Claude, Codex, and Cursor MCP output;
- Claude and Codex hook adapters plus a generated Worker hook composer;
- a supported strict project write record.

Run a full write, then snapshot every target file, generated file, vendor path, project config, lock, and write record.

**Step 2: Add table-driven red regressions**

Run each supported partial invocation against the complete prior projection:

```text
--mcp-only
--skills-only
--target=claude
--target=codex
--target=cursor
--mcp-only --target=claude|codex|cursor
--skills-only --target=claude|codex|cursor
```

Assert:

- unselected paths and their hashes are unchanged;
- unselected ownership remains in the next record;
- selected stale ownership is cleaned;
- selected changed output is reconciled;
- hooks are neither deleted by MCP-only/skills-only writes nor by an unrelated target write;
- dry-run reports the same selected plan and changes no byte or mtime;
- config and lock remain byte- and mtime-identical;
- a subsequent full write is idempotent.

Add a no-prior-record case proving a partial write claims only what it actually emits.

**Step 3: Run focused integration and E2E tests**

```bash
bun test test/commands-write-partial-ownership.test.ts test/sync-mcp-compat.test.ts test/cli-hook-write-e2e.test.ts test/core-worker-hook-stack.test.ts test/commands-write-intent-purity.test.ts test/commands-project-workers.test.ts test/core-project-machine-isolation.test.ts test/scenarios-root-scope.test.ts
```

**Step 4: Commit**

```bash
git add test/commands-write-partial-ownership.test.ts test/sync-mcp-compat.test.ts test/cli-hook-write-e2e.test.ts test/core-worker-hook-stack.test.ts test/commands-write-intent-purity.test.ts test/commands-project-workers.test.ts test/core-project-machine-isolation.test.ts test/scenarios-root-scope.test.ts
git commit -m "test(write): preserve unselected project ownership"
```

### Task 4: Make Status and Doctor Use the Real Projection Plan

**Files:**

- Modify: `cli/core/sync.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `cli/commands/status.ts` only if output plumbing requires it
- Modify: `cli/commands/doctor.ts` only if output plumbing requires it
- Create: `test/commands-project-projection-status.test.ts`
- Modify: `test/commands-status.test.ts`
- Modify: `test/commands-doctor.test.ts`

**Step 1: Add red diagnostic cases**

Prove:

- record presence alone is not current;
- a planned write or removal makes status current false;
- same-path handoff cannot be hidden by byte equality;
- a missing selected output is stale;
- an invalid prototype record is reported and never rewritten;
- status and doctor are byte- and mtime-read-only;
- after a full write, status is current and doctor has no projection issue.

**Step 2: Expose the shared dry-run planner**

Add `planRepositoryProjection` as a read-only wrapper around the same state, preflight, ownership, and cleanup planning used by `syncRepository`. Do not create a second MCP renderer or path comparator in diagnostics.

Normalize planned changes into stable diagnostic issue strings without exposing secrets or full MCP definitions.

**Step 3: Remove the weak project-current predicate**

Replace `existsSync(state.recordPath) && state.overlayWarnings.length === 0`. Preserve ambient target-native collision reporting from Task 83.

**Step 4: Run focused tests**

```bash
bun test test/commands-project-projection-status.test.ts test/commands-status.test.ts test/commands-doctor.test.ts test/commands-write-partial-ownership.test.ts
bun run typecheck
```

**Step 5: Commit**

```bash
git add cli/core/sync.ts cli/core/diagnostics.ts cli/commands/status.ts cli/commands/doctor.ts test/commands-project-projection-status.test.ts test/commands-status.test.ts test/commands-doctor.test.ts
git commit -m "fix(diagnostics): report planned project drift"
```

---

## Part C: Repair Runtime and Operator Guidance

### Task 5: Remove Obsolete Commands from Runtime Remediation

**Files:**

- Modify: `cli/core/card-meta.ts`
- Modify: `cli/core/card-project.ts`
- Modify: `cli/core/card-skill-resolver.ts`
- Modify: `cli/core/vendor-manifest.ts`
- Modify: `cli/core/vendor-reconcile.ts`
- Create: `test/runtime-command-guidance.test.ts`
- Modify affected focused tests that assert exact errors

**Step 1: Add a red production-source scan**

Scan active `cli/**/*.ts` user-facing strings for the retired grammar in Section 2.6. Exclude test fixtures and historical documents, not production files.

**Step 2: Replace each message by intent**

- successor selection: `drwn apply <successor>`;
- missing lock refresh: `drwn update`;
- locked Card hydration or missing extracted content: `drwn install --no-write`, followed by `drwn write` where needed;
- network range refresh: `drwn up --fetch`;
- no migration-oriented wording.

**Step 3: Run tests and commit**

```bash
bun test test/runtime-command-guidance.test.ts test/commands-card-meta.test.ts test/core-update-revendor.test.ts test/commands-card-trust.test.ts
bun run typecheck
git add cli/core/card-meta.ts cli/core/card-project.ts cli/core/card-skill-resolver.ts cli/core/vendor-manifest.ts cli/core/vendor-reconcile.ts test/runtime-command-guidance.test.ts test/commands-card-meta.test.ts test/core-update-revendor.test.ts test/commands-card-trust.test.ts
git commit -m "fix(cli): teach supported remediation commands"
```

Stage only the focused test files actually changed; do not use the broad `test` path if unrelated Task 84 work is present.

### Task 6: Rewrite Canonical Operator Command and Identity Contracts

**Repository:** `darwinian-worker-skills` submodule

**Canonical files:**

- Modify: `skills/bootstrap-project/SKILL.md`
- Create: `skills/manage-project-worker/` from the supported portions of
  `apply-mind-card`, `install-project`, and `materialize-minds`
- Create: `skills/inspect-worker/` from the supported read-only portions of
  `inspect-minds` and `recommend-minds`
- Create: `skills/repair-worker/` from `repair-minds`
- Create: `skills/author-card/` from `author-mind-card` and
  `sync-card-skills`
- Create: `skills/share-card/` from `share-mind-card`
- Create: `skills/manage-machine-inventory/` from `manage-library` and
  `import-mcp-from-claude`
- Create: `skills/manage-machine-capabilities/` from `manage-defaults`
- Remove absorbed non-Mind source directories after their replacement skills
  pass validation: `apply-mind-card`, `install-project`, `materialize-minds`,
  `inspect-minds`, `recommend-minds`, `repair-minds`, `author-mind-card`,
  `sync-card-skills`, `share-mind-card`, `manage-library`, `manage-defaults`,
  and `import-mcp-from-claude`
- Preserve but exclude from Operator: `support-minds` and every dedicated
  Mind-specific source owned by Task 84
- Modify: `scripts/card-map.mjs`
- Modify: `bundle.json`
- Modify: `package.json`, `package-lock.json`, and `VERSION`
- Modify: `cards/operator/card.json` and `cards/operator/package.json`
- Modify: `README.md`, `MAINTAINERS.md`, and `examples/cards/README.md`
- Regenerate: `cards/operator/skills/**`
- Do not modify or regenerate `cards/base-mind/**`; Task 84 owns it

**Step 1: Add submodule contract tests before rewriting**

Extend the existing validation scripts or add a focused script that fails on:

- retired skill directories or IDs;
- duplicate project Worker management skills;
- forbidden command grammar;
- whole-Store archive/restore claims;
- Mind-operation, persona, belief, memory, or visibility claims in Operator;
- card-map, bundle, manifest, and generated-copy drift.

Scope retired-ID assertions to Operator and absorbed non-Mind sources. Do not
reject a Task 84-owned Mind skill merely because it is intentionally absent
from Operator.

**Step 2: Implement the eight-skill contract**

`manage-project-worker` must teach installed roots separately from singular active selection and use `add`, `apply`, `pin`, `remove`, `update`, and `use` accurately.

It also teaches `write` as pure projection and the supported partial modes;
there is no separate materialization skill.

`inspect-worker` teaches read-only status, provenance, doctor, catalog and
inventory discovery, and recommendations without mutating intent.

`repair-worker` consumes inspection evidence, previews mutations, and uses
only supported update/install/write commands.

`author-card` teaches both capability Card and Worker Blueprint source
lifecycles, including source sync. It does not teach persona, beliefs, memory,
Mind visibility, or Worker Mind operations.

`share-card` owns remote and publication operations with explicit approval
before network/public visibility changes.

`manage-machine-inventory` must teach standalone package/MCP lifecycle and the additive portable inventory boundary. It must distinguish immutable Card-owned capability bytes and bundled discovery inputs from standalone inventory.

Claude MCP import is a subworkflow of machine inventory, not a separate
Operator skill.

`manage-machine-capabilities` must teach profile-owned versus explicit machine selections and `machine skill|mcp enable|disable`. It must not describe machine capabilities as project declarations.

Rewrite the other affected skills according to Section 2.6. Remove obsolete workflows rather than adding footnotes about old commands.

**Step 3: Version the canonical source**

Set the root skill bundle to `0.5.0` and the Operator Card source to `2.0.0`. Set the Operator harness floor and validation version only after the Task 84 `0.9.0` runtime identity is present on the integration branch.

**Step 4: Regenerate and validate**

```bash
cd /Users/pureicis/dev/darwinian-minds/darwinian-worker-skills
npm run sync:cards
npm run sync:cards -- --check
npm run validate:skills
npm run validate:cards
npm run check:identity
npm run check:paths
npm run smoke:cli
```

Run the retired-command scan over active Operator canonical skills, generated
Operator Card skills, README, MAINTAINERS, and examples. Run a separate
boundary scan proving Operator contains no Mind-specific terminology or
commands.

**Step 5: Commit inside the submodule**

```bash
git add skills scripts/card-map.mjs bundle.json package.json package-lock.json VERSION cards/operator README.md MAINTAINERS.md examples/cards/README.md
git commit -m "feat(skills): align operator with the worker contract"
```

Push the submodule branch and give its exact SHA to the Task 84 owner. Do not publish the Operator Card yet.

**Step 6: Record the submodule pointer in the parent feature branch**

```bash
git add darwinian-worker-skills
git commit -m "chore(skills): advance the operator contract"
```

---

## Part D: Add Release Enforcement

### Task 7: Centralize and Verify the Operator Profile Contract

**Files:**

- Create: `cli/core/operator-profile-contract.ts`
- Modify: `cli/core/machine-config.ts`
- Modify: `cli/core/machine-profiles.ts`
- Modify: `cli/core/types.ts`
- Modify: `registry/machine-profiles.json` after publication coordinates exist
- Create: `scripts/verify-operator-contract.ts`
- Modify: `scripts/verify-release-readiness.ts`
- Create: `test/scripts-verify-operator-contract.test.ts`
- Create: `test/e2e-operator-profile-contract.test.ts`
- Modify: `test/scripts-verify-machine-contract.test.ts`
- Modify: `test/core-machine-profiles.test.ts`
- Modify profile fixtures found by the exact old pin scan

**Step 1: Add red verifier tests**

Mutation cases must reject:

- one retired command inserted into a canonical skill or production runtime message;
- one retired skill ID restored to card-map, bundle, Card manifest, profile, or generated copy;
- canonical/generated copy drift;
- profile version, source tag, commit, tree, integrity, skill-list, or MCP-list mismatch;
- canonical Operator content whose computed integrity differs from the registry;
- an Operator payload that exposes an MCP definition not explicitly approved;
- backup/restore language for Task 82 portable inventory.

Include a positive E2E fixture that installs the exact canonical Operator
payload into an isolated Store, initializes the profile through a local
immutable Git ref, verifies the pin offline, writes machine skills, and
observes exactly the eight approved IDs and no Mind-specific ID.

**Step 2: Centralize exact runtime constants**

Move approved Operator identity, source, version, immutable coordinates, skill list, and MCP list to `operator-profile-contract.ts`. Machine config and profile registry parsing consume this contract. Keep `MachineProfilePin` structurally typed; enforce exactness at runtime.

The packaged JSON registry remains external data and must deep-equal the centralized contract. Do not keep independent literal lists in three core modules.

**Step 3: Implement the offline verifier**

`verifyOperatorContract` reads only repository files and canonical Card bytes. It computes integrity using the same content-manifest implementation used by profile verification. It runs or reproduces `sync:cards --check` deterministically and scans active source scopes only.

Add it as a distinct `operator runtime contract` result in `verify:release`. Keep Task 79 Store export, Task 82 portable transfer, Task 83 ambient policy, and Task 84 semantic-memory checks independent.

**Step 4: Run focused tests**

```bash
bun test test/scripts-verify-operator-contract.test.ts test/e2e-operator-profile-contract.test.ts test/scripts-verify-machine-contract.test.ts test/core-machine-profiles.test.ts test/runtime-command-guidance.test.ts
bun run typecheck
```

The final registry-coordinate assertions remain red until Part E publishes and resolves `v2.0.0`. Do not insert fabricated commit, tree, or integrity values.

---

## Part E: Integrate Task 84 and Publish Immutable Cards

### Task 8: Merge the Task 84 Canonical Skill Work

**Dependency:** Task 84 Tasks 1-7 complete on its feature branch; its dedicated
Mind-specific skill edits preserve the Task 85 eight-skill Operator boundary
and are committed on top of the Task 85 submodule SHA.

**Step 1: Integrate in this order**

1. Merge Task 85 core projection and runtime-guidance commits into the Task 84 CLI branch.
2. Advance the parent `darwinian-worker-skills` gitlink to the Task 84 combined semantic/command commit.
3. Resolve `scripts/verify-release-readiness.ts` by retaining both the Operator
   runtime/boundary check and Task 84 semantic-memory check. The checks have
   disjoint ownership: Operator must contain no Mind tooling, while dedicated
   Mind Cards must satisfy Analysis 117.
4. Preserve all Task 82 checks and Analysis 116 portable inventory text.
5. Apply the narrow Analysis 116 correction from `"enforcement": "diagnostic-only"` to `"enforcement": "target-native"` and reference completed Task 83. Do not rewrite unrelated architecture sections.

**Step 2: Run the combined pre-publication gate**

```bash
bun test test/commands-write-partial-ownership.test.ts test/commands-project-projection-status.test.ts test/runtime-command-guidance.test.ts test/scripts-verify-operator-contract.test.ts test/worker-mind-semantic-residue.test.ts
bun run typecheck
cd darwinian-worker-skills
npm run sync:cards -- --check
npm run validate:skills
npm run validate:cards
```

Expected: all local behavior passes. Only exact public Operator V2 coordinate assertions may remain pending.

### Task 9: Publish `@darwinian/operator@2.0.0`

**Prerequisites:**

- Task 84 local `drwn 0.9.0` release candidate passes its core gate;
- final canonical Operator bytes are committed and generated copies are in sync;
- no public `v2.0.0` tag already exists;
- source doctor passes;
- the release operator has authenticated Git remote access.

**Step 1: Copy the exact canonical Card source into the editable source**

Sync `darwinian-worker-skills/cards/operator/` to `~/.agents/drwn/sources/@darwinian/operator/`, excluding the editable source's `.git` directory and deleting stale retired skill directories. Verify byte equality for every Card payload file after the copy.

Do not manually edit the Store source after this equality check.

**Step 2: Validate and publish locally**

```bash
drwn card source show @darwinian/operator --json
drwn card source doctor @darwinian/operator --json
drwn card publish @darwinian/operator
drwn card push @darwinian/operator
```

`card publish` must create immutable `v2.0.0`; do not use `--force-bump-mismatch` unless a separately reviewed structural-classification defect proves the major bump incorrectly classified.

**Step 3: Resolve the public tag in an isolated Store**

Use a temporary `HOME` and `AGENTS_DIR` and resolve:

```text
git+https://github.com/curation-labs/darwinian-operator.git#v2.0.0
```

Record the exact commit, tree SHA, and content integrity. Verify the resolved
extracted directory is byte-equivalent to the canonical Operator directory and
exposes exactly eight skills, zero Mind-specific skills, and zero MCP servers.

**Step 4: Update the profile contract and make tests green**

Replace every old V1 profile fixture by the real V2 coordinates. No parser accepts `v1.0.2` afterward. Run:

```bash
bun test test/scripts-verify-operator-contract.test.ts test/e2e-operator-profile-contract.test.ts test/scripts-verify-machine-contract.test.ts test/core-machine-profiles.test.ts test/core-machine-config.test.ts test/core-defaults.test.ts test/commands-status.test.ts test/commands-doctor.test.ts
bun run verify:release --json
```

**Step 5: Commit**

```bash
git add cli/core/operator-profile-contract.ts cli/core/machine-config.ts cli/core/machine-profiles.ts cli/core/types.ts registry/machine-profiles.json scripts/verify-operator-contract.ts scripts/verify-release-readiness.ts test/scripts-verify-operator-contract.test.ts test/e2e-operator-profile-contract.test.ts test/scripts-verify-machine-contract.test.ts test/core-machine-profiles.test.ts test/core-machine-config.test.ts test/core-defaults.test.ts test/commands-status.test.ts test/commands-doctor.test.ts
git commit -m "feat(machine): pin the operator v2 contract"
```

Stage only Task 85 test paths after auditing `git diff --cached --name-status`.

### Task 10: Publish the Aggregate Worker Blueprint V2

**Editable source:** `~/.agents/drwn/sources/@darwinian/darwinian-cards-worker`

Set:

```json
{
  "version": "2.0.0",
  "kind": "blueprint",
  "composedFrom": [
    "@remyjkim/fal@^0.2.0",
    "@darwinian/operator@2.0.0",
    "@leeminseung/notion@0.1.0"
  ],
  "harness": { "minVersion": "0.9.0" },
  "lastValidatedWith": "0.9.0"
}
```

Preserve the existing Fal and Notion intent unless their public coordinates have independently changed. Exact Operator V2 is required.

Run source doctor, publish, push, and isolated public-tag resolution exactly as for Operator. Verify the resolved Blueprint closure pins Operator V2 and has no V1 Operator or retired skill ID.

Do not change the remote deploy payload schema.

---

## Part F: Controlled Clean Reset and Consumer Rollout

### Task 11: Remove Prototype Projection State with the Old CLI

This phase runs before replacing the installed `drwn 0.8.0` CLI. It is an operational reset, not a compatibility feature.

**Machine cleanup:**

1. Record `drwn --version`, `drwn status --machine --json`, and the paths in the machine write record.
2. Move `~/.agents/drwn/machine.json` to a temporary location outside the Store.
3. In a temporary empty project, run `drwn init --non-interactive --minimal --no-default-catalogs` with the real `AGENTS_DIR` to create an explicit empty machine config.
4. Keep the old global write record present and run a full `drwn write --scope machine` so the old CLI safely removes its prior owned user-home projections.
5. Verify `drwn write --scope machine --dry-run --json` reports no changes.
6. Remove the prototype global write record and temporary empty machine config.

If old owned output has drifted, stop and inspect it. Do not bypass drift protection or delete user-home directories broadly.

**Project cleanup in `/Users/pureicis/dev/darwinian-cards`:**

1. Record `git status --short`, project status, doctor, and full dry-run.
2. Run `drwn apply --none --write` with the old CLI, allowing the old supported ownership record to remove its own project projections.
3. Verify no old managed target or generated output remains.
4. Remove the prototype `.agents/drwn` project state.
5. Preserve unrelated `.agents`, user-authored target config, `.env`, Notion credentials, and non-drwn files.

Do not commit temporary backups or reset artifacts.

### Task 12: Initialize the First Supported State with `drwn 0.9.0`

**Step 1: Install/use the combined 0.9.0 release candidate**

Confirm the local CLI contains Task 85 and Task 84 and passes package smoke verification.

**Step 2: Recreate machine intent**

Run guided setup and accept Recommended Darwinian Operator. Confirm `machine.json` pins exact Operator V2 and contains no retired skill ID. Run machine projection and verify status/doctor.

**Step 3: Recreate the consumer project**

Initialize a new project config, then apply exact aggregate V2:

```bash
drwn init --force --guided
drwn apply @darwinian/darwinian-cards-worker@2.0.0 --write
drwn status --json
drwn doctor --json
drwn write --dry-run --json
```

Expected:

- exactly one active Worker root;
- closure contains Fal, Operator V2, and Notion;
- Claude/Codex skills contain new Operator IDs and no retired IDs;
- Claude/Codex/Cursor MCP projections contain Fal and Notion according to target-native ownership;
- status projection is current;
- doctor reports no project projection issue;
- full and every partial dry-run report no destructive unselected cleanup;
- Notion and Momentic authentication remain operator-owned environment/runtime state and are not written into Card, lock, write record, or portable inventory artifacts.

### Task 13: Add the Real Consumer Smoke to Release Evidence

Capture redacted command results and exact published coordinates in a Task 85 completion note. Do not commit secrets, user-home paths beyond documented placeholders, full MCP payloads, or environment values.

---

## Part G: Final Verification and Integration

### Task 14: Run the Complete Gate

**Focused projection gate:**

```bash
bun test test/core-write-record-v1.test.ts test/core-write-record.test.ts test/core-write-record-managed-content.test.ts test/commands-write-partial-ownership.test.ts test/commands-project-projection-status.test.ts test/commands-status.test.ts test/commands-doctor.test.ts test/cli-hook-write-e2e.test.ts test/core-worker-hook-stack.test.ts test/scenarios-root-scope.test.ts
```

**Focused Operator gate:**

```bash
bun test test/runtime-command-guidance.test.ts test/scripts-verify-operator-contract.test.ts test/e2e-operator-profile-contract.test.ts test/scripts-verify-machine-contract.test.ts test/core-machine-profiles.test.ts
cd darwinian-worker-skills
npm run sync:cards -- --check
npm run validate:skills
npm run validate:cards
npm run check:identity
npm run check:paths
npm run smoke:cli
```

**Full CLI gate:**

```bash
bun test --timeout 30000 ./test/
bun run typecheck
bun run verify:bridge
bun run verify:release --json
npm pack --dry-run --json
git diff --check
```

Task 84 owns its additional semantic-memory and cross-repository gates. Run those before the final release/tag step in Task 84.

### Task 15: Final Contract and Residue Audit

Search active production and canonical Operator scopes for:

```text
drwn card add|apply|pin|remove|update|detach
drwn worker stack
drwn mind list|use|clear
drwn library
drwn store
drwn skills curate|uncurate
--no-apply
apply-mind-card
manage-active-mind-stack
manage-library
manage-defaults
materialize-minds
```

Expected: zero active runtime/canonical hits. Historical analyses, completed task records, and mutation-test fixtures may retain exact rejection strings and must be excluded by explicit path, not by weakening patterns.

Verify:

- Analysis 116 says ambient enforcement is `target-native`;
- Task 82 portable transfer text remains intact;
- Task 84 Analysis 117 boundaries remain intact;
- registry and centralized Operator contract deep-equal;
- canonical Operator integrity equals the pinned profile integrity;
- public Operator and aggregate tags resolve to recorded immutable coordinates;
- no compatibility reader or old command alias exists;
- remote deploy fixtures and payload schema are unchanged.

### Task 16: Commit Completion and Integrate the Linear Feature Chain

Create `.ai/tasks/85_completion_projection_ownership_and_operator_contract.md` with:

- Task 82 baseline SHA;
- Task 85 branch and commit list;
- Task 84 integration SHA;
- canonical skill submodule SHA;
- public Operator and aggregate commit/tree/integrity coordinates;
- isolated E2E counts;
- full test/typecheck/release/package results;
- redacted consumer reset evidence;
- confirmation that no worktree or compatibility layer was used.

Commit:

```bash
git add .ai/tasks/85_completion_projection_ownership_and_operator_contract.md
git commit -m "docs(tasks): record projection and operator remediation"
```

The existing Task 77-83 chain is already linear. Integrate the final Task 84/85 branch into `main` once, after fetching and reviewing any new upstream commits. Do not separately merge historical feature branch labels that are already ancestors.

---

## 4. Acceptance Matrix

| Requirement | Proof |
|---|---|
| Project partial writes preserve unselected output | complete prior-record unit/integration/E2E matrix |
| Selected stale output is still cleaned | selected-surface removal cases plus full-write cleanup |
| Same-path kind changes cannot delete desired files | `diffWriteRecord` unit invariant and Cursor regression |
| Write record is first supported namespaced V1 | strict parser tests and prototype rejection |
| No compatibility or migration code | residue scan and release mutation test |
| Status and doctor agree with write dry-run | shared planner tests and live consumer smoke |
| Runtime remediation uses current commands | production-source scan and exact error tests |
| Operator uses the target mental model | eight-skill allowlist, Mind-boundary and retired-ID rejection, command scan |
| Whole-Store workflows remain unavailable | Task 79 gate plus Operator backup/restore rejection |
| Exact pinned payload equals canonical bytes | content-integrity comparison and generated sync check |
| Public profile is immutable | exact tag, commit, tree, integrity resolution in isolated Store |
| Task 84 work is preserved | submodule merge order and combined release gate |
| Consumer starts clean | old-CLI ownership cleanup followed by new V1 initialization |
| No secret leakage | symbolic references, isolated tests, redacted completion evidence |
| No deploy regression | unchanged payload fixtures and full deploy tests |

---

## 5. Stop Conditions

Stop before publication or reset if any of these occur:

- Task 84 has edited generated Operator copies without the canonical source changes;
- the public `v2.0.0` Operator or aggregate tag already exists with different bytes;
- Task 82 files cannot be isolated from coworker-owned changes by explicit staging;
- old machine/project projection drift prevents safe cleanup;
- canonical Operator integrity differs from the isolated public-tag resolution;
- the 0.9.0 release candidate fails Task 79, 82, 83, 84, or Task 85 gates;
- consumer state contains uncommitted user-owned files at a path the reset would remove;
- profile or portable inventory output contains resolved credentials.

Do not respond to a stop condition with `--force`, a compatibility parser, a mutable tag, a broad filesystem deletion, or a weakened release test. Diagnose the ownership or publication discrepancy and revise this plan with evidence.
