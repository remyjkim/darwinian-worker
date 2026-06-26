# ABOUTME: TDD plan to make drwn own only the Claude settings.json hook entries it created (merge, not replace).
# ABOUTME: Runs on the post-card-hooks baseline; fixes the --mcp-only hooks-wipe bug in the same stroke.

# Task 54: Claude Hooks Conditional-Ownership Writer — Implementation Plan

**Status**: Implemented in working tree
**Created**: 2026-06-25
**Updated**: 2026-06-25
**Assigned**: Claude + Remy
**Priority**: High (critical path; blocks signal-hook materialization, Task 55)
**Estimated Effort**: 1.5–2 days (P1 ~1d, P2 ~0.5d, P3 ~0.5d)
**Branch**: implemented on `remyjkim/drwn-write-root-and-optional-mcp` after the post-PR #14 baseline
**Dependencies**: none (foundation for Task 55)
**References**: [.ai/analyses/73_session-signal-vs-card-hooks-architecture-decision.md, .ai/analyses/71_session-signal-hooks-pr-review.md, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/sync.ts, cli/core/hook-generator/sync-hooks.ts, cli/core/diagnostics.ts, cli/core/write-record.ts, `test/hooks-collision.test.ts` from `integ/hooks-collision` commit `ff842e0`, test/core-mcp-merge-hooks.test.ts, test/cli-hook-write-e2e.test.ts, test/commands-doctor.test.ts, https://code.claude.com/docs/en/hooks]

---

## Objective

Make `drwn` own **only the Claude `.claude/settings.json` hook matcher entries it created**, rather than the entire `hooks` key. Today `mergeClaudeSettingsText` does `parsed.hooks = options.hooks` (a wholesale replace) or `delete parsed.hooks`, and treats `hooks` as a single drwn-managed field. This:

1. **Silently clobbers** any non-drwn hook entries (user-authored hooks, and — once Task 55 lands — the session-signal hooks) on `drwn write`;
2. **Silently wipes card hooks** on `drwn write --mcp-only` (and on any full write where no card ships hooks), because the MCP step runs with no `hooks` option and hits `delete parsed.hooks` while `syncHooks` never restores them — a pre-existing data-loss bug in PR #14;
3. Makes `doctor` report **spurious `claude:` drift**, because its recompute (`diagnostics.ts:467`) calls the merger with no `hooks` option and `expected` drops the hooks key.

After this task, drwn merges its owned hook entries into the `hooks` key, preserving every foreign entry, with per-entry drift detection and per-entry cleanup-on-card-removal — and all three failure modes above are gone.

This is the "conditional-ownership writer" the signal-hook design (`.ai/tasks/41…` on the session-signal branch) deferred, and the prerequisite for Task 55 (signal materialization). PR #14 is now merged to `origin/main`, so this task should land before Task 55 / PR #15 materializes signal hooks. Do not merge signal materialization while Claude hooks are still whole-key owned.

**Out of scope:** Codex hooks (its `.codex/hooks.json` is whole-file drwn-owned — `kind: "managed-content"` — no merge needed); signal-hook materialization (Task 55); collapsing the two-writes-per-`drwn write` orchestration (kept as-is, made merge-safe).

## Success Criteria

- [x] `mergeClaudeSettingsText(current, servers, { hooks })` **preserves foreign hook entries** (user-authored and signal-shaped events like `UserPromptSubmit`/`PostToolUseFailure`) while inserting/updating drwn's owned entries. Port `test/hooks-collision.test.ts` from `integ/hooks-collision` commit `ff842e0`, then invert the "current broken behavior" assertions into preservation/coexistence assertions.
- [x] **MCP-only path never alters `hooks`.** `drwn write --mcp-only` leaves existing drwn-owned card hooks and foreign hooks intact because the hook writer is not invoked. New regression test.
- [x] **Per-entry drift.** Editing a drwn-*owned* hook entry → `Drift detected` unless `--force`; adding or editing a **foreign** entry under the same event → no drift, entry preserved.
- [x] **Per-entry cleanup.** Removing a card removes only that card's owned hook entries, preserves foreign entries, and drops an event array / the `hooks` key only when it becomes empty of drwn-owned entries AND has no foreign entries.
- [x] **No reorder false-drift.** Reordering hook entry arrays (by the user or Claude) does not trigger drift for unchanged owned entries (identity-keyed, not positional).
- [x] `doctor` reports **no `claude:` drift** on a correctly-synced repo that has hooks present.
- [x] `mcpServers` ownership and its drift behavior are **unchanged** (existing `commands-write-drift` and `sync-mcp` tests still pass).
- [x] `bun test`, `bun run typecheck` green.

## Approach

### Two solutions considered

**Solution A — `_drwn` side-table of owned entries (CHOSEN).** Extend the in-file `_drwn` block with `ownedHooks`: per event, a map of *entry identity → entry hash*. The writer merges by removing only previously-owned entries, splicing in desired entries, and leaving everything else. Per-entry drift compares each owned identity's current hash to the recorded hash. Robust: preservation of foreign entries is a guarantee, not a heuristic; user edits to owned entries are detectable as drift; reordering is immune (identity-keyed).

**Solution B — command-string sentinel (REJECTED, per analysis 73).** Recognize drwn-owned entries by their `command` string (`drwn hook …` / `node …/composer.mjs`) and merge around them, with no side-table. Simpler (no `_drwn` change) but brittle: a user who copies a drwn command, or any change to drwn's emitted command string, breaks ownership; and "did the user edit our entry?" can't be answered cleanly. Rejected.

Because PR #14 is unreleased, there is **no migration**: no real `.claude/settings.json` in the wild carries the old whole-key `_drwn.fieldHashes.hooks`. We replace that representation outright.

### Core data shapes (new)

`cli/core/managed-fields.ts` — extend `DrwnMetaBlock`:

```ts
// event name -> entry identity -> "sha256-..." hash of the canonical entry
export type OwnedHookEntries = Record<string, Record<string, string>>;

export interface DrwnMetaBlock {
  version: 1;
  managedKeys?: string[];                 // stays: ["mcpServers"] (hooks no longer a "field")
  fieldHashes?: Record<string, string>;   // stays: mcpServers only
  ownedHooks?: OwnedHookEntries;          // NEW — replaces the whole-key hooks hash
  lastWriteAt: string;
}

// Stable identity for a drwn-written matcher entry. Entries we emit are a single
// matcher group with a single command hook, so matcher (when present) is unique per
// event; matcher-less events (UserPromptSubmit/Expansion, added in Task 55) key by command.
export function hookEntryIdentity(event: string, entry: ClaudeHookMatcher | ClaudeHookGroup): string {
  if ("matcher" in entry && entry.matcher) return `m:${entry.matcher}`;
  const cmd = entry.hooks[0];
  return `c:${cmd?.command ?? ""}${cmd?.args ? " " + cmd.args.join(" ") : ""}`;
}

export function hookEntryHash(entry: unknown): string {
  return canonicalJsonHash(entry); // reuse existing; object keys sorted, inner array order irrelevant per-entry
}
```

`cli/core/mcp.ts` — make `matcher` optional and widen later (Task 55 adds the prompt events). For Task 54 only the **type seam** is needed so the merge function is generic; no new event keys yet:

```ts
export interface ClaudeHookMatcher { matcher?: string; hooks: ClaudeCommandHook[]; } // matcher now optional
```

### Core algorithm (new helper in `cli/core/mcp.ts`)

```ts
// Merge drwn's desired owned hook entries into `currentHooks`, preserving foreign entries.
// Returns the next hooks object (or undefined if it ends up empty) and the next ownedHooks side-table.
function mergeOwnedHooks(
  currentHooks: Record<string, ClaudeHookMatcher[]> | undefined,
  recordedOwned: OwnedHookEntries,
  desired: ClaudeHooksConfig,          // {} means "drwn owns zero hook entries now" -> pure cleanup
): { hooks: Record<string, ClaudeHookMatcher[]> | undefined; owned: OwnedHookEntries; drift: string[] } {
  const events = new Set([...Object.keys(currentHooks ?? {}), ...Object.keys(desired)]);
  const nextHooks: Record<string, ClaudeHookMatcher[]> = {};
  const nextOwned: OwnedHookEntries = {};
  const drift: string[] = [];

  for (const event of events) {
    const recorded = recordedOwned[event] ?? {};
    const present = currentHooks?.[event] ?? [];
    const desiredEntries = desired[event] ?? [];
    const desiredIds = new Set(desiredEntries.map((e) => hookEntryIdentity(event, e)));

    // Foreign = entries we never owned. Owned-but-present = candidates for drift / replacement.
    const foreign: ClaudeHookMatcher[] = [];
    for (const entry of present) {
      const id = hookEntryIdentity(event, entry);
      if (!(id in recorded)) { foreign.push(entry); continue; }            // never ours -> preserve
      if (hookEntryHash(entry) !== recorded[id] && !desiredIds.has(id)) {  // ours, user-edited, we're dropping it
        drift.push(`${event}/${id}`);                                       // surfaced unless --force
      } else if (hookEntryHash(entry) !== recorded[id]) {
        drift.push(`${event}/${id}`);                                       // ours, user-edited, still desired
      }
      // owned entries are otherwise discarded here; desired re-adds the current ones
    }

    const merged = [...foreign, ...desiredEntries];
    if (merged.length) nextHooks[event] = merged;
    if (desiredEntries.length) {
      nextOwned[event] = Object.fromEntries(desiredEntries.map((e) => [hookEntryIdentity(event, e), hookEntryHash(e)]));
    }
  }
  return { hooks: Object.keys(nextHooks).length ? nextHooks : undefined, owned: nextOwned, drift };
}
```

`mergeClaudeSettingsText` then changes so that **hooks are managed only when `options.hooks !== undefined`** (this single rule fixes the `--mcp-only` wipe and the doctor false-drift):

```ts
export function mergeClaudeSettingsText(currentText, servers, options?: { force?; hooks?: ClaudeHooksConfig }) {
  const parsed = JSON.parse(currentText);
  const meta = readDrwnMetaBlock(parsed);
  // mcpServers: unchanged whole-key ownership (existing behavior, existing tests).
  // ... drift check + replace parsed.mcpServers ...

  let ownedHooks = meta?.ownedHooks;
  if (options?.hooks !== undefined) {                     // ONLY then do we touch hooks
    const { hooks, owned, drift } = mergeOwnedHooks(parsed.hooks, meta?.ownedHooks ?? {}, options.hooks);
    if (drift.length && !options.force) {
      throw new Error(`Drift detected in drwn-owned Claude hook entries: ${drift.join(", ")}. Move your change into .agents/drwn/config.json or rerun drwn write --force to overwrite.`);
    }
    if (hooks) parsed.hooks = hooks; else delete parsed.hooks;
    ownedHooks = Object.keys(owned).length ? owned : undefined;
  }
  // _drwn: managedKeys/fieldHashes for mcpServers as today; carry ownedHooks through buildDrwnMetaBlock.
}
```

### Orchestration change (`cli/core/hook-generator/sync-hooks.ts`, `cli/core/sync.ts`)

- The MCP step (`sync.ts:158`) already passes **no `hooks`** → under the new rule it now leaves `hooks` untouched. The `--mcp-only` wipe is fixed by the core rule alone; **no MCP-path code change** beyond confirming it passes no hooks option.
- `syncHooks` currently early-returns when `policies.length === 0` (`sync-hooks.ts:141`) and never cleans up. Change: when the claude-code runtime is enabled, **always** call the writer with the composed (possibly empty) `ClaudeHooksConfig`, so previously-owned entries get cleaned while foreign entries survive. `writeManagedFile` no-ops on unchanged content, so this never creates spurious writes.

### Doctor (`cli/core/diagnostics.ts`)

The MCP-drift recompute (`:467`) calls `mergeClaudeSettingsText(current, activeServers)` with no `hooks` option → under the new rule it no longer deletes `hooks`, so `expected === current` for the hooks portion and the spurious `claude:` drift disappears with no further change. (Optional, deferred: a dedicated doctor check for drift in drwn-owned hook entries — not required for this task.)

---

## Implementation Plan (TDD)

### Phase P1 — Side-table merge in `mergeClaudeSettingsText` (highest value)

1. **RED**: port `test/hooks-collision.test.ts` from `integ/hooks-collision` commit `ff842e0`, then invert the "broken behavior" tests to assert foreign entries (UserPromptSubmit/Expansion/PostToolUseFailure + a hand-authored user hook) are **preserved** when a card's `.*` hooks are written. Replace the `test.todo("coexistence …")` with an executable coexistence assertion. Add the per-entry-drift and reorder-immunity cases. Run → fails.
2. **GREEN**: add `OwnedHookEntries`, `hookEntryIdentity`, `hookEntryHash` to `managed-fields.ts`; add `mergeOwnedHooks` and the `options.hooks !== undefined` gate to `mcp.ts`; make `ClaudeHookMatcher.matcher` optional; carry `ownedHooks` through `buildDrwnMetaBlock`/`readDrwnMetaBlock`. Run → green.
3. **REFACTOR**: rewrite `test/core-mcp-merge-hooks.test.ts` (3 tests) for the side-table representation (`_drwn.ownedHooks` instead of `fieldHashes.hooks`; removal removes only owned entries; drift is per-entry).

### Phase P2 — Orchestration: cleanup + `--mcp-only` safety

1. **RED**: new tests for the two distinct zero-policy paths:
   - a project with one card hook, then `drwn write --mcp-only`, asserts all existing hook entries survive in `.claude/settings.json` because hooks are out of scope for this mode;
   - remove or exclude the card hook policy, then ordinary `drwn write`, asserts drwn-owned card hook entries are cleaned and co-located foreign entries survive.
2. **GREEN**: change `syncHooks` to always invoke the writer for the claude-code runtime (composed config, empty allowed) instead of early-returning at `policies.length === 0`.
3. Update `test/cli-hook-write-e2e.test.ts` — the `hooks.exclude` test (`:117`) that asserts `settings.hooks === undefined` must assert "no drwn-owned entries remain" while allowing foreign entries.

### Phase P3 — Doctor + regression sweep

1. **RED**: `test/commands-doctor.test.ts` — a synced repo with card hooks present asserts **no** `claude:` drift (today it spuriously reports).
2. **GREEN**: confirm the core `options.hooks` gate resolves it; only adjust diagnostics if a residual asymmetry remains.
3. Full `bun test` + `bun run typecheck`; verify `mcpServers` drift tests (`commands-write-drift`, `sync-mcp`) and Codex managed-content tests are untouched. Update the version-skew note (DRWN_VERSION 0.2.1 vs package.json 0.2.2) if we choose to bump here (hygiene; see analysis 73).

### Phase P4 — Documentation updates (in lockstep with the code, same branch)

The per-entry ownership model supersedes whole-key claims in two existing docs. Edit them to describe the **target state as-is** (per-entry `ownedHooks` side-table), referencing analysis 73 for the decision — do **not** narrate "changed from whole-key" (evergreen-docs rule):

1. `.ai/analyses/60_drwn-card-hooks-target-architecture.md`:
   - "Settings file rendering" (line ~270): drwn owns `mcpServers` as a whole key **and** owns *individual* `hooks` matcher entries via a `_drwn.ownedHooks` side-table (per-entry hash + drift), not a whole-key `fieldHashes.hooks`.
   - File-touch table (lines ~446–447): `managed-fields.ts` gains `ownedHooks` + `hookEntryIdentity`/`hookEntryHash` and per-entry merge/drift — it is **not** "no change".
   - `_drwn` schema-bump risk (line ~420): reframe around `ownedHooks` rather than adding `"hooks"` to `managedKeys`.
   - Optional one-line cross-reference (near the non-tool-use out-of-scope note, lines ~222/411): observational non-tool-use events are handled by the separate signal-hook mechanism (analysis 73 / Task 55).
2. `.ai/knowledges/10_drwn-cli-architecture.md`:
   - `_drwn` block schema (line ~304): add `ownedHooks` to `{ version, managedKeys, fieldHashes, lastWriteAt }`.

## Risks & mitigation

| Risk | Mitigation |
|---|---|
| Identity collision for matcher-less entries (Task 55 events) | Identity keys by command+args when matcher absent; entries drwn emits are single-command. Add a test when Task 55 introduces them. |
| Reordering false-drift | Identity-keyed maps, never positional arrays; explicit reorder test in P1. |
| Two-writes-per-`drwn write` still produces a `.bak` churn | Out of scope to collapse; `writeManagedFile` no-ops on identical content, so churn only on real change. Note for a later cleanup. |
| Hidden assumption that `hooks` is always drwn-owned elsewhere | Agent map (analysis inputs) enumerated all 3 call sites: mcp sync, sync-hooks, diagnostics — all covered above. |
