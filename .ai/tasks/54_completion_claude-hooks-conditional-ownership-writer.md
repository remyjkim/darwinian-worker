# ABOUTME: Completion summary for Task 54, the Claude hook conditional-ownership writer.
# ABOUTME: Records shipped behavior, PR sequencing, tests, and remaining follow-ups.

# Task 54 Completion: Claude Hooks Conditional-Ownership Writer

**Status**: Completed and merged
**Completed**: 2026-06-26
**PR**: [#17 Preserve foreign Claude hook entries](https://github.com/remyjkim/darwinian-harness/pull/17)
**Merge commit**: `dfbb6c8`
**Implementation commit**: `a68f302`
**Base**: `main` after PR #13 and before PR #15 / Task 55
**References**: [.ai/tasks/54_claude-hooks-conditional-ownership-writer-implementation-plan.md, .ai/analyses/73_session-signal-vs-card-hooks-architecture-decision.md, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/hook-generator/sync-hooks.ts, test/hooks-collision.test.ts, test/core-mcp-merge-hooks.test.ts, test/cli-hook-write-e2e.test.ts, test/commands-doctor.test.ts]

## Summary

Task 54 replaced the Claude `.claude/settings.json` hook ownership model from
"drwn owns the whole `hooks` key" to "drwn owns only the hook entries it created."
This removes the collision between card policy hooks, user-authored hooks, and
session-signal hooks. It also fixes the pre-existing data-loss path where
`drwn write --mcp-only` could delete hooks because the MCP writer treated hooks as
a previously managed whole field.

The shipped model keeps `mcpServers` as the existing managed field while moving
hook ownership into a per-entry `_drwn.ownedHooks` side table:

```json
{
  "_drwn": {
    "version": 1,
    "managedKeys": ["mcpServers"],
    "fieldHashes": { "mcpServers": "sha256-..." },
    "ownedHooks": {
      "PreToolUse": {
        "m:.*": "sha256-..."
      }
    },
    "lastWriteAt": "..."
  }
}
```

## What Shipped

### Per-entry hook ownership

- Added `OwnedHookEntries` to `cli/core/managed-fields.ts`.
- Added `hookEntryIdentity`:
  - matcher entries key as `m:<matcher>`, for example `m:.*` or `m:Skill`;
  - matcher-less entries key by command plus args, enabling Task 55 prompt-event hooks.
- Added `hookEntryHash`, using the existing canonical JSON hashing machinery.
- Extended `buildDrwnMetaBlock` so `_drwn` can carry `ownedHooks` in addition to `managedKeys` and `fieldHashes`.

### Claude settings merge behavior

- `mergeClaudeSettingsText` now touches hooks only when `options.hooks !== undefined`.
- Hook merge now:
  - preserves entries that are not present in `_drwn.ownedHooks`;
  - removes only previously owned entries that are no longer desired;
  - re-adds the desired drwn entries;
  - detects drift only on entries that drwn previously owned;
  - remains insensitive to array reordering because ownership is identity-keyed, not positional.
- The drift error is scoped to hook entries:

```text
Drift detected in drwn-owned Claude hook entries: ...
```

### Type widening for future signal events

- Made `ClaudeHookMatcher.matcher` optional.
- Added generic event support to `ClaudeHooksConfig`.
- Added type slots for matcher-less prompt events and Skill failure events so Task 55 could materialize `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, and `PostToolUse` entries without revisiting the writer.

### Hook orchestration safety

- `syncHooks` no longer returns immediately when there are zero active policies.
- Ordinary `drwn write` can now clean previously owned card hook entries when policies become inactive.
- `drwn write --mcp-only` still does not invoke the hook writer, so existing card hooks and foreign hooks remain untouched.
- Zero-policy hook sync skips writing `.claude/settings.json` unless a prior `_drwn.ownedHooks` side table needs cleanup.
- Store writability is asserted only when hook policies actually need composer generation.

### Doctor behavior

- `drwn doctor` no longer reports false Claude MCP drift for a correctly synced project that also has hooks present.
- No separate hook-drift doctor surface was added; hook-entry drift is enforced by the writer path, matching the task scope.

## Files Changed

Production:

- `cli/core/managed-fields.ts`
- `cli/core/mcp.ts`
- `cli/core/hook-generator/sync-hooks.ts`

Tests and task tracking:

- `.ai/tasks/54_claude-hooks-conditional-ownership-writer-implementation-plan.md`
- `test/hooks-collision.test.ts`
- `test/core-mcp-merge-hooks.test.ts`
- `test/cli-hook-write-e2e.test.ts`
- `test/commands-doctor.test.ts`

## Traceability

| Success criterion | Implementation / test evidence |
| --- | --- |
| Preserve foreign hook entries | `test/hooks-collision.test.ts`: coexistence test preserves manual signal-shaped and user hook entries. |
| `--mcp-only` never alters hooks | `test/cli-hook-write-e2e.test.ts`: `drwn write --mcp-only preserves existing Claude hook entries`. |
| Per-entry drift | `test/hooks-collision.test.ts` and `test/core-mcp-merge-hooks.test.ts`: owned-entry edits throw unless forced; foreign edits are preserved. |
| Per-entry cleanup | `test/cli-hook-write-e2e.test.ts`: inactive policies remove only owned card hooks and preserve a foreign entry. |
| Reorder-safe | `test/hooks-collision.test.ts`: reordering hook arrays does not trigger false drift. |
| No false doctor drift | `test/commands-doctor.test.ts`: synced repo with Claude hooks has empty `mcpDrift`. |
| MCP ownership unchanged | Existing `sync-mcp`, `commands-write-drift`, and Codex write-record tests passed in focused regression. |

## Validation

Commands run during implementation and PR preparation:

```bash
bun test test/hooks-collision.test.ts test/core-mcp-merge-hooks.test.ts test/cli-hook-write-e2e.test.ts test/commands-doctor.test.ts test/commands-write-drift.test.ts test/sync-mcp.test.ts test/commands-write-codex-drift.test.ts test/core-write-record-managed-content.test.ts
bun run typecheck
bun test
```

Results:

- Task 54 focused regression on the clean PR branch: **57 pass, 0 fail**.
- Typecheck: clean.
- Full clean-stack suite before PR creation: **891 pass, 1 skip, 0 fail**.
- GitHub PR #17 `Validate` check: success.

Additional bash CLI smoke was run on the final stack and covered:

- default-off signal behavior did not create `.claude/settings.json`;
- opt-in signal hooks materialized correctly after Task 55;
- `drwn write --mcp-only` preserved existing hooks;
- disabling signals cleaned only drwn-owned signal entries.

The bash smoke exercises Task 54's preservation and cleanup behavior through the real
`bun run cli/index.ts` command path against isolated temp homes.

## Sequencing

Task 54 landed before both signal producer and Task 55 materialization work:

1. PR #17 merged Task 54 into `main`.
2. PR #15 merged the signal producer work.
3. PR #18 merged Task 55 materialization on top.

This sequencing matters because Task 55 depends on the writer being able to compose signal entries and card composer entries under the same Claude `hooks` object without whole-key replacement.

## Deviations And Decisions

- No migration was implemented for the old whole-key `fieldHashes.hooks` representation because PR #14 was not released with that model in a user-facing version.
- Hook entries are identified by matcher when present. This is correct for the card composer entries and for Task 55's Skill entries. Matcher-less prompt events use command plus args.
- `drwn doctor` was fixed for false MCP drift, but a dedicated "owned hook entry drift" doctor report remains out of scope.
- The two-write orchestration was not collapsed. The safety fix is in the writer semantics and the zero-policy hook cleanup path.

## Deferred

- Dedicated diagnostics for drwn-owned hook-entry drift, if users need pre-write visibility.
- Backup churn reduction for repeated managed-file writes, if it becomes noisy.
- Any Codex hook merge semantics; Codex hooks remain whole-file managed content.
