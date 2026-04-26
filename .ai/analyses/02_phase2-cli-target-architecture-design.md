# Phase 2 CLI Target Architecture Design

**Date:** April 23, 2026

**Status:** Approved

**Scope:** Define the target architecture and rollout strategy for the `agents` CLI, covering Phase 2 and the immediate follow-on phases needed to turn the current sync script into a durable command-line interface for MCP, skills, targets, diagnostics, and future growth.

## Goal

Build a production-worthy `agents` CLI that becomes the primary operator interface for this repository while preserving the current canonical model:

- repo files are the source of truth
- `~/.agents/skills` is the curated publication layer
- tool directories and tool config files are derived state

The CLI must work both repo-locally and as a globally installed command from day one.

## Current State

The repository already has a functioning Phase 1 sync engine:

- canonical files:
  - `mcp-servers.json`
  - `config.json`
  - `skills/shared/`, `skills/claude-only/`, `skills/codex-only/`, `skills/experimental/`
- a working sync implementation in `sync-mcp.ts`
- tests in `test/sync-mcp.test.ts`
- a curated symlink model through `~/.agents/skills`
- tool-facing sync into:
  - `~/.claude/skills`
  - `~/.codex/skills`
  - `~/.claude/settings.json`
  - `~/.codex/config.toml`
  - `~/.cursor/mcp.json`

What is missing is not the underlying model but the operator surface. The current sync engine is a single-file workflow with ad hoc flags. The architecture document already envisions a Phase 2 `agents` CLI, but that CLI does not yet exist.

## Design Decision

The approved approach is a **modular application CLI with reusable domain modules**.

This means:

- extract the current sync logic into reusable modules
- build Clipanion-based commands on top of those modules
- keep `sync-mcp.ts` as a thin compatibility wrapper
- treat the CLI as the primary surface without introducing a second implementation path

This approach is preferred over a thin wrapper because the current architecture needs durable support for:

- dual-mode execution
- structured command output
- skills curation workflows
- target management
- diagnostics and drift detection
- future extensions like profiles and project overrides

## Framework Choice

The CLI should be implemented with **Clipanion**, using the knowledge source:

- `/Users/pureicis/dev/carto/frontend_v1/.ai/knowledges/29_clipanion_manual.md`

Clipanion is a good fit because it supports:

- nested commands via `static paths`
- explicit `usage` metadata
- strong command structure
- clean error semantics through `UsageError`
- contexts and composability
- machine-friendly CLI behavior

The CLI should follow the patterns from the manual:

- explicit command registration
- command classes with `static paths`
- `static usage` for every public command
- thin command files with logic delegated to reusable core modules
- `Cli.runExit(...)` entrypoint behavior

## Target Command Surface

### Top-level groups

The target top-level surface is:

1. `agents mcp ...`
2. `agents skills ...`
3. `agents targets ...`
4. `agents doctor`
5. `agents status`

### Phase 2 required commands

These are the first commands that should become real:

#### Skills

1. `agents skills list`
2. `agents skills curate <name>`
3. `agents skills uncurate <name>`
4. `agents skills sync`

#### MCP

5. `agents mcp list`
6. `agents mcp sync`

#### General

7. `agents status`
8. `agents doctor`

### Phase 2.5 / Phase 3 planned commands

These should be designed now and planned for, even if implemented later:

#### MCP management

1. `agents mcp add <name>`
2. `agents mcp remove <name>`
3. `agents mcp enable <name>`
4. `agents mcp disable <name>`
5. `agents mcp show <name>`

#### Skills management

6. `agents skills create <name>`
7. `agents skills review <name>`

#### Targets management

8. `agents targets list`
9. `agents targets add <name>`
10. `agents targets enable <name>`
11. `agents targets disable <name>`

#### Diagnostics and repair

12. `agents doctor --fix`
13. future prune-specific commands if repair needs to be split further

## Safety Policy

The CLI must be **safe by default**.

Approved safety rules:

