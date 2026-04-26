# Task 03 Completion: Phase 2 CLI Implementation

**Date:** April 24, 2026

**Task:** `.ai/tasks/03_phase2-cli-implementation-plan.md`

**Status:** Completed

## Scope

Task 03 delivered the first production-ready phase of the `agents` CLI:

- extracted reusable core modules from the original `sync-mcp.ts`
- implemented a Clipanion-based command surface
- preserved `sync-mcp.ts` as a compatibility wrapper
- verified both repo-local and global execution modes

This completion record focuses on Task 03, with Tasks 01 and 02 included only as brief prerequisite context.

## Context

### Task 01: Canonical Registry + Sync

Task 01 established the baseline architecture:

- canonical source files in this repo
- `~/.agents/` as the aggregation layer
- tool-specific sync into Claude, Codex, and Cursor
- a working `sync-mcp.ts` script

### Task 02: Parallel Integration

Task 02 added:

- default CLI-backed Parallel skills
- optional Parallel MCP overlay
- new registry/config shape for `parallel`
- additional tests and documentation

Task 03 builds on both of those foundations.

## What Was Implemented

### 1. Clipanion CLI shell

The repo now contains a Clipanion-based CLI entrypoint:

- [cli/index.ts](/Users/pureicis/dev/agents-config-saam/cli/index.ts)
- [cli/context.ts](/Users/pureicis/dev/agents-config-saam/cli/context.ts)

Package wiring now supports:

- repo-local execution via `bun run agents -- ...`
- global execution via `bun link` and `agents ...`

### 2. Extracted reusable core modules

The original sync logic was broken out into reusable modules under [cli/core](/Users/pureicis/dev/agents-config-saam/cli/core):

- `types.ts`
- `paths.ts`
- `config.ts`
- `registry.ts`
- `mcp.ts`
- `skills.ts`
- `sync.ts`
- `diagnostics.ts`
- `output.ts`

These modules now form the shared implementation layer for both the CLI commands and the legacy wrapper.

### 3. Implemented command surface

The following commands are now implemented:

- `agents skills list`
- `agents skills curate <name>`
- `agents skills uncurate <name>`
- `agents skills sync`
- `agents mcp list`
- `agents mcp sync`
- `agents status`
- `agents doctor`

Command classes live under [cli/commands](/Users/pureicis/dev/agents-config-saam/cli/commands).

### 4. Compatibility preservation

The legacy [sync-mcp.ts](/Users/pureicis/dev/agents-config-saam/sync-mcp.ts) entrypoint remains available and still exports:

- `buildActiveServers`
- `mergeClaudeSettingsText`
- `mergeCodexTomlText`
- `renderCursorConfig`
- `syncRepository`

It now acts as a thin compatibility wrapper over the extracted core modules rather than carrying the full implementation inline.

### 5. Documentation updates

The primary user-facing repo documentation was updated in [README.md](/Users/pureicis/dev/agents-config-saam/README.md) to reflect:

- the new `agents` CLI
- repo-local and global usage
- the relationship between `agents` and `sync-mcp.ts`

## Architecture Outcome

Task 03 successfully shifted the repo from:

- a single-file sync script with ad hoc flags

to:

- a modular CLI architecture with a shared core and an explicit command surface

The canonical model did **not** change:

- repo files remain the source of truth
- `~/.agents/skills` remains the curated publication layer
- tool config and tool skill directories remain derived state

This is important: Task 03 improved the operator interface without replacing the underlying architecture established in Task 01.

## Verification Performed

### Automated tests

The full test suite passed at completion:

- `bun test`
- Result: **51 pass, 0 fail**

This includes:

- path/core extraction tests
- CLI smoke tests
- install-mode/package wiring tests
- command tests for `skills`, `mcp`, `status`, and `doctor`
- compatibility tests for `sync-mcp.ts`
- legacy regression tests for the sync behavior

### Repo-local CLI verification

The following repo-local checks were run successfully:

- `bun run agents -- --help`
- `bun run agents -- skills list --json`
- `bun run agents -- mcp list --json`
- `bun run agents -- status --json`
- `bun run agents -- doctor --json`

### Compatibility verification

The legacy wrapper was revalidated:

- `bun run sync-mcp.ts --dry-run`
- Result: `No changes.`

### Global CLI verification

The package was linked globally and verified:

- `bun link`
- `agents --help`
- `agents skills list --json`
- `agents mcp list --json`
- `agents doctor --json`

Both repo-local and global invocation paths were confirmed to work.

## Deferred / Not Yet Implemented

Task 03 intentionally did **not** implement the full long-term CLI roadmap.

Still deferred:

- `agents mcp add/remove/show/enable/disable`
- `agents skills create/review`
- `agents targets list/add/enable/disable`
- `agents doctor --fix`
- pruning/repair flows beyond report-only defaults
- profiles
- project overrides
- auto-sync watchers
- broader multi-machine orchestration

Those belong to later phases already captured in the architecture and follow-on planning docs.

## Important Files

### Core entrypoints

- [cli/index.ts](/Users/pureicis/dev/agents-config-saam/cli/index.ts)
- [sync-mcp.ts](/Users/pureicis/dev/agents-config-saam/sync-mcp.ts)
- [package.json](/Users/pureicis/dev/agents-config-saam/package.json)

### Core modules

- [cli/core](/Users/pureicis/dev/agents-config-saam/cli/core)

### Commands

- [cli/commands](/Users/pureicis/dev/agents-config-saam/cli/commands)

### Tests

- [test](/Users/pureicis/dev/agents-config-saam/test)

### Planning / architecture references

- [02_phase2-cli-target-architecture-design.md](/Users/pureicis/dev/agents-config-saam/.ai/analyses/02_phase2-cli-target-architecture-design.md)
- [03_phase2-cli-implementation-plan.md](/Users/pureicis/dev/agents-config-saam/.ai/tasks/03_phase2-cli-implementation-plan.md)

## Notes For Next Task

The repo is now in a strong position for the next CLI phase.

Recommended next implementation slice:

1. `agents mcp add/remove/show/enable/disable`
2. `agents skills create/review`
3. `agents targets list/add/enable/disable`
4. `agents doctor --fix`

The key value of Task 03 is that these can now be added incrementally on top of a tested modular base rather than requiring another structural rewrite.
