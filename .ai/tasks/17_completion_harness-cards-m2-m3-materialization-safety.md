# Task 17 Completion: Harness Cards M2-M3 Materialization Safety

**Date:** May 21, 2026

**Task:** `.ai/tasks/17_harness-cards-phase-m2-m3-materialization-safety-handoff.md`

**Status:** Completed

## Scope

Task 17 implemented the safety layer needed before card-derived writes could be trusted:

- M2: write records, idempotency, safe cleanup, corruption fallback, and doctor checks
- M3: managed-field hashing, drift refusal, and `--force`

This task did not implement card authoring or consumption. It made the existing write path safe enough for cards to use later.

## M2 Completion

### Write-record module

The write-record implementation was added in:

- `cli/core/write-record.ts`

It supports:

- write-record schema version 1
- managed symlink records
- managed-field records
- generated-file-plus-symlink records
- load and validation behavior
- atomic save behavior
- diffing previous and desired records

Write-record paths are scope-relative. Symlink targets are recorded as resolved absolute paths so ownership checks are stable.

### Write integration

The write path now:

1. loads the prior write record
2. computes the desired managed paths
3. removes stale paths only when they still match recorded ownership
4. creates or updates desired paths
5. saves the new write record

Missing or malformed write records are handled conservatively. Cleanup is skipped for that write because existing on-disk state is treated as user-owned.

### Safe cleanup

Cleanup behavior now removes only bgng-owned stale materialization. It preserves unrelated regular files, directories, and symlinks that do not match the write-record ownership proof.

### Idempotency

Repeated writes are covered by scenario tests. A second identical write produces zero changes and no warnings in the tested scenarios.

Relevant tests:

- `test/core-write-record.test.ts`
- `test/scenarios-idempotency.test.ts`
- `test/scenarios-cleanup.test.ts`

## M3 Completion

### Managed-field hashing

Managed-field support was added in:

- `cli/core/managed-fields.ts`

The implementation uses canonical hashing so whitespace and key-order changes do not create false drift.

Managed metadata is written for:

- Claude `settings.json`
- Codex `config.toml`

### Drift refusal and force overwrite

`bgng write` refuses to overwrite managed-region edits when current disk state does not match the write-record hash.

Users can intentionally overwrite managed drift with:

```bash
bgng write --force
```

Relevant test:

- `test/commands-write-drift.test.ts`

### Cursor generated-file safety

Cursor keeps the generated-file-plus-symlink model. The write record tracks the generated file and symlink relationship so stale or replaced generated files can be diagnosed.

## Diagnostics Added

Doctor and status diagnostics can now report:

- missing write records
- malformed write records
- recorded symlink paths that are missing
- recorded symlinks pointing somewhere unexpected
- managed-field files that are missing
- generated symlinks replaced by non-symlinks
- MCP drift and missing generated files

Relevant files:

- `cli/core/diagnostics.ts`
- `test/core-diagnostics-sections.test.ts`
- `test/commands-doctor.test.ts`

## Verification Performed

### Targeted tests

Task 17 behavior is covered by:

- `test/core-write-record.test.ts`
- `test/core-managed-fields.test.ts`
- `test/commands-write-drift.test.ts`
- `test/scenarios-idempotency.test.ts`
- `test/scenarios-cleanup.test.ts`
- `test/commands-doctor.test.ts`
- `test/core-diagnostics-sections.test.ts`

### Full suite

```bash
bun test
```

Result:

```text
319 pass, 0 fail, 1257 expect() calls
```

### Type checking

```bash
bun run typecheck
```

Result: passed.

## Deviations From The Handoff

The handoff expected M2 and M3 to be separate PR-sized units. The later instruction required completing all milestones before reporting back, so these phases were completed together in the current workspace.

## Deferred Or Residual Risk

- The implementation verifies filesystem behavior and generated tool files, but it does not launch the downstream Claude Code, Codex, or Cursor applications.
- Atomic write behavior is covered at the helper level; the suite does not simulate process crashes at every possible fsync boundary.

