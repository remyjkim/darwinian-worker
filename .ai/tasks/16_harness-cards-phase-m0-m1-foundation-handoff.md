# Task 16: Harness Cards Phase M0-M1 Foundation Handoff

**Status**: Ready For M0 Start
**Created**: 2026-05-20
**Updated**: 2026-05-20
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 2 PRs
**Dependencies**: `.ai/tasks/14_harness-cards-implementation-plan.md`, `.ai/tasks/15_harness-cards-execution-handoff.md`
**References**: [tasks/14_harness-cards-implementation-plan.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/30_bgng-cli-usage-guide-cards-v1.md, analyses/27_cli_help_gap_analysis.md, cli/index.ts, cli/commands/add/extension.ts, cli/commands/extensions, cli/core/paths.ts, cli/core/user-config.ts, cli/core/mcp-library.ts, cli/core/skill-packages.ts, test/helpers.ts]

---

## Objective

Execute the foundation portion of Harness Cards: finish the M0 CLI surface cut and land M1's store layout, migration command, and store-aware legacy compatibility.

---

## Scope

This document covers:

- **M0:** baseline-sync tests, `bgng extensions add`, removal of `bgng add extension`, architecture/doc lifecycle, status/doctor snapshot baseline.
- **M1:** new store path resolvers, migration algorithm, `bgng store migrate`, `bgng store status`, legacy warning, store-aware loaders.

It does not cover write-records, cards, project-local writes, or diagnostics refactors beyond baseline snapshots.

---

## Entry Checks

Run before editing:

```bash
git status --short --branch
bun test test/commands-search.test.ts test/commands-skills-mutate.test.ts test/commands-init.test.ts
bun run typecheck
```

Expected:

- targeted tests pass
- typecheck passes or only known pre-existing failures are documented before work begins
- no unrelated dirty files are touched

---

## M0 Work Plan

### M0.1 Preserve Current Baseline

Run:

```bash
bun test test/commands-search.test.ts test/commands-skills-mutate.test.ts test/commands-init.test.ts
```

Expected: pass.

If this fails, fix the regression before any command rename work.

### M0.2 Add Diagnostics Snapshot Baseline

The master risk register says M7 must preserve existing `status` and `doctor` output. Add baseline tests now:

```text
test/commands-status.test.ts
test/commands-doctor.test.ts
```

Minimum assertions:

- `bgng status` exits zero on an empty fixture.
- `bgng status --json` emits valid JSON.
- `bgng doctor` exits zero or documented non-zero according to current behavior.
- `bgng doctor --json` emits valid JSON.
- Human output keeps key headings/columns that M7 must preserve.

### M0.3 Move Extension Add Command

Create:

```text
cli/commands/extensions/add.ts
```

Move behavior from:

```text
cli/commands/add/extension.ts
```

Required command path:

```bash
bgng extensions add <name>
```

Old path must be unregistered:

```bash
bgng add extension <name>
```

Expected old-path behavior: unknown command or usage failure with a clear message.

### M0.4 Preserve Payload Shape

`bgng extensions add --json` must preserve the old payload contract from `add extension`:

```json
{
  "kind": "extension",
  "id": "parallel",
  "projectConfigPath": "...",
  "projectChanges": [],
  "next": []
}
```

Do not invent a new JSON shape in M0.

### M0.5 Update CLI Registration

Modify:

```text
cli/index.ts
```

Register:

```ts
ExtensionsAddCommand
```

Stop registering:

```ts
AddExtensionCommand
```

Delete:

```text
cli/commands/add/extension.ts
```

only after tests cover the new and old paths.

### M0.6 Docs And References

Move the superseded architecture draft:

```text
.ai/analyses/26_harness-cards-target-architecture.md
-> .ai/analyses/26_archive/26_harness-cards-target-architecture.md
```

Then run:

```bash
rg "29_harness-cards-target-architecture-v2|BGNG_STORE_ROOT" .ai cli test README.md
```

Expected:

- no active old architecture filename references
- `BGNG_STORE_ROOT` only appears in rejected-option/historical notes

### M0.7 M0 Exit Checks

Run:

```bash
bun test test/commands-search.test.ts test/commands-skills-mutate.test.ts test/commands-init.test.ts
bun test test/commands-status.test.ts test/commands-doctor.test.ts
bun run typecheck
```

---

## M1 Work Plan

### M1.1 Add Store Path Resolvers

Create:

```text
cli/core/store-paths.ts
```

Required resolvers:

