# Task 14 Completion: CLI Help Gap Fix

**Date:** May 21, 2026

**Task:** `.ai/tasks/14_cli_help_gap_fix_implementation_plan.md`

**Status:** Completed as part of the Harness Cards v1.1 implementation sequence

## Scope

This completion record covers the separate task-14 CLI help-gap plan. The repo has another task-14 plan for Harness Cards; this file is specifically for the CLI help-gap work.

The help-gap work closed the implemented-behavior mismatches that would have made `bgng --help` and command help misleading during the cards-era rollout.

## What Was Completed

### 1. Removed the orphaned search `--project` flag

The old `--project` option on search commands was removed from the command surface because it was not wired into the underlying search implementation.

Validated behavior:

- `bgng search mcp <query> --project` is rejected.
- `bgng search skill <query> --project` is rejected.
- search behavior remains available without the removed option.

Relevant files:

- `cli/commands/search/mcp.ts`
- `cli/commands/search/skill.ts`
- `test/commands-search.test.ts`

### 2. Added JSON parity for skill mutation commands

The skill mutation commands now support machine-readable output:

- `bgng skills curate <name> --json`
- `bgng skills uncurate <name> --json`

This closed the parity gap between human output and automation-friendly command use.

Relevant files:

- `cli/commands/skills/curate.ts`
- `cli/commands/skills/uncurate.ts`
- `test/commands-skills-mutate.test.ts`

### 3. Replaced `bgng add extension` with `bgng extensions add`

The canonical extension-add command is now:

```bash
bgng extensions add <name>
```

The old command path:

```bash
bgng add extension <name>
```

is no longer registered.

The new command preserves the old JSON payload contract while moving the command into the `extensions` namespace.

Relevant files:

- `cli/commands/extensions/add.ts`
- `cli/index.ts`
- `test/commands-add-extension.test.ts`
- `test/commands-extensions.test.ts`

### 4. Updated help text and docs guardrails

The cards-era command surface now exposes help for:

- `bgng card`
- `bgng store`
- `bgng apply`
- `bgng update`
- `bgng extensions add`

Docs and readiness tests were updated so stale pre-cards command examples do not silently return.

Relevant files:

- `test/cli-help-shape.test.ts`
- `test/docs-readiness.test.ts`
- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `docs-astro/src/content/docs/03-cli-reference.md`
- `docs-astro/src/content/docs/06-extensions.md`

## Verification Performed

### Targeted test coverage

The help-gap behavior is covered by focused command tests:

- search rejects removed `--project`
- skill mutation commands accept `--json`
- `extensions add` writes project config and supports JSON output
- old `add extension` command path fails
- help shape tests protect command registration
- docs readiness tests protect against stale CLI examples

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

### Release readiness

```bash
bun run verify:release
```

Result: passed.

## Deviations From Original Plan

The original help-gap plan requested incremental commits and checkpoints. The later user instruction explicitly prohibited new commits or worktrees until full completion, so this work was completed in-place without creating commits.

The analyzer command family remains out of scope. The Harness Cards command family, which the help-gap plan originally marked as designed but unimplemented, was implemented under the Harness Cards task sequence instead.

## Deferred Or Residual Risk

- Not every historical command in the CLI has equally rich long-form `usage.details` and `usage.examples`; the cards-era and highest-risk commands were prioritized.
- Help text is covered by smoke and shape tests, but not by snapshotting every line of every command's rendered help. This is intentional to avoid brittle tests around Clipanion formatting.

