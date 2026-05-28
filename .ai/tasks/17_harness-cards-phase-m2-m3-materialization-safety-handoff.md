# Task 17: Harness Cards Phase M2-M3 Materialization Safety Handoff

**Status**: Ready After M1
**Created**: 2026-05-20
**Updated**: 2026-05-20
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 2 PRs
**Dependencies**: M0-M1 complete
**References**: [tasks/14_harness-cards-implementation-plan.md, tasks/16_harness-cards-phase-m0-m1-foundation-handoff.md, analyses/29_harness-cards-target-architecture-v1_1.md, cli/core/sync.ts, cli/core/skills.ts, cli/core/mcp.ts, cli/core/diagnostics.ts, cli/core/paths.ts]

---

## Objective

Land the materialization safety layer before card-derived writes exist: write-records, idempotency, safe cleanup, managed-field hashing, and drift refusal.

---

## Scope

This document covers:

- **M2:** write-record schema, atomic writes, corruption fallback, cleanup, idempotency property tests, removal of M1 legacy fallback branches.
- **M3:** `_bgng` managed metadata for Claude/Codex, canonical hashing, `--force`, Cursor symlink drift detection.

It does not cover card manifest commands, card resolution, or project-local materialization.

---

## Entry Checks

Run:

```bash
git status --short --branch
bun test test/core-migration.test.ts test/commands-store.test.ts
bun test
bun run typecheck
```

Expected:

- M1 store migration and store-aware loaders are green.
- M1 legacy fallback branches are still present at the start of M2 and explicitly marked for removal.

---

## M2 Work Plan

### M2.1 Add Write-record Module

Create:

```text
cli/core/write-record.ts
```

Required exported types:

```ts
export interface WriteRecord {
  writeRecordVersion: 1;
  lastWriteAt: string;
  lastWriteHarnessVersion: string;
  managedPaths: ManagedPath[];
}

export type ManagedPath =
  | { path: string; kind: "symlink"; target: string }
  | { path: string; kind: "managed-fields"; fields: string[]; fieldHashes: Record<string, string> }
  | { path: string; kind: "generated-symlink"; generatedPath: string };
```

Required helpers:

- `resolveProjectWriteRecordPath(projectRoot)`
- `loadWriteRecord(path)`
- `saveWriteRecord(path, record)`
- `diffWriteRecord(previous, desired)`

Atomic write requirement:

- write `write-record.json.tmp`
- fsync file
- rename into place
- fsync parent directory

### M2.2 Scope-relative Paths

Write-record `path` values must be relative to the materialization scope:

```text
.claude/skills/alpha
.claude/settings.json
.codex/config.toml
.cursor/mcp.json
```

Symlink `target` values should be absolute, after realpath resolution, so ownership checks are stable across current working directories.

### M2.3 Integrate Into Sync

Modify:

```text
cli/core/sync.ts
cli/core/skills.ts
cli/core/mcp.ts
```

Behavior:

1. Read prior write-record.
2. Compute desired managed paths from the effective state.
3. Remove prior paths not present in desired state only when they still match the recorded ownership.
4. Create or update desired paths.
5. Save new write-record.

Missing/corrupt fallback:

```text
no prior write-record; treating existing on-disk state as user-owned for this write
```

Print once per write. Skip cleanup for that write.

### M2.4 Doctor Checks

Modify:

```text
cli/core/diagnostics.ts
```

Add checks:

- write-record missing
- write-record malformed
- recorded symlink path missing
- recorded symlink points somewhere else
- recorded managed-field file missing
- recorded generated symlink replaced by non-symlink

Doctor is report-only.

### M2.5 Idempotency Tests

Create:

```text
test/scenarios-idempotency.test.ts
```

Minimum fixtures:

- empty project
- project with overlay-only config
- project with current skill materialization
- machine scope with no project

Each fixture:

```text
write once -> expect changes
write again -> expect changes = [] and no warnings
```

### M2.6 Cleanup Tests

Create:

```text
test/scenarios-cleanup.test.ts
```