- commands should report stale state, drift, and broken symlinks by default
- normal sync commands must not perform destructive cleanup silently
- repair, prune, and mutation beyond the normal sync contract must require explicit flags or explicit commands

Examples:

- `agents skills sync`
  - syncs desired state
  - reports stale tool links
  - does not prune them by default
- `agents doctor`
  - reports drift
  - does not repair by default
- future `agents doctor --fix`
  - may repair known safe issues explicitly

This policy matches the current repo philosophy and avoids surprising deletions.

## Dual-Mode Execution

The CLI must support two invocation modes from day one:

### Repo-local mode

Used during active repo development and CI-style execution:

- `bun run cli/index.ts ...`
- or a package script like `bun run agents -- ...`

### Global mode

Used as the steady-state operator interface on the machine:

- installed with `bun link`
- invoked as:

```bash
agents ...
```

These two modes must execute the same code paths. There should be no feature mismatch between local and global operation.

## Architecture

### Command layer

The command layer should be thin and Clipanion-native:

```text
cli/
  index.ts
  context.ts
  commands/
    mcp/
      list.ts
      sync.ts
      add.ts
      remove.ts
      enable.ts
      disable.ts
      show.ts
    skills/
      list.ts
      curate.ts
      uncurate.ts
      sync.ts
      create.ts
      review.ts
    targets/
      list.ts
      add.ts
      enable.ts
      disable.ts
    doctor.ts
    status.ts
```

Responsibilities of command files:

- define Clipanion paths
- define options and usage
- call core functions
- render human or JSON output
- translate user mistakes into `UsageError`

Command files should **not** contain direct filesystem orchestration logic beyond trivial argument handling.

### Core layer

The core layer should contain reusable modules with no Clipanion dependency:

```text
cli/core/
  config.ts
  registry.ts
  paths.ts
  mcp.ts
  skills.ts
  sync.ts
  diagnostics.ts
  targets.ts
  output.ts
  errors.ts
```

Suggested responsibilities:

- `paths.ts`
  - resolve repo root, home dir, aggregation dir, target paths
- `config.ts`
  - read/write `config.json`
  - config schema helpers
- `registry.ts`
  - read/write `mcp-servers.json`
  - server lookup and mutation helpers
- `skills.ts`
  - list repo skills by scope
  - list curated skills
  - curate/uncurate helpers
  - desired-state computation
- `mcp.ts`
  - active server filtering
  - target-ready server rendering helpers
- `sync.ts`
  - skill sync orchestration
  - MCP sync orchestration
  - report generation
- `diagnostics.ts`
  - stale symlink detection
  - drift detection
  - broken-path detection
  - future repair recommendations
- `targets.ts`
  - target enumeration
  - enable/disable/add helpers
- `output.ts`
  - human-readable table formatting
  - JSON output helpers
- `errors.ts`
  - stable domain error classes and user-facing translations

### Compatibility wrapper

`sync-mcp.ts` should remain, but only as a thin wrapper around `cli/core/sync`.

This allows:

- zero breakage for current users and scripts
- incremental migration of docs and habits to `agents ...`
- one source of behavior instead of a duplicated CLI and script implementation

## Data Model

The existing canonical model stays intact.

### Source of truth

- `mcp-servers.json`
- `config.json`
- repo skill directories

### Published subset

- `~/.agents/skills`

### Derived state

- `~/.claude/skills`
- `~/.codex/skills`
- target MCP configs

The CLI must respect this layering. It should not bypass the curated layer for shared skills.

## Command Semantics

### `agents skills list`

Must show:

- all repo skills
- their scope (`shared`, `claude-only`, `codex-only`, `experimental`)
- whether they are curated
- whether they are currently linked into Claude and/or Codex

It should support:

- human-readable table output
- `--json`

### `agents skills curate <name>`

Must:

- validate the skill exists
- validate that the scope is appropriate for curation into `~/.agents/skills`
- create the curated symlink
- not auto-sync downstream unless an explicit flag or a separate command is used

