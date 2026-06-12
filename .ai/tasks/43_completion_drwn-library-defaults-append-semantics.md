# Task 43 Completion: `drwn library defaults` Append Semantics

**Task**: [43_drwn-library-defaults-append-semantics-implementation-plan.md](./43_drwn-library-defaults-append-semantics-implementation-plan.md)
**Completed**: 2026-06-12
**Status**: Implemented and focused-tested; full-suite/typecheck blocked by unrelated hook/card-lock worktree state
**Commit Status**: No commits made
**Worktree Status**: Existing dirty worktree with unrelated hook/card changes; Task 43 changes are scoped to defaults semantics, tests, and docs
**Current Branch**: `main`
**Base HEAD Observed**: `a6d3279`

---

## Executive Summary

Task 43 is implemented. `drwn library defaults add|remove skill|mcp` no longer turns an uninitialized defaults list into a destructive one-item allowlist.

The fix has two parts:

1. Empty defaults arrays are treated as uninitialized, not explicit overrides.
2. The four library-default mutation commands seed the persisted raw config with the currently resolved defaults before adding or removing an item.

This preserves the user's effective active set on first mutation while keeping non-empty arrays as deliberate explicit allowlists.

---

## Problem Solved

Before this change, a cards-era `~/.agents/drwn/machine.json` like this:

```json
{
  "version": 1,
  "optional": {}
}
```

could be mutated by:

```bash
drwn library defaults add mcp parallel-search
```

into:

```json
{
  "defaults": {
    "mcpServers": ["parallel-search"]
  }
}
```

Because `defaults.mcpServers` was treated as an explicit allowlist whenever the array existed, that dropped any previously resolved defaults such as `context7`. The same pattern affected skills and empty-array recovery.

After this task, the same first mutation seeds with resolved defaults first:

```json
{
  "defaults": {
    "mcpServers": ["context7", "parallel-search"]
  }
}
```

In this repo's standard fixture, `context7` is the resolved baseline MCP default. Real packaged defaults may include a different resolved set depending on registry contents and machine toggles.

---

## What Shipped

### Explicit-Default Predicates

Added central predicates in `cli/core/defaults.ts`:

- `hasExplicitMcpDefaults(config)`
- `hasExplicitSkillDefaults(config)`

Both return `true` only for non-empty arrays. Missing, `undefined`, and `[]` all mean "uninitialized."

### Default Seeding Helpers

Added mutation helpers in `cli/core/defaults.ts`:

- `ensureMcpDefaultsInitialized(config, seedNames)`
- `ensureSkillDefaultsInitialized(config, seedNames)`

The helpers deliberately take already-resolved seed names. This avoids the key implementation trap in the plan: raw `machine.json` does not contain packaged fallback state. MCP commands compute the seed from `loadEffectiveConfig(...)` plus the merged built-in/user MCP registry, then write that resolved list into raw `machine.json`.

### Core Resolution Semantics

Updated the main resolution branches to use the explicit-default predicates:

- `resolveDefaultMcpNames`
- `resolveDefaultSkillNames`
- `applyMcpDefaultsToConfig`
- `buildActiveServers`
- `buildEffectiveState` skill selection
- doctor stale-skill override selection
- first-run user config initialization

Effect:

- `defaults.mcpServers: []` resolves like the field is absent.
- `defaults.skills: []` resolves like the field is absent.
- non-empty arrays still act as explicit allowlists.

### Command Mutations

Updated:

- `cli/commands/library/defaults/add-mcp.ts`
- `cli/commands/library/defaults/remove-mcp.ts`
- `cli/commands/library/defaults/add-skill.ts`
- `cli/commands/library/defaults/remove-skill.ts`

Behavior:

- Uninitialized MCP defaults seed from the current effective `resolveDefaultMcpNames(...)` result, including packaged defaults and machine toggles.
- Uninitialized skill defaults seed from current curated skill names.
- Non-empty explicit lists remain unchanged except for the requested add/remove.
- Existing command output shape and action labels are preserved.

### Documentation

Updated:

- `docs-docusaurus/docs/reference/cli/library.md`
- `docs-docusaurus/docs/reference/schemas/machine-json.md`

Documented contract:

- A non-empty defaults array is an explicit machine allowlist.
- A missing field or empty array is uninitialized.
- First `add`/`remove` against an uninitialized list seeds before mutation.

---

## Tests Added / Updated

### Unit-Level Defaults Coverage

Updated `test/core-defaults.test.ts` with coverage for:

- explicit-default predicates
- empty MCP defaults falling back to absent-field semantics
- `buildActiveServers` equivalence for absent vs empty `defaults.mcpServers`
- ensure helpers seeding empty lists and preserving non-empty explicit lists

### Store-Layout Command Regression Coverage

