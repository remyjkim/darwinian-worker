# Task 14 Completion: Harness Cards v1.1 Implementation

**Date:** May 21, 2026

**Task:** `.ai/tasks/14_harness-cards-implementation-plan.md`

**Status:** Completed for the implemented local-store Harness Cards v1.1 system

## Scope

Task 14 implemented the Harness Cards system for the `bgng` CLI. The implementation was executed through the phased handoff documents:

- `.ai/tasks/16_harness-cards-phase-m0-m1-foundation-handoff.md`
- `.ai/tasks/17_harness-cards-phase-m2-m3-materialization-safety-handoff.md`
- `.ai/tasks/18_harness-cards-phase-m4-m5-card-lifecycle-handoff.md`
- `.ai/tasks/19_harness-cards-phase-m6-m7-scope-diagnostics-handoff.md`

This completion record is the umbrella summary for the whole Harness Cards implementation. The phase-level completion records contain the more detailed milestone breakdowns.

## What Was Implemented

### 1. Cards-era store

The CLI now uses the cards-era store under:

```text
~/.agents/bgng
```

Implemented store components include:

- `store.json`
- `machine.json`
- `cards/`
- `sources/`
- `skills/`
- `mcp-servers/<id>.json`
- `generated/`
- `cache/`
- `global-write-record.json`

Public commands:

- `bgng store status`
- `bgng store migrate`

### 2. Harness Card authoring and publishing

The card author workflow now supports:

- `bgng card new <name>`
- `bgng card new <name> --scope @me`
- `bgng card new <name> --no-git`
- `bgng card publish <name>`
- `bgng card list`
- `bgng card show <ref>`
- `bgng card diff <before> <after>`
- `bgng card deprecate <ref>`

Published local-store card versions are immutable. Editable sources live under `sources/`, while published versions live under `cards/`.

Implemented core modules include:

- `cli/core/card-manifest.ts`
- `cli/core/card-store.ts`
- `cli/core/card-diff.ts`
- `cli/core/card-lock.ts`
- `cli/core/semver-utils.ts`

### 3. Project card consumption

Projects can now declare card refs in:

```text
<project>/.agents/bgng/config.json
```

and lock exact resolved versions in:

```text
<project>/.agents/bgng/card.lock
```

Implemented consumer commands:

- `bgng apply <refs...>`
- `bgng update`
- `bgng card apply <refs...>`
- `bgng card add <ref>`
- `bgng card pin <ref>`
- `bgng card remove <name>`
- `bgng card detach`
- `bgng card update`
- `bgng card outdated`
- `bgng card status`

The consumer commands update project config and lockfiles. Commands that accept `--write` chain materialization after the project card mutation is preserved.

### 4. Project-local materialization

`bgng write` now respects scope:

- inside a configured project, it writes project-local tool state
- outside a configured project, it writes machine-scope tool state

Project-scope outputs include:

- `<project>/.claude/skills/`
- `<project>/.claude/settings.json`
- `<project>/.codex/skills/`
- `<project>/.codex/config.toml`
- `<project>/.cursor/mcp.json`
- `<project>/.agents/bgng/generated/cursor-mcp.json`
- `<project>/.agents/bgng/write-record.json`

Machine-scope behavior remains available outside projects.

### 5. Write records, cleanup, and drift safety

The implementation added write-record-backed ownership tracking:

- project write record: `<project>/.agents/bgng/write-record.json`
- machine write record: `~/.agents/bgng/global-write-record.json`

Write records are used for:

- idempotency
- safe cleanup of bgng-owned stale paths
- preserving user-owned files and directories
- drift detection for managed fields
- diagnostic reporting

`bgng write` refuses managed-region drift unless `--force` is passed.

### 6. Diagnostics and explainability

Diagnostics now include cards-era sections for:

- store state
- configured cards
- locked card versions
- write-record status
- MCP drift
- stale or missing generated files

Implemented command behavior includes:

- `bgng status --explain`
- `bgng status --why <category>:<name>`
- `bgng doctor --json`

### 7. Documentation and release alignment

The internal and public docs were updated after implementation:

- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `.ai/knowledges/02_per-project-config-guide.md`
- `.ai/knowledges/03_npm-skill-bundles-guide.md`
- `.ai/knowledges/04_homebrew-release-checklist.md`
- `docs-astro/src/content/docs/10-harness-cards.md`
- `docs-astro/src/content/docs/11-store-and-migration.md`

The public docs were deployed to Cloudflare Pages production after the alignment pass.

## Verification Performed

### Full automated suite

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

The release verification covered:

- full test suite
- TypeScript type checking
- hardcoded path scan
- package metadata checks
- documentation presence checks
- package contents checks

### Docs build

```bash
cd docs-astro && bun run build
```

Result: passed, with 13 pages generated.

### Real terminal smoke

The installed `bgng` binary was exercised in a real terminal environment:

- `bgng --version`
- `bgng --help`
- `bgng store status --json`
- `bgng card list --json`
- `bgng status --json`
- `bgng write --dry-run --json`
- `bgng doctor --json`
- `bgng status --explain`

The installed binary reported version `0.1.0` and exposed the card and store command surface.

An isolated mutating smoke test was also run with temporary `HOME`, `AGENTS_HOME_DIR`, and `AGENTS_DIR` values. That smoke created a card source, published it, initialized a project, applied the card, ran `bgng write --json`, and verified:

- card lock was written
- write record was written
- project-local skill materialization existed
- project-local MCP materialization existed
- home-scope tool directories were not touched

## Test Coverage Summary

The test suite covers the Harness Cards system at several levels:

- core manifest validation
- core card lock helpers
- core card diff classification
- store path resolution
- store migration
- write-record validation and atomic save/load
- managed-field canonical hashing
- card author commands
- card consumer commands
- project card materialization
- idempotency across repeated writes
- cleanup of stale bgng-owned paths
- project-vs-machine scope isolation
- drift refusal and `--force`
- diagnostics sections
- `status --explain` and `status --why`
- docs readiness and command-surface drift

Representative scenario tests include:

- first-time user journey
- pre-cards migration journey
- drifted environment journey
- card materialization journey
- cleanup journey
- idempotency journey
- scope isolation journey

## Deviations From The Original Plan

The original plan assumed multiple PRs and commits. The later user instruction explicitly required no worktree and no new commits until full completion, so the implementation was completed in the current workspace without commits.

The implemented system ships the local-store Harness Cards flow. Remote card registry fetching and remote bundle intersection resolution are not active command behavior yet; the docs explicitly call this out rather than presenting it as shipped behavior.

## Deferred Or Residual Risk

- Actual Claude Code, Codex, and Cursor application launches were not performed as a downstream-app acceptance test. The implementation verifies generated files, project-local paths, symlink behavior, and CLI outputs.
- Network-backed remote card registry behavior remains future work.
- The broad full-suite verification is strong, but there is no persisted transcript of every RED phase from the TDD cycle.

## Important Files

### Commands

- `cli/commands/card/`
- `cli/commands/store/`
- `cli/commands/write.ts`
- `cli/commands/status.ts`
- `cli/commands/doctor.ts`
- `cli/index.ts`

### Core modules

- `cli/core/card-manifest.ts`
- `cli/core/card-store.ts`
- `cli/core/card-diff.ts`
- `cli/core/card-lock.ts`
- `cli/core/card-project.ts`
- `cli/core/store-paths.ts`
- `cli/core/write-record.ts`
- `cli/core/managed-fields.ts`
- `cli/core/project-writes.ts`
- `cli/core/diagnostics.ts`

### Tests

- `test/commands-card-author.test.ts`
- `test/commands-card-consumer.test.ts`
- `test/commands-store.test.ts`
- `test/commands-write-drift.test.ts`
- `test/core-card-manifest.test.ts`
- `test/core-card-lock.test.ts`
- `test/core-card-diff.test.ts`
- `test/core-write-record.test.ts`
- `test/core-managed-fields.test.ts`
- `test/scenarios-card-materialization.test.ts`
- `test/scenarios-cleanup.test.ts`
- `test/scenarios-idempotency.test.ts`
- `test/scenarios-scope-isolation.test.ts`
- `test/scenarios-user-journeys.test.ts`