### `agents skills uncurate <name>`

Must:

- remove the curated symlink from `~/.agents/skills`
- not auto-delete downstream tool links by default
- report that downstream state may still need sync or manual cleanup

### `agents skills sync`

Must:

- compute desired downstream skill state from the curated layer plus tool-specific scopes
- apply missing symlinks
- report stale downstream symlinks without pruning by default

### `agents mcp list`

Must show:

- canonical server names
- transport
- whether active or inactive
- which targets are enabled
- whether the server is excluded by mode rules such as `parallel.mcp.enabled`

### `agents mcp sync`

Must:

- apply canonical active MCP state to enabled targets
- preserve the current non-destructive target behavior
- support `--target=<name>` and `--dry-run`

### `agents status`

Must provide a concise system overview:

- repo root
- aggregation layer
- enabled targets
- curated skill count
- active MCP server count
- whether tool config files are linked / present as expected

### `agents doctor`

Must report:

- broken symlinks
- stale downstream skill symlinks
- MCP drift between current tool files and canonical rendered output
- missing generated files
- missing repo / aggregation link assumptions

It must be report-only by default.

## Error Handling

Use Clipanion `UsageError` for:

- invalid command usage
- missing required command arguments
- attempting to curate a nonexistent skill
- trying to add invalid target definitions
- unsupported operations in the current repo state

Use ordinary thrown errors for:

- unexpected internal failures
- parse errors that indicate corruption
- filesystem states that violate invariants unexpectedly

Commands should standardize on:

- meaningful exit codes
- human-readable errors to stderr
- machine-readable JSON output on success when `--json` is requested

## Rollout Strategy

### Phase 2

1. extract the existing sync engine into core modules
2. implement Clipanion shell and registration
3. implement:
   - `skills list/curate/uncurate/sync`
   - `mcp list/sync`
   - `status`
   - `doctor`
4. keep `sync-mcp.ts` working as a compatibility wrapper
5. add repo-local and global invocation support

### Phase 2.5

6. implement MCP mutation commands
7. implement skill creation/review helpers
8. implement target management commands

### Phase 3+

9. add repair flows such as `doctor --fix`
10. add pruning commands if needed
11. add profiles
12. add project overrides
13. add richer environment and health diagnostics

## Testing Strategy

### Unit tests

Add unit coverage for:

- path resolution
- config loading and mutation
- registry loading and mutation
- active-server filtering
- skills scope listing
- curated-layer state helpers
- stale link detection
- drift calculation

### Command tests

Add command-level tests for:

- Clipanion parsing
- command paths
- help output registration
- `--json` output
- exit codes
- `UsageError` behavior

### Integration tests

Add integration tests for:

- `agents skills curate` + `agents skills sync`
- `agents skills uncurate` + stale reporting
- `agents mcp sync`
- `agents doctor`
- compatibility behavior through `sync-mcp.ts`

### Real-machine verification

Explicitly verify:

- repo-local invocation works
- global `bun link` invocation works
- no regression in current sync behavior
- stale state is reported, not pruned, by default

## Migration Principles

The implementation should avoid a “big bang” rewrite.

Rules:

- extract behavior before redesigning everything
- preserve today’s working sync semantics unless intentionally changed
- keep old entrypoints alive until the new CLI is proven
- use the CLI to make state easier to manage, not to replace the core model

## Non-Goals For Initial Implementation

The first CLI slice should not attempt to solve:

- profiles
- project overrides
- auto-sync watchers
- hidden destructive repair behavior
- remote sync/multi-machine orchestration
- interactive TUI workflows

## Handoff Summary

A future implementer should treat this Phase 2 effort as a disciplined modularization and command-surface project, not as a rewrite of the underlying configuration model.

The target state is:

- Clipanion-powered `agents` CLI
- dual-mode execution from day one
- reusable core modules
- `sync-mcp.ts` retained as compatibility wrapper
- safe-by-default operations
- a clear runway into Phase 2.5 and Phase 3 features without structural churn