- `resolveStoreRoot(agentsDir)`
- `resolveStoreMetadataPath(agentsDir)`
- `resolveMachineConfigPath(agentsDir)`
- `resolveCardsRoot(agentsDir)`
- `resolveCardVersionDir(agentsDir, name, version)`
- `resolveSourcesRoot(agentsDir)`
- `resolveStoreSkillsRoot(agentsDir)`
- `resolveStoreMcpServersDir(agentsDir)`
- `resolveStoreMcpServerFile(agentsDir, serverId)`
- `resolveStoreGeneratedDir(agentsDir)`
- `resolveStoreCacheDir(agentsDir)`
- `resolveGlobalWriteRecordPath(agentsDir)`

Path safety:

- validate card names before using them in paths
- reject `..`, absolute paths, and path separators outside the expected `@scope/name` split
- sanitize MCP server IDs before `<id>.json`

### M1.2 Add Store And Machine Types

Modify:

```text
cli/core/types.ts
```

Add:

```ts
export interface StoreMetadata {
  schemaVersion: 1;
  initAt: string;
}
```

`MachineConfig` should preserve today's `CanonicalConfig` shape and add only:

```ts
authoring?: { scope?: string };
```

No card semantics in M1.

### M1.3 Implement Migration

Create:

```text
cli/core/migration.ts
```

Required behavior:

1. Detect legacy layout when any of these exist and `store.json` does not:
   - `~/.agents/bgng/config.json`
   - `~/.agents/library/`
   - `~/.agents/packages/skills/`
2. Build staging under `~/.agents/bgng.staging-<timestamp>/`.
3. Copy existing `config.json` to `machine.json`; if absent, initialize `machine.json` from packaged defaults.
4. Explode `library/mcp-servers.json` into `mcp-servers/<id>.json`.
5. Move or copy `packages/skills/` to `skills/`, preserving `current` symlinks.
6. Create `store.json`, `cards/`, `sources/`, `cache/`, and `generated/`.
7. Validate staging before activation.
8. Archive old layout before activating staging.
9. Return a structured `MigrationResult`.

Failure must leave either the old layout intact or an archive that can recover it.

### M1.4 Add Store Commands

Create:

```text
cli/commands/store/migrate.ts
cli/commands/store/status.ts
```

Register in:

```text
cli/index.ts
```

Command behavior:

```bash
bgng store status
bgng store status --json
bgng store migrate
bgng store migrate --json
bgng store migrate --yes
bgng store migrate --cleanup-legacy-orphans
```

In M1, `--cleanup-legacy-orphans` may report that cleanup is deferred until M6 if the orphan implementation is not complete yet. Do not silently claim cleanup happened.

### M1.5 Legacy Warning

Add warning near context creation or command entry:

```text
WARNING: pre-cards layout detected. Run `bgng store migrate` to upgrade.
```

Important:

- write warning to stderr only
- never contaminate `--json` stdout
- warning should appear once per command invocation
- no warning when `store.json` exists

### M1.6 Store-aware Loaders

Modify:

```text
cli/core/user-config.ts
cli/core/mcp-library.ts
cli/core/skill-packages.ts
```

M1 compatibility rule:

- prefer new store layout when `store.json` exists
- fall back to legacy paths when legacy layout exists and store does not
- mark fallback branches with comments saying they are removed in M2

Update callers:

- `library defaults *`
- `library add mcp`
- `skills packages add/list/show`
- `mcp list`
- `write`
- `status`
- `doctor`

### M1.7 Tests

Add:

```text
test/core-migration.test.ts
test/commands-store.test.ts
```

Minimum coverage:

- detect legacy layout
- migrate pre-cards fixture to expected post-cards tree
- preserve per-server MCP content exactly
- preserve package-backed skill bundle structure and `current` symlink
- idempotent re-run after success is a no-op or clear "nothing to migrate"
- fault-injected partial failure preserves recoverable state
- store status reports schema/counts
- legacy warning goes to stderr and JSON stdout remains parseable
- existing library/default/status/write commands work against both layouts

### M1 Exit Checks

Run:

```bash
bun test test/core-migration.test.ts test/commands-store.test.ts
bun test
bun run typecheck
```

---

## Known Phase Risks

| Risk | Mitigation |
|---|---|
| Migration damages user state | Stage, validate, archive, then activate. Fault-injection tests required. |
| JSON output corrupted by warnings | stderr-only warning test required. |
| Existing commands bypass new store loaders | M1.6 caller audit plus regression tests on both layouts. |
| M0 rename changes JSON payloads | Preserve old payload shape exactly. |

---

## Handoff Exit Criteria

M1 is handoff-complete when:

- M0 and M1 tests pass.
- `bgng extensions add` is canonical.
- `bgng add extension` is unregistered.
- store migration works on a pre-cards fixture.
- store-aware loaders support both old and new layouts during M1.
- legacy warnings are stderr-only.
- the next executor can begin M2 without reading old path internals except where explicitly marked for removal.
