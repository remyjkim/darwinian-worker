# ABOUTME: Fail-closed security hotfix plan for the unsafe whole-store export command.
# ABOUTME: Disables ordinary Store export without changing deploy's scoped payload export or Store seed semantics.

# Task 79: Store Export Security Hotfix Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` task-by-task and `verification-before-completion` before release.

**Status**: Completed 2026-07-13

**Completion evidence**: `.ai/tasks/79_completion_store-export-security.md`

**Goal**: Prevent `drwn store export` from archiving credentials and operational machine state until a separately approved portable format exists.

**Architecture**: Fail closed at the command boundary before creating an output directory or archive. Keep the command registered so scripts receive a stable remediation error. Do not modify deploy's typed, Card-scoped Store payload or the existing seed importer.

**Security finding**: `cli/commands/store/export.ts` archives `entries:[\"drwn\"]`, while `credentials.json`, `machine.json`, project registration, write history, generated output, and caches live under that root.

**Relationship to other work**:

- ship before or alongside the Task 77 `0.8.0` release cut;
- Task 82 may later replace the disabled command with a portable inventory format;
- a full-machine backup remains out of scope and requires encryption/restore design.

---

### Task 0: Record approval and preserve the independent code scope

**Files:**
- Add to architecture/follow-up planning commit: `.ai/tasks/79_drwn-store-export-security-hotfix-plan.md`

The plan may be committed with Analysis 116 and the other separated plans. Do not stage the auth fixture or unrelated Task 78 completion record with that documentation commit. Do not combine this plan's eventual code changes with Task 77 Worker commits.

After that planning commit, create a dedicated worktree and run Tasks 1-3 there:

```bash
git worktree add ../darwinian-minds-task-79 -b fix/task-79-store-export-security
cd ../darwinian-minds-task-79
git status --short
```

Expected: a clean worktree. If Task 77 work is already active, coordinate the shared README, quick-reference, and release-verifier paths explicitly rather than mixing either task's code commits.

---

### Task 1: Prove the current disclosure boundary

**Files:**
- Modify: `test/commands-store-maintenance.test.ts`

**Step 1: Add a red security regression**

Create a fixture with recognizable sentinels in:

- `credentials.json`;
- `machine.json`;
- `projects.json`;
- `global-write-record.json`;
- one Card inventory path.

Run the current command and prove the tar contains the credential and operational sentinels. This red characterization test may inspect current behavior locally, but the committed target assertion must require refusal and no archive.

**Step 2: Add target assertions**

```text
store export invocation       -> nonzero
error code                    -> STORE_EXPORT_DISABLED_UNSAFE
output archive                -> absent
new output parent directory   -> absent
store bytes                   -> unchanged
```

Run:

```bash
bun test test/commands-store-maintenance.test.ts
```

Expected before implementation: FAIL because export succeeds and writes an archive.

---

### Task 2: Disable ordinary whole-store export

**Files:**
- Modify: `cli/commands/store/export.ts`
- Modify: `cli/core/errors.ts` only if stable-code rendering requires it
- Modify: `test/commands-store-maintenance.test.ts`

**Step 1: Fail before side effects**

`StoreExportCommand.execute` returns a typed `STORE_EXPORT_DISABLED_UNSAFE` error before `mkdir` or archive construction. Human and JSON-compatible error handling must state:

```text
Whole-store export is disabled because it can include credentials and operational state.
Portable inventory export is tracked separately; no unrestricted override is available.
```

Do not add `--force`, `--unsafe`, or an environment bypass.

**Step 2: Preserve independent paths**

Run existing deploy tests proving `createStoreExportForLock` still includes only the typed Card closure required by deploy. Do not change `store seed` or `DRWN_STORE_SEED_PATH` in this hotfix.

**Step 3: Verify**

```bash
bun test test/commands-store-maintenance.test.ts test/core-worker-deploy.test.ts test/commands-store-seed.test.ts test/core-store-seed.test.ts
bun run typecheck
```

Expected: all pass; disabled command creates no output.

**Step 4: Commit**

```bash
git add cli/commands/store/export.ts cli/core/errors.ts test/commands-store-maintenance.test.ts
git commit -m "fix(store): disable unsafe whole-store export"
```

Stage `cli/core/errors.ts` only if modified.

---

### Task 3: Update security-facing documentation and release gate

**Files:**
- Modify: `README.md`
- Modify: `docs/cli-quickref.md`
- Modify: `scripts/verify-release-readiness.ts`
- Modify: `test/cli-help-shape.test.ts`

Remove claims that `store export` creates a transferable backup. Explain that existing archives must be treated as sensitive. Add a release check rejecting production `createArchive(... entries:[\"drwn\"])` in the ordinary export command.

Verify:

```bash
bun test test/cli-help-shape.test.ts
bun run typecheck
bun test
bun run verify:release --json
```

Expected: zero failures and release verification `ok:true`.

Commit:

```bash
git add README.md docs/cli-quickref.md scripts/verify-release-readiness.ts test/cli-help-shape.test.ts
git commit -m "docs(store): document fail-closed export"
```

---

## Completion

- [x] Ordinary Store export fails before any output side effect.
- [x] No bypass can archive the whole Store.
- [x] Deploy's scoped Card export remains compatible.
- [x] Seed behavior remains unchanged.
- [x] Existing broad archives are documented as sensitive.
- [x] Full verification passes.