Updated `test/commands-library-defaults.test.ts` with store-layout tests that explicitly create:

```text
~/.agents/drwn/store.json
~/.agents/drwn/machine.json
```

These tests cover the actual bug path instead of the legacy `~/.agents/drwn/config.json` path:

- add MCP against no `defaults.mcpServers`
- add MCP against `defaults.mcpServers: []`
- add skill against no `defaults.skills`
- empty skill and MCP arrays resolving like absent defaults

### Safety Regression

Re-ran `test/commands-add-mcp.test.ts` after briefly testing a broader command-layer adjustment. That adjustment was intentionally reverted because `drwn add mcp` has an existing contract: fallback registry activity does not prevent project-local toggles, while explicit global defaults still do.

---

## Verification

Focused verification is clean:

```bash
bun test test/core-defaults.test.ts test/commands-library-defaults.test.ts test/commands-add-mcp.test.ts
```

Result:

```text
25 pass
0 fail
79 expect() calls
```

Full test suite was run:

```bash
bun test
```

Result:

```text
748 pass
1 skip
3 fail
2759 expect() calls
```

The remaining failures are outside Task 43 and come from the existing hook/card-lock worktree state:

- `test/core-diagnostics-sections.test.ts` — v3 card lock requires `hooks`.
- `test/core-card-store-git.test.ts` — expected lockfile v2, received v3.
- `test/commands-install.test.ts` — v3 card lock requires `hooks`.

Typecheck was run:

```bash
bun run typecheck
```

It remains blocked by unrelated hook/card-lock type errors:

- `cli/core/card-source.ts` and `cli/core/hook-generator/bundle-composer.ts` use `BuildConfig.write`.
- test card-lock fixture entries are missing required `hooks`.
- `test/core-write-record-managed-content.test.ts` has an unrelated `toContain` overload issue.

No Task 43 defaults files were reported by typecheck.

---

## Deltas From the Plan

1. **Seed helper signature changed.** The plan proposed `ensureMcpDefaultsInitialized(config, registry)`. The implementation uses `ensureMcpDefaultsInitialized(config, seedNames)` because seeding must come from the effective merged config, not raw `machine.json`.

2. **Tests use fixture-local expected names.** The plan used real packaged default examples like `chrome-devtools`, `notion`, and `slack`. The implemented tests use the standard fixture registry, where `context7` is the resolved baseline and `parallel-search` is the added server.

3. **No separate `test/defaults-init.test.ts`.** The helper/predicate tests were added to the existing `test/core-defaults.test.ts` to keep default-resolution coverage consolidated.

4. **`drwn add mcp` was left unchanged.** A broader active-server check was tried and then reverted because it changed existing project-add semantics. Task 43 is correctly scoped to library defaults and core empty-array behavior.

5. **No completion commit hash.** No commit was made in this working session, so there is no final merge/commit hash to record.

---

## Files Modified For Task 43

Code:

- `cli/core/defaults.ts`
- `cli/core/mcp.ts`
- `cli/core/effective-state.ts`
- `cli/core/diagnostics.ts`
- `cli/core/user-config.ts`
- `cli/commands/library/defaults/add-mcp.ts`
- `cli/commands/library/defaults/remove-mcp.ts`
- `cli/commands/library/defaults/add-skill.ts`
- `cli/commands/library/defaults/remove-skill.ts`

Tests:

- `test/core-defaults.test.ts`
- `test/commands-library-defaults.test.ts`

Docs:

- `docs-docusaurus/docs/reference/cli/library.md`
- `docs-docusaurus/docs/reference/schemas/machine-json.md`

Completion:

- `.ai/tasks/43_completion_drwn-library-defaults-append-semantics.md`

---

## Acceptance Criteria Final Read

- [x] First add against absent `defaults.mcpServers` preserves resolved defaults and appends the new MCP.
- [x] First add against `defaults.mcpServers: []` preserves resolved defaults and appends the new MCP.
- [x] Non-empty `defaults.mcpServers` remains an explicit allowlist.
- [x] Skill add against absent `defaults.skills` preserves curated defaults and appends the new skill.
- [x] Empty arrays self-heal on read for MCP and skill defaults.
- [x] Focused automated tests pass.
- [x] Docs describe empty-array and non-empty allowlist semantics.
- [ ] Full `bun test` clean. Blocked by unrelated hook/card-lock failures in current worktree.
- [ ] `bun run typecheck` clean. Blocked by unrelated hook/card-lock type errors in current worktree.

---

## Follow-Ups

1. Resolve the existing hook/card-lock v3 fixture failures so full-suite and typecheck can return to clean.
2. Consider adding `drwn library defaults reset skill|mcp` later if users with already-truncated non-empty arrays need a discoverable recovery command. This task intentionally only auto-heals missing or empty arrays because non-empty arrays can be deliberate explicit allowlists.
