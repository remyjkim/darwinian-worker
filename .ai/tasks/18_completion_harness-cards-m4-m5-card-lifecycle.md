# Task 18 Completion: Harness Cards M4-M5 Card Lifecycle

**Date:** May 21, 2026

**Task:** `.ai/tasks/18_harness-cards-phase-m4-m5-card-lifecycle-handoff.md`

**Status:** Completed for local-store card lifecycle behavior

## Scope

Task 18 implemented the Harness Card lifecycle:

- M4: card schema, manifest validation, lockfile helpers, diff classification, authoring, publishing, and inspection
- M5: project card consumption, lockfile updates, project mutations, aliases, card status, and write chaining

This task made cards usable by projects. Project-local materialization scope and diagnostics explainability were completed in Task 19.

## M4 Completion

### Semver helpers

Semver handling is isolated through:

- `cli/core/semver-utils.ts`

Card and resolver code use this wrapper rather than importing `semver` directly across the codebase.

### Card manifest validation

Card manifests are validated by:

- `cli/core/card-manifest.ts`

Validation covers:

- object shape
- card names
- strict semver versions
- harness minimum version shape
- bundle semver ranges
- skill include arrays
- rejected card-level `skills.exclude`
- server, extension, and target maps
- supported target keys
- unsafe paths and traversal attempts

Relevant test:

- `test/core-card-manifest.test.ts`

### Card lock helpers

Project lockfile helpers are implemented in:

- `cli/core/card-lock.ts`

They support load, validation, save, and project lockfile path resolution.

Relevant test:

- `test/core-card-lock.test.ts`

### Card diff classification

Card diff behavior is implemented in:

- `cli/core/card-diff.ts`

It classifies structural changes and provides version-bump guidance for card authors.

Relevant test:

- `test/core-card-diff.test.ts`

### Authoring and publishing commands

Implemented author commands:

- `bgng card new <name>`
- `bgng card new <name> --scope @me`
- `bgng card new <name> --no-git`
- `bgng card publish <name>`
- `bgng card diff <before> <after>`
- `bgng card deprecate <ref>`
- `bgng card list`
- `bgng card show <ref>`

The implementation covers:

- scriptable unscoped authoring through `--scope`
- failure for unscoped non-interactive names without a scope
- immutable published versions
- package contract mismatch rejection
- source and published version inspection
- JSON output on inspection commands

Relevant test:

- `test/commands-card-author.test.ts`

## M5 Completion

### Project config cards field

Project config now supports:

```json
{
  "version": 1,
  "cards": ["@me/backend@^1.0.0"]
}
```

Configured refs are resolved into:

```text
<project>/.agents/bgng/card.lock
```

### Card consumer commands

Implemented project commands:

- `bgng card apply <refs...>`
- `bgng card add <ref>`
- `bgng card pin <ref>`
- `bgng card remove <name>`
- `bgng card detach`
- `bgng card update`
- `bgng card outdated`
- `bgng card status`

Top-level aliases:

- `bgng apply <refs...>`
- `bgng update`

The command behavior covers:

- replacing all project card refs
- adding one card ref
- rejecting duplicate cards
- pinning a card to an exact ref
- removing one card
- detaching all cards
- refreshing the lockfile
- reporting outdated local-store versions
- checking outdated status for automation
- chaining materialization with `--write`

Relevant test:

- `test/commands-card-consumer.test.ts`

### Effective-state integration

Cards now contribute to effective state for project writes. Card-provided skills and MCP server definitions are merged with built-in defaults, user library data, and project overlay state.

Relevant files:

- `cli/core/card-project.ts`
- `cli/core/project.ts`
- `cli/core/config.ts`
- `cli/core/mcp-library.ts`
- `cli/core/sync.ts`

Relevant tests:

- `test/core-effective-state.test.ts`
- `test/scenarios-card-materialization.test.ts`

## Verification Performed

### Targeted tests

Task 18 behavior is covered by:

- `test/core-card-manifest.test.ts`
- `test/core-card-lock.test.ts`
- `test/core-card-diff.test.ts`
- `test/commands-card-author.test.ts`
- `test/commands-card-consumer.test.ts`
- `test/core-effective-state.test.ts`
- `test/scenarios-card-materialization.test.ts`

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

The local-store card lifecycle shipped. Remote card registry fetching and remote bundle intersection resolution are not active command behavior in this implementation.

The handoff expected individual PR boundaries. The later instruction required a single uninterrupted completion pass without new worktrees or commits.

## Deferred Or Residual Risk

- Network-backed card resolution remains future work.
- Bundle intersection conflict resolution is not active behavior until remote/package-backed card resolution is implemented.
- The local author/publish/apply/update chain is covered; external registry publishing is not.

