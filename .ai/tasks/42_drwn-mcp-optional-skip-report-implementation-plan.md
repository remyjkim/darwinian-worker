# Task 42: Surface Skipped Optional MCPs During Card Install + Write

**Status**: Planning
**Created**: 2026-06-11
**Updated**: 2026-06-11
**Priority**: Medium (UX trap; discoverability bug, not data loss)
**Dependencies**: None (works against current `main`)
**References**: [GitHub issue remyjkim/darwinian-harness#10, cli/core/mcp.ts, cli/core/effective-state.ts, cli/core/output.ts, cli/core/sync.ts, cli/commands/write.ts, cli/commands/card/add.ts, cli/commands/card/apply.ts, cli/commands/card/project-command.ts, registry/mcp-servers.json, registry/config.json, test/commands-write.test.ts, test/commands-card-consumer.test.ts]

---

## Objective

When a user installs a card whose manifest declares an optional MCP server (`servers.<name>.optional: true`), drwn currently filters that server out of the active set without saying anything. The user has no signal during `drwn card add/apply --write` or `drwn write` that an MCP they might have expected from the card is being skipped — they have to manually diff `card.lock` against the rendered MCP configs to notice.

Goal state: every command that materializes a card's MCP configuration prints a per-card breakdown of optional MCP servers, indicating active vs. skipped status and the exact opt-in command for each skipped server.

This is purely a *surfacing* fix. The filter policy itself stays untouched.

## Success Criteria

- [ ] `drwn write` (default flow) appends an "Optional MCP servers from cards" section to its stdout when at least one locked card declares one or more optional MCPs.
- [ ] `drwn write --dry-run` prints the same section (it's a pure derivation, not a side effect).
- [ ] `drwn write --json` adds an `optionalMcpReport` field to the existing JSON envelope; field is `null` when no locked cards exist or no cards declare optional MCPs.
- [ ] `drwn card add <spec> --write` and `drwn card apply <specs> --write` print the same section after their existing `renderCardMutation` + chained-write output.
- [ ] When zero locked cards declare optional MCPs, no section is printed (no empty "Optional MCP servers from cards:" header).
- [ ] When run inside a project, skipped entries show `drwn add mcp <name>` as the opt-in command. When run without a project (machine scope only), they show `drwn library defaults add mcp <name>` (assumes #11 also lands; otherwise show a doc URL).
- [ ] All existing tests in `test/commands-write.test.ts` and `test/commands-card-consumer.test.ts` stay green.
- [ ] New unit tests cover: (a) `computeOptionalMcpReport` against 4+ scenarios; (b) `renderOptionalMcpReport` formatting; (c) end-to-end stdout assertions on `drwn write` and `drwn card apply --write` with a fixture card declaring optional MCPs.
- [ ] `bun test` clean, `bun run typecheck` clean, no new npm dependencies.

## Strategy Selection

Two viable strategies considered:

**Strategy A — Pure-function reporter, command-level rendering.** Add `computeOptionalMcpReport(state)` in `cli/core/mcp.ts` (or new `mcp-report.ts`). It returns a structured value derived from `state.lockedCards` and `state.activeServers`. Each command calls it after `syncRepository` and renders via a new `renderOptionalMcpReport` helper in `cli/core/output.ts`. JSON path includes the structure under a new field.

- **Pros:** Pure derivation, no I/O. Easy to test in isolation. JSON shape stable across commands. Each command stays in control of its own output.
- **Cons:** Three call sites (`write.ts`, `card/add.ts`, `card/apply.ts`) need parallel changes. Mitigation: chained `--write` flows already share `runChainedWrite`, so most wiring centralizes there.

**Strategy B — Inline into `renderSyncResult`.** Extend `SyncResult` with an `optionalMcpReport` field, populate it inside `syncRepository`, and let `renderSyncResult` render it as a third section after Changes and Warnings.

- **Pros:** Single change site for rendering. All commands that already print sync results inherit the new section for free.
- **Cons:** Couples a logically-distinct concept (card-level reporting) to the sync-result envelope (which today is changes/warnings of *materialization*). Future readers will wonder why a sync result tracks card optional-MCP state. Also harder to omit from commands where the report doesn't make sense (`drwn write --skills-only`).

**Decision: Strategy A.** Keeps concerns separate; the cost (three call sites) is small because `runChainedWrite` consolidates two of them.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ drwn write / card add --write / card apply --write  │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────┐   ┌─────────────────────────────────┐
│ syncRepository() │──▶│ SyncResult { changes, warnings }│
└──────────────────┘   └─────────────────────────────────┘
     │
     ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│ buildEffectiveState()    │──▶│ state.lockedCards        │
│ (already called inside   │   │ state.activeServers      │
│  syncRepository — expose │   │ state.projectConfigPath  │
│  via return value)       │   └──────────────────────────┘
└──────────────────────────┘                │
     │                                       │
     │  (NEW: re-call or expose from result)│
     ▼                                       ▼
┌────────────────────────────────────────────────────────┐
│ computeOptionalMcpReport(state) → OptionalMcpReport    │
└────────┬───────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ renderOptionalMcpReport(report) / JSON field            │
└─────────────────────────────────────────────────────────┘
```

`buildEffectiveState` is called inside `syncRepository` today but the result is not returned. Two ways to access it from the command:

- **Option 1:** Call `buildEffectiveState(options)` a second time from the command. Cheap (no network), but duplicates work and could observe a different state if a write happened in between (unlikely in normal flow but real for `--dry-run` interleaving).
- **Option 2:** Extend `SyncResult` with `effectiveState: EffectiveState` (or a narrowed `OptionalReportInputs`) so the command gets the exact same state that drove the materialization.

**Decision: Option 2.** Extending `SyncResult` is a small additive change and avoids re-derivation. Add the field as `optional` so existing consumers don't break.

## Implementation Plan

### Phase 0: Reproduce under test

#### Task 0.1: Add fixture card with optional MCPs
- Create `test/fixtures/cards/sample-with-optional-mcps/` containing a minimal `card.json` declaring two optional MCPs (one whose name matches a registry entry, one purely novel). Empty `skills/` directory is fine.
- Add a helper in an existing test util file that registers this fixture in a temp store for use across tests.

#### Task 0.2: Locking baseline test
- In `test/optional-mcp-surfacing.test.ts` (new), add a test that resolves the fixture card via the store, runs `buildEffectiveState`, and asserts `state.activeServers` excludes the optional server whose `optional[name]` is `false` in the user/packaged config. This locks current behavior; the surfacing fix must keep this filter unchanged.

### Phase 1: Pure reporter

#### Task 1.1: Type definitions and computer
- Add to `cli/core/mcp.ts` (or new `cli/core/mcp-report.ts` if mcp.ts feels crowded):

```typescript
export interface OptionalMcpReportEntry {
  cardName: string;       // "@leeminseung/live-context"
  cardVersion: string;    // "0.5.0"
  serverName: string;     // "slack"
  status: "active" | "skipped";
  reason?: "optional-disabled";
  optInCommand?: string;  // e.g. "drwn add mcp slack"
}

export interface OptionalMcpReport {
  entries: OptionalMcpReportEntry[];
  skippedCount: number;
}

export function computeOptionalMcpReport(input: {
  lockedCards: CardLockEntry[];
  activeServers: Record<string, RegistryServer>;
  hasProjectConfig: boolean;
}): OptionalMcpReport {
  const entries: OptionalMcpReportEntry[] = [];
  let skippedCount = 0;
  for (const card of input.lockedCards) {
    for (const [serverName, server] of Object.entries(card.manifest.servers ?? {})) {
      if (server.optional !== true) continue;
      const active = input.activeServers[serverName] !== undefined;
      const base = { cardName: card.name, cardVersion: card.version, serverName };
      if (active) {
        entries.push({ ...base, status: "active" });
      } else {
        entries.push({
          ...base,
          status: "skipped",
          reason: "optional-disabled",
          optInCommand: input.hasProjectConfig
            ? `drwn add mcp ${serverName}`
            : `drwn library defaults add mcp ${serverName}`,
        });
        skippedCount++;
      }
    }
  }
  return { entries, skippedCount };
}
```

#### Task 1.2: Renderer
- Add to `cli/core/output.ts`:

```typescript
export function renderOptionalMcpReport(report: OptionalMcpReport): string {
  if (report.entries.length === 0) return "";

  const byCard = new Map<string, OptionalMcpReportEntry[]>();
  for (const entry of report.entries) {
    const key = `${entry.cardName}@${entry.cardVersion}`;
    let bucket = byCard.get(key);
    if (!bucket) { bucket = []; byCard.set(key, bucket); }
    bucket.push(entry);
  }

  const lines: string[] = ["Optional MCP servers from cards:"];
  for (const [card, entries] of byCard) {
    lines.push(`  ${card}`);
    for (const entry of entries) {
      lines.push(entry.status === "active"
        ? `    + ${entry.serverName} (active)`
        : `    - ${entry.serverName} (skipped — enable with \`${entry.optInCommand}\`)`);
    }
  }
  return lines.join("\n") + "\n";
}
```

ASCII `+` / `-` over Unicode ✓ / ✗ to avoid terminal-encoding surprises; existing `renderSyncResult` uses no glyphs, so this matches house style.

#### Task 1.3: Pure-function tests
- `test/optional-mcp-surfacing.test.ts`:
  - `"reports nothing when no card declares optional servers"` — empty `entries`, empty string render.
  - `"reports active and skipped for a card declaring both"` — verify both entries with correct status + commands.
  - `"groups multiple cards in stable order"` — two cards, four optional servers, render keeps cards together.
  - `"chooses project opt-in command when hasProjectConfig is true"` — string match.
  - `"chooses machine opt-in command when hasProjectConfig is false"` — string match.

### Phase 2: Wire `SyncResult` to expose effective state

#### Task 2.1: Extend SyncResult
- In `cli/core/types.ts`, add to `SyncResult`:

```typescript
export interface SyncResult {
  changes: string[];
  warnings: string[];
  managedPaths?: ManagedPath[];
  effectiveSnapshot?: {                       // NEW, optional for back-compat
    lockedCards: CardLockEntry[];
    activeServers: Record<string, RegistryServer>;
    hasProjectConfig: boolean;
  };
}
```

- In `cli/core/sync.ts syncRepository`, populate the field from the `state` already built. One-line addition.

#### Task 2.2: Verify nothing downstream breaks
- The field is optional. `renderSyncResult` and `renderJson` already pass-through; both continue to work. No test changes required for back-compat.

### Phase 3: Command-side wiring

#### Task 3.1: `drwn write`
- In `cli/commands/write.ts`, after the `syncRepository` call:

```typescript
const result = await syncRepository(options);
const report = result.effectiveSnapshot
  ? computeOptionalMcpReport(result.effectiveSnapshot)
  : { entries: [], skippedCount: 0 };

if (this.json) {
  this.context.stdout.write(renderJson({ ...result, optionalMcpReport: report }));
  return 0;
}
this.context.stdout.write(renderSyncResult(result));
this.context.stdout.write(renderOptionalMcpReport(report));
return 0;
```

- Strip `effectiveSnapshot` from JSON output before serialization (it's huge and not part of the public CLI contract) — wrap with a helper `omitEffectiveSnapshot(result)` defined alongside `renderSyncResult`.

#### Task 3.2: `drwn card add --write` and `drwn card apply --write`
- These chain into `runChainedWrite` (`cli/commands/card/project-command.ts`). Modify `runChainedWrite` to:
  1. Call `syncRepository` and capture the result.
  2. Print existing changes/warnings via `renderSyncResult`.
  3. Print the optional MCP report from `result.effectiveSnapshot`.
- Single change site covers both commands.

#### Task 3.3: Help text
- Update `--json` documentation for `drwn write` to mention `optionalMcpReport` in the envelope (existing usage strings already document the surface; add one bullet).

### Phase 4: End-to-end tests

#### Task 4.1: `drwn write` E2E
- In `test/commands-write.test.ts`, add:
  - `"reports skipped optional MCPs declared by locked cards"` — fixture project with the Phase-0 fixture card locked; expect `"Optional MCP servers from cards:"` and `"(skipped — enable with"` substrings in stdout.
  - `"omits optional MCP section when no card declares optional servers"` — fixture project with a card that has no optional MCPs; assert section is absent.
  - `"emits optionalMcpReport in --json output"` — assert parseable JSON, `optionalMcpReport.skippedCount > 0` and entries shape.

#### Task 4.2: `drwn card add/apply` E2E
- In `test/commands-card-consumer.test.ts`, add:
  - `"card apply --write surfaces optional MCP report"` — assert presence after the existing mutation output.
  - `"card add --write surfaces optional MCP report"` — same for the add command.

### Phase 5: Documentation

#### Task 5.1: README / docs site
- Add a "Optional MCP servers" subsection under the card install section. Two paragraphs: what optional means in a manifest, how the user opts in.

#### Task 5.2: Issue cross-link
- Update GitHub issue #10 body once this lands to point at this plan and the merge commit.

## Verification

- `bun test` clean.
- `bun run typecheck` clean.
- Manual smoke against `~/dev/hcards-catalog-local/`:
  1. Detach existing cards, clear `.claude/settings.json` MCP block.
  2. `drwn card apply '@leeminseung/live-context' --write` → expect a section listing `notion (active)` and `slack (skipped — enable with \`drwn add mcp slack\`)`.
  3. `drwn add mcp slack && drwn write` → expect `slack (active)` and `notion (active)`.
  4. `drwn write --json | jq .optionalMcpReport` → expect populated JSON.

## Risks / Open Questions

- **Strategy A's `effectiveSnapshot` field is heavy.** Lockfile entries + every active server. Mitigation: it's `optional`, internal-only, stripped from JSON output. If size becomes a problem at scale, swap for a narrowed `OptionalReportInputs` type carrying only the bits this report needs.
- **Color / glyph choice.** Plain ASCII (`+`/`-`) keeps Windows terminals + CI logs clean. If the codebase adopts colors later, swap to chalk semantics centrally in `output.ts`.
- **What if a card declares an optional MCP that's also in `registry/mcp-servers.json` with a *different* config?** `mergeProjectConfig` writes the card's variant into `nextRegistry.servers[name]`. The report is correct either way (the active-set check is name-based), but a downstream "which version of slack are you running" question is out of scope here. Tracked separately if it ever surfaces.
- **Should the report also list optional MCPs from `registry/mcp-servers.json` not declared by cards but currently inactive?** No. The pain point is "I installed a card and a feature didn't show up." Server-only optionals aren't in that frame. Worth confirming with users before broadening scope.

## Completion Criteria

- All Success Criteria checkboxes ticked.
- Phase 0–4 tests green; Phase 5 docs updated.
- A completion summary written at `42_completion_drwn-mcp-optional-skip-report.md` recording the verified manual smoke walkthrough above and the final commit hash.
