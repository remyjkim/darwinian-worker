# ABOUTME: Proposed credential-free portable inventory export and seed plan.
# ABOUTME: Replaces the disabled whole-store archive only after format and restore semantics are approved.

# Task 82: Portable Store Transfer Plan

> **For Codex:** Do not re-enable `drwn store export` until this format and its seed semantics are approved.

**Status**: Proposed; depends on Task 79 and relevant Task 81 persistence decisions

**Goal**: Transfer reusable inventory without credentials, machine intent, project registration, write history, generated state, or caches.

---

## 0. Format decisions

Approve:

- archive type and top-level path;
- exact allowlisted record kinds;
- whether editable Card sources are portable;
- duplicate/version conflict behavior;
- fresh versus non-empty seed semantics;
- whether timestamps participate in reproducibility;
- compatibility/version policy.

The format must be allowlist-built. Archiving the Store root and subtracting denied paths is prohibited.

---

### Task 1: Define portable schema and security fixtures

**Files:**
- Create: `cli/core/store-portable.ts`
- Create: `test/core-store-portable.test.ts`

Candidate top-level manifest:

```json
{
  "format": "drwn-portable-inventory",
  "version": 1,
  "createdAt": "ISO-8601",
  "cliVersion": "x.y.z",
  "entries": []
}
```

Each entry records typed identity, relative path, byte size, and SHA-256. Fixtures plant unique sentinels in every inventory and operational Store category and scan both member names and decompressed bytes.

### Task 2: Build typed inventory export

**Files:**
- Modify: `cli/commands/store/export.ts`
- Modify: `cli/core/store-portable.ts`
- Modify: `test/commands-store-maintenance.test.ts`

Export selects only approved typed records. Deny credentials, `machine.json`, `projects.json`, global write records, generated/extracted/cache/transaction state, and resolved secret values. Any unexpected path fails with `STORE_EXPORT_CONTAINS_SECRETS` or a more precise validation code.

No `--all` or unrestricted override exists.

### Task 3: Implement inventory-scoped seed

**Files:**
- Modify: `cli/core/store-seed.ts`
- Modify: `cli/commands/store/seed.ts`
- Modify: `test/commands-store-seed.test.ts`
- Modify: `test/core-store-seed.test.ts`

Stage and verify the entire portable archive before mutation. Fresh seed initializes machine state according to approved Task 80 policy, not this task's inference. Non-empty seed behavior requires an explicit approved inventory merge/replace option and preserves credentials, machine intent, project registry, and write history byte-for-byte.

Legacy full snapshots remain a separately named compatibility input only if explicitly approved; they are not produced by ordinary export.

### Task 4: Threat-model and release-gate the format

**Files:**
- Modify: `scripts/verify-release-readiness.ts`
- Modify: `README.md`
- Modify: `docs/cli-quickref.md`

Test path traversal, duplicate entries, escaping symlinks, integrity mismatch, oversized members, secret literals, and interrupted replacement. Release verification rejects archive-the-root implementations.

Required final verification:

```bash
bun run typecheck
bun test
bun run verify:release --json
```

This task does not define full-machine backup. Backup requires a separately approved encrypted format, destination policy, key recovery, and restore procedure.
