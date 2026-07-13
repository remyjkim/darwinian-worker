# ABOUTME: Proposed machine-default schema and projection remediation plan, separated from Worker-root migration.
# ABOUTME: Blocks implementation until fresh bootstrap and related machine-policy decisions are explicitly approved.

# Task 80: Machine Defaults V2 Remediation Plan

> **For Codex:** Do not execute implementation tasks until every decision gate below is recorded as approved.

**Status**: Proposed; blocked on machine-default product decisions

**Goal**: Make machine default intent explicit, migration-safe, and ownership-safe without leaking capability defaults into projects.

**Dependency**: Task 77 supplies project isolation. Approved persistence primitives from Task 81 may be reused, but Task 80 is not blocked on the complete Library lifecycle.

---

## 0. Decision gates

### D1: Fresh default contents

Choose exactly one:

1. **Explicit packaged bootstrap**: initialize once from an approved, versioned list in packaged config.
2. **Explicit empty defaults**: initialize `skills:[]` and `mcpServers:[]`.

If packaged bootstrap is selected, approval must name every skill and MCP ID. Neither current curated-directory contents nor registry `optional` flags are an acceptable implicit specification.

Safe behavior until D1 resolves: preserve existing fresh-install behavior and make no schema change.

### D3: Machine policy schema

Approve or reject moving catalog, trust, authoring, service, target, and extension policy into dedicated V2 fields. Project capability isolation does not itself require this full schema change.

### D4: Direct curation lifecycle

Choose whether `skills curate/uncurate` is removed, retained as a compatibility primitive, or deprecated for one bounded release. Record exact command and migration behavior.

### D5: Projection cleanup

Approve ownership-record requirements, foreign-path behavior, drift force semantics, and `doctor --fix` scope before cleanup code can delete or replace user-home paths.

No code task below begins while any applicable gate is unresolved.

---

## 1. Proposed implementation sequence

### Task 1: Define versioned machine schema and initialization

**Files:**
- Modify: `cli/core/types.ts`
- Modify: `cli/core/card-store.ts`
- Modify: `cli/core/store-paths.ts`
- Modify: `cli/core/user-config.ts`
- Create: `cli/core/machine-config-migration.ts`
- Create: `test/core-machine-config-migration.test.ts`
- Modify: `test/core-user-config.test.ts`

Tests cover the approved D1 seed exactly, explicit empty arrays, no reseeding, missing sources, and byte-identical reruns.

### Task 2: Build explicit dry-run migration

**Files:**
- Modify: `cli/commands/store/migrate.ts`
- Modify: `cli/commands/doctor.ts`
- Modify: `test/commands-store.test.ts`
- Modify: `test/commands-doctor.test.ts`

The existing pre-Cards filesystem migration and proposed machine migration are ordered, separately reported phases. No-layout must not short-circuit machine inspection. Missing policy decisions produce zero writes.

Legacy absent arrays require an explicit operator policy:

```text
--machine-defaults=preserve
--machine-defaults=empty
```

The preserve candidate report distinguishes explicit IDs, drwn-owned projection evidence, optional/parallel legacy behavior, and foreign directories.

### Task 3: Remove alternate machine activation evaluators

**Files:**
- Modify: `cli/core/defaults.ts`
- Modify: `cli/core/mcp.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `test/core-defaults.test.ts`
- Modify: `test/sync-mcp.test.ts`

Only after migration completion is recorded may runtime stop reading legacy optional/parallel activation. Project behavior remains governed by Task 77 regardless of machine migration state.

### Task 4: Apply approved intent/materialization and curation policy

**Files:**
- Modify: `cli/commands/library/defaults/add-skill.ts`
- Modify: `cli/commands/library/defaults/remove-skill.ts`
- Modify: `cli/commands/library/defaults/add-mcp.ts`
- Modify: `cli/commands/library/defaults/remove-mcp.ts`
- Modify: `cli/commands/skills/curate.ts`
- Modify: `cli/commands/skills/uncurate.ts`
- Modify: `cli/index.ts`
- Modify: `test/commands-library-defaults.test.ts`
- Modify: `test/commands-skills-mutate.test.ts`

Defaults commands mutate intent only if that side-effect model is approved. Curation paths follow D4 exactly rather than being removed by inference.

### Task 5: Add ownership-safe projection and repair

**Files:**
- Modify: `cli/core/skills.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/write-record.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `cli/commands/doctor.ts`
- Modify: `test/core-write-record.test.ts`
- Modify: `test/scenarios-root-scope.test.ts`

Implement D5 with full preflight and no deletion of unrecorded paths. Drifted owned paths remain preserved unless the approved force policy says otherwise.

### Task 6: Align machine capture and documentation

**Files:**
- Modify: `cli/commands/card/new.ts`
- Modify: `cli/core/card-capture.ts`
- Modify: `test/commands-card-new-from-defaults.test.ts`
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Create: `docs/migrations/0.8-machine-defaults-v2.md`

`--from-defaults` reads only approved explicit machine intent and preserves secret references, never literal credential values.

---

## Required verification after approval

```bash
bun run typecheck
bun test
bun run verify:release --json
```

Completion requires a decision record naming D1/D3/D4/D5 outcomes and exact migration evidence. Until then this file is design inventory, not an executable implementation plan.
