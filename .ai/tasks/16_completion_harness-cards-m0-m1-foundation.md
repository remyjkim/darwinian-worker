# Task 16 Completion: Harness Cards M0-M1 Foundation

**Date:** May 21, 2026

**Task:** `.ai/tasks/16_harness-cards-phase-m0-m1-foundation-handoff.md`

**Status:** Completed

## Scope

Task 16 covered the foundation slice of Harness Cards:

- M0: CLI surface cleanup and baseline preservation
- M1: cards-era store layout, migration, store status, and store-aware loaders

It intentionally did not cover write-records, card lifecycle commands, project-local writes, or diagnostics explainability beyond baseline protection.

## M0 Completion

### Baseline behavior preserved

The command-surface fixes that existed before Harness Cards were preserved:

- `search mcp --project` is not accepted.
- `search skill --project` is not accepted.
- `skills curate --json` is supported.
- `skills uncurate --json` is supported.
- `init` and other key commands retain useful help details and examples.

### Extension add command moved

The extension-add command was moved to:

```bash
bgng extensions add <name>
```

The old command path was removed:

```bash
bgng add extension <name>
```

The new command preserves the prior JSON output shape for automation.

Relevant files:

- `cli/commands/extensions/add.ts`
- `cli/index.ts`
- `test/commands-add-extension.test.ts`
- `test/commands-extensions.test.ts`

### Diagnostics baseline protected

Status and doctor command tests protect the baseline behavior that later diagnostics work needed to preserve.

Relevant tests:

- `test/commands-status.test.ts`
- `test/commands-doctor.test.ts`

## M1 Completion

### Store path resolvers

The cards-era store resolver module was added:

- `cli/core/store-paths.ts`

It resolves:

- store root
- store metadata path
- machine config path
- card version directories
- source directories
- package-backed skill bundle cache
- exploded MCP server definition files
- generated-file cache
- global write-record path

The implementation validates store-facing names and avoids unsafe path construction.

### Store metadata and machine config

The implementation established `~/.agents/bgng/store.json` and `~/.agents/bgng/machine.json` as the active cards-era store metadata and machine configuration files.

### Explicit migration

The pre-cards layout is migrated through:

```bash
bgng store migrate
```

Migration behavior includes:

- detecting legacy layout
- staging the cards-era store
- preserving legacy data during migration
- moving package-backed skill bundles to `~/.agents/bgng/skills`
- exploding the legacy MCP library into `~/.agents/bgng/mcp-servers/<id>.json`
- writing `store.json`
- supporting JSON output
- reporting no-op status when no legacy layout exists
- supporting cleanup of legacy bgng-owned symlinks through `--cleanup-legacy-orphans`

Relevant files:

- `cli/core/migration.ts`
- `cli/commands/store/migrate.ts`
- `cli/commands/store/status.ts`
- `test/core-migration.test.ts`
- `test/commands-store.test.ts`

### Store-aware loaders

Store-aware behavior was integrated so commands use the cards-era store when `store.json` exists, while migration code can still read legacy inputs explicitly.

## Verification Performed

### Targeted tests

Task 16 behavior is covered by:

- `test/commands-search.test.ts`
- `test/commands-skills-mutate.test.ts`
- `test/commands-init.test.ts`
- `test/commands-add-extension.test.ts`
- `test/commands-extensions.test.ts`
- `test/commands-status.test.ts`
- `test/commands-doctor.test.ts`
- `test/core-migration.test.ts`
- `test/commands-store.test.ts`

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

The handoff expected separate PRs. The later instruction required no new worktree and no commits until full completion, so Task 16 was completed in-place as part of the full Harness Cards pass.

## Deferred Or Residual Risk

No Task 16-specific behavior is known to be incomplete. Later phases own write-record safety, cards, project-local materialization, and diagnostics explainability.