Minimum coverage:

- removing a managed skill removes its symlink on next write
- unrelated user-created directory at the same path is preserved
- missing write-record skips cleanup
- corrupt write-record skips cleanup

### M2.7 Remove M1 Fallback Branches

At the end of M2, remove legacy fallback branches added in M1.

Be precise: keep `cli/core/paths.ts` functions that still represent non-store tool paths, but remove legacy resolvers for:

- old user config path as active machine config
- old MCP library path as active library
- old skill package root as active package source

Migration code may retain explicit legacy input helpers if they are only used by `bgng store migrate`.

### M2 Exit Checks

Run:

```bash
bun test test/core-write-record.test.ts test/scenarios-idempotency.test.ts test/scenarios-cleanup.test.ts
bun test
bun run typecheck
```

---

## M3 Work Plan

### M3.1 Managed-field Module

Create:

```text
cli/core/managed-fields.ts
```

Required behavior:

- canonical JSON hashing with sorted object keys
- TOML hashing based on parsed/canonical form, not raw whitespace
- `_bgng` metadata read/write for JSON
- equivalent managed metadata handling for Codex TOML
- drift detection using write-record hashes as authoritative

### M3.2 Claude Settings

Modify:

```text
cli/core/mcp.ts
```

Claude `settings.json` behavior:

- preserve user-owned top-level keys
- write/update managed `mcpServers`
- write/update `_bgng`
- refuse if prior write-record hash differs from current managed value and `--force` is absent
- overwrite on `--force`

### M3.3 Codex Config

Codex `config.toml` behavior:

- preserve user-owned sections
- manage only `mcp_servers` sections
- record section hashes
- refuse on managed-section drift without `--force`
- overwrite on `--force`

### M3.4 Cursor Symlink Drift

Cursor remains generated-file-plus-symlink.

Drift cases:

- `.cursor/mcp.json` is a regular file where write-record says symlink
- symlink target differs from recorded generated path
- generated file is missing

Without `--force`, refuse. With `--force`, restore generated file and symlink.

### M3.5 Write Command Flag

Modify:

```text
cli/commands/write.ts
```

Add:

```bash
bgng write --force
```

Error message must include:

- what drifted
- how to preserve desired edits in config
- how to overwrite with `--force`

### M3.6 Diagnostics

`bgng doctor` must use the same hashing logic as `write`.

If `_bgng` hashes and write-record hashes disagree, doctor should warn that write-record is authoritative for drift decisions.

### M3 Tests

Add:

```text
test/core-managed-fields.test.ts
test/commands-write-drift.test.ts
```

Minimum coverage:

- canonical JSON hash stable across key order
- canonical JSON hash detects value changes
- TOML hash stable across formatting
- Claude managed field drift refused
- Claude `--force` overwrites drift
- Codex managed section drift refused
- Codex `--force` overwrites drift
- Cursor replaced symlink refused
- Cursor `--force` restores symlink
- doctor reports drift without mutating

### M3 Exit Checks

Run:

```bash
bun test test/core-managed-fields.test.ts test/commands-write-drift.test.ts
bun test test/scenarios-idempotency.test.ts
bun test
bun run typecheck
```

---

## Known Phase Risks

| Risk | Mitigation |
|---|---|
| Cleanup deletes user content | Delete only paths that still match write-record ownership. Test replacement-with-user-content. |
| Drift false positives from formatting | Hash canonical parsed data, not raw text. |
| `_bgng` conflicts with downstream readers | Keep metadata minimal; document in usage guide; doctor validates. |
| Removing M1 fallback too early | Remove only after store-aware consumers are tested on new layout. Migration input helpers can remain scoped to migration. |

---

## Handoff Exit Criteria

M3 is handoff-complete when:

- second `bgng write` is a true no-op in tested fixtures
- cleanup is safe and write-record-backed
- drift refusal works for Claude, Codex, and Cursor
- `--force` recovers drift
- doctor reports write-record and managed-region problems
- no active runtime path uses old legacy layout except migration input code
