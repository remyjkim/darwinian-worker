# ABOUTME: TDD implementation plan for the approved mind-card fixes — 1B default activation + 2B pre-composed active-stack materialization.
# ABOUTME: File:line-anchored to the task-53 tree; verbatim patterns to mirror. Implements analysis 75.

# Task 56: Mind Card Activation Defaults & Active-Stack Composition — Implementation Plan

> **For Claude/Codex:** Use `superpowers:test-driven-development` for every code task (failing test first). Do not commit until the whole set is implemented and green (Remy: "commit all together once everything is implemented").

**Status**: Ready to start
**Created**: 2026-06-26
**Assigned**: Unassigned
**Estimated Effort**: 1–1.5 days
**Implements**: `.ai/analyses/75_mind-card-activation-defaults-and-stack-composition.md` (refines `74`)
**Builds on**: commits `a6edcb2` (PR1 additive) + `23dcb26` (PR2 materialization); current branch `remyjkim/canonical-mind-card-task-53-pr1`
**References**: [cli/core/effective-state.ts, cli/core/mind-generator/sync-mind.ts, cli/core/store-paths.ts, cli/core/sync.ts, cli/core/write-record.ts, cli/core/version.ts, cli/commands/mind/list.ts, test/core-effective-state-stack.test.ts, test/core-sync-mind.test.ts, .ai/analyses/63_drwn-mind-card-target-architecture.md (CCH mount contract)]

---

## Objective

Land the two approved design changes from analysis 75:
- **1B** — `activeMinds` ABSENT means "all installed cards active" (usable default for every project); EMPTY `[]` (from `drwn mind clear`) means "explicitly none"; `[names]` (from `drwn mind use`) is the explicit ordered stack.
- **2B** — drwn pre-composes the **active stack** into a single mount-ready `generated/mind/` view (stack-ordered `persona.md`, union beliefs/memory namespaced by mind, composed `mind.json` carrying the stack order + provenance + `drwnVersion`/`writtenAt`), alongside the existing per-mind `generated/minds/` bundles. Closes review items #3 (index fields) and #5d (persona stack-order test).

Hardening (#6, #5a–c) is already done in the working tree. Packaging is **4-ii**: land everything as commits on top of `a6edcb2`/`23dcb26`; leave PR1 untouched.

---

## Success Criteria (from analysis 75)

- [ ] ABSENT `activeMinds` → all locked cards project; `[]` → none; `[names]` → ordered stack. No disk mutation.
- [ ] New `card add`/`apply` project (no `mind use`) projects all cards on `drwn write`.
- [ ] `generated/mind/` composed view written from the active stack in order: stack-ordered `persona.md`, namespaced belief/memory symlinks, composed `mind.json`.
- [ ] Composed `mind.json` carries `schemaVersion`, ordered `activeMinds`, persona/beliefs/memory entries with provenance, `sources` integrity, `drwnVersion`, `writtenAt`.
- [ ] `generated/minds/` per-mind bundles + alphabetical `minds.json` unchanged.
- [ ] Stack change / `mind clear` prunes stale composed entries and removes `generated/mind/` when empty (content-hash guard preserves user edits).
- [ ] `bun test` / `tsc --noEmit` / `bun run verify:release` green.

---

## Phase 1 — Hardening commit (4-ii)

The four already-done fixes (#6 `isSafePathPart`, #5a deactivation test, #5b visibility tests, #5c precedence test) are uncommitted. **Stage them as one commit on top of `23dcb26`** — e.g. `test(mind): harden hooks, visibility, and stack precedence coverage` (includes the `store-paths`/`card-manifest` consolidation). Do not touch `a6edcb2`.

---

## Phase 2 — Decision 1B: default activation semantics

### Task 2.1 (RED) — tests
- `test/core-effective-state-stack.test.ts`:
  - **Update** the existing "leaves installed but inactive cards out of projection" test — it currently writes `{ version: 1, cards: [...] }` (absent `activeMinds`) and asserts `state.activeCards === []`. Under 1B that becomes "all active", so change its config to set `activeMinds: []` explicitly (it is now testing the EMPTY sentinel).
  - **Add** "absent activeMinds projects all installed cards": config `{ version: 1, cards: ["@me/base@1.0.0", "@me/overlay@1.0.0"] }` (no `activeMinds`) → `state.activeCards.map(c => c.name)` equals all locked cards in lockfile order.
- Run → the new test fails (current code returns `[]` for absent).

### Task 2.2 (GREEN) — `cli/core/effective-state.ts`
- Line 75: drop the coalesce.
  ```ts
  activeCards = selectActiveCards(lockedCards, projectConfig.activeMinds);
  ```
- `selectActiveCards` → accept optional and branch on ABSENT vs EMPTY:
  ```ts
  function selectActiveCards(lockedCards: CardLockEntry[], activeMinds?: string[]) {
    if (activeMinds === undefined) return lockedCards;          // absent → all (default)
    if (activeMinds.length === 0) return [];                    // explicit none (mind clear)
    const byName = new Map(lockedCards.map((card) => [card.name, card]));
    return activeMinds.flatMap((name) => {
      const card = byName.get(name);
      return card ? [card] : [];
    });
  }
  ```

### Task 2.3 — audit existing tests for the absent=none assumption
- Run the **full** suite. Any test that built a `cards` project WITHOUT `activeMinds` and expected NO projection must switch to explicit `activeMinds: []`. (Most PR2 tests already set `activeMinds` explicitly and are unaffected; fix only the stragglers.) Confirm green.

### Task 2.4 — `mind list` polish (recommended, small)
- `cli/commands/mind/list.ts`: when `activeMinds` is absent, render all installed minds as active with a note (e.g. `default: all active — run \`drwn mind use\` to pin a stack`). Add/adjust one assertion in `test/commands-mind.test.ts`.

---

## Phase 3 — Decision 2B: pre-composed active-stack materialization

### Task 3.1 — `cli/core/store-paths.ts`
Add next to `resolveGeneratedMindsDir` (line ~169):
```ts
export function resolveGeneratedComposedMindDir(generatedDir: string) {
  return join(generatedDir, "mind");
}
```

### Task 3.2 (RED) — tests (`test/core-composed-mind.test.ts`, new; mirror `core-sync-mind.test.ts`)
Use the `publishMindFixture`/`syncRepository(syncOptions)` pattern from `core-sync-mind.test.ts`. Publish two persona-bearing cards (`@me/base` voice, `@me/overlay` tone) + a shared-named belief on both. Cases:
1. **Persona stack order (#5d):** with `activeMinds: ["@me/base", "@me/overlay"]`, `generated/mind/persona.md` contains the `card="@me/base"` marker block **before** `card="@me/overlay"`. Reorder to `["@me/overlay", "@me/base"]` → order flips.
2. **Composed index (#3):** `generated/mind/mind.json` has `schemaVersion: 1`, `activeMinds` equal to the ordered stack, belief/memory `entries` with `card`/`entry`/`path`/`visibility`, `sources[].integrity`, a non-empty `drwnVersion`, and a `writtenAt` matching ISO format (assert format, not value).
3. **Collision namespacing:** both minds declare belief entry `engineering` → `generated/mind/beliefs/@me/base/engineering` and `.../@me/overlay/engineering` both exist (symlinks); neither clobbers.
4. **Empty stack:** `drwn mind clear` then `write` → `generated/mind/` no longer exists; per-mind `generated/minds/...` bundles still exist.
5. **Default (absent):** config with `cards` and no `activeMinds` → `generated/mind/` composes all installed minds.
6. **Shrink prune:** stack `[base, overlay]` then `mind use @me/base` → `generated/mind/beliefs/@me/overlay/...` is pruned (stale-entry cleanup).

### Task 3.3 (GREEN) — `cli/core/mind-generator/sync-mind.ts`
Add a composition pass that **mirrors `materializeMind`** (reuse `personaContent`, `ensureDirSymlink`, `recordManagedContent`, `recordGeneratedSymlink`, `recordManagedDirectory`, `writeJson`). Record **each** symlink/file as an individual managed path so `diffWriteRecord` prunes stale entries on stack shrink (no manual wipe).

```ts
import { DRWN_VERSION } from "../version";
import { resolveGeneratedComposedMindDir, splitCardName } from "../store-paths";

function composedRelPath(card: CardLockEntry, ...parts: string[]) {
  return join(...splitCardName(card.name), ...parts).replace(/\\/g, "/");
}

async function materializeComposedMind(state: EffectiveState, result: SyncResult) {
  const active = state.activeCards;
  if (active.length === 0) return;                              // empty stack → no composed view (cleanup removes prior)
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const composedDir = resolveGeneratedComposedMindDir(generatedDir);
  if (!state.scopedOptions.dryRun) mkdirSync(composedDir, { recursive: true });

  // persona — concatenate in stack order
  const personaParts = active.map((c) => personaContent(c)).filter((p): p is string => p !== null).map((p) => p.trimEnd());
  if (personaParts.length > 0) {
    const personaPath = join(composedDir, "persona.md");
    const content = `${personaParts.join("\n\n")}\n`;
    writeManagedFile(personaPath, content, state.scopedOptions.dryRun, result);
    result.managedPaths?.push(recordManagedContent(state.scopeRoot, personaPath, content));
  }

  // beliefs + memory — union, namespaced by originating mind
  for (const card of active) {
    for (const entry of card.beliefs?.include ?? []) {
      const link = join(composedDir, "beliefs", ...splitCardName(card.name), entry);
      ensureDirSymlink(link, join(card.path, "beliefs", entry), state.scopedOptions.dryRun, result);
      result.managedPaths?.push(recordGeneratedSymlink(state.scopeRoot, link, join(card.path, "beliefs", entry)));
    }
    for (const layer of ["l4", "l5", "l6"] as const) {
      for (const entry of card.memory?.[layer]?.include ?? []) {
        const link = join(composedDir, "memory", layer, ...splitCardName(card.name), entry);
        ensureDirSymlink(link, join(card.path, "memory", layer, entry), state.scopedOptions.dryRun, result);
        result.managedPaths?.push(recordGeneratedSymlink(state.scopeRoot, link, join(card.path, "memory", layer, entry)));
      }
    }
  }

  // composed index
  const beliefEntries = active.flatMap((c) =>
    (c.beliefs?.include ?? []).map((entry) => ({ card: c.name, entry, path: composedRelPath(c, "beliefs", entry), visibility: c.beliefs?.visibility ?? null })),
  );
  const memory = Object.fromEntries((["l4", "l5", "l6"] as const).map((layer) => [layer, {
    entries: active.flatMap((c) => (c.memory?.[layer]?.include ?? []).map((entry) => ({
      card: c.name, entry, path: composedRelPath(c, "memory", layer, entry),
      visibility: c.memory?.[layer]?.visibility ?? null, format: c.memory?.[layer]?.format ?? "md",
    }))),
  }]));
  const index = {
    schemaVersion: 1,
    activeMinds: active.map((c) => c.name),
    persona: { path: "persona.md", entries: active.flatMap((c) => (c.persona?.include ?? []).map((entry) => ({ card: c.name, entry }))) },
    beliefs: { entries: beliefEntries },
    memory,
    sources: active.map((c) => ({ card: c.name, version: c.version, integrity: c.integrity })),
    drwnVersion: DRWN_VERSION,
    writtenAt: new Date().toISOString(),
  };
  writeJson(join(composedDir, "mind.json"), index, state, result);

  if (!state.scopedOptions.dryRun && existsSync(composedDir) && lstatSync(composedDir).isDirectory()) {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, composedDir, false));
  } else {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, composedDir, true));
  }
}
```
Call it from `syncMinds` after the per-mind loop (before/after `minds.json` is fine):
```ts
  // ... existing per-mind loop + minds.json ...
  await materializeComposedMind(state, result);
  return result;
```
> `writtenAt` uses `new Date().toISOString()` — valid in CLI runtime (the Workflow-script `Date` restriction does not apply here). Tests assert ISO format, not value.

### Task 3.4 — verify cleanup
Confirm via Task 3.2 cases 4 & 6 that `generated/mind/` is removed when the stack empties and stale per-mind sub-entries are pruned on shrink — both fall out of the existing `diffWriteRecord` + `cleanupRemovedManagedPaths` (sync.ts:97-…, managed-directory at :114-116) because each composed path is individually recorded. No new cleanup code needed.

---

## Phase 4 — Verification

- `bun test` (full), `tsc --noEmit`, `bun run verify:release --json` all green.
- Manual smoke: publish two persona+belief minds → `card apply` → `mind use a b` → `drwn write` → inspect `.agents/drwn/generated/mind/` (persona.md order, namespaced beliefs, mind.json) and `generated/minds/` (unchanged) → `mind use b a` → re-write → order flips → `mind clear` → `generated/mind/` gone.

---

## Edge cases & notes for the implementer

| Item | Guidance |
|---|---|
| Existing tests assuming absent=none | Convert those configs to explicit `activeMinds: []` (Task 2.3). |
| Stale composed entries on stack shrink | Handled automatically — record each symlink/file as a managed path (do NOT just record the dir). |
| `generated/mind/` vs `generated/minds/` | Singular = composed active view (CCH mount target); plural = per-card catalog. Keep both; document in code comments. |
| Belief/memory name collision across minds | Namespaced by `splitCardName(card.name)` — both preserved; provenance in `mind.json`. |
| CCH schema delta | Composed `mind.json` is a superset of analysis 63's single-mind shape (adds `activeMinds`/provenance). Flag to the CCH owner; degenerate one-active-mind case stays compatible. |
| `dryRun` | Mirror `materializeMind`'s dryRun handling (already threaded through the reused helpers). |

---

## Final Checklist

- [ ] Phase 1: hardening committed on top of `23dcb26`; `a6edcb2` untouched.
- [ ] Phase 2: `effective-state.ts` ABSENT≠EMPTY; tests updated/added; full suite green.
- [ ] Phase 3: `resolveGeneratedComposedMindDir`; `materializeComposedMind` mirrors `materializeMind`; composed `mind.json` schema; tests for #5d/#3/collision/empty/default/shrink.
- [ ] Phase 4: `bun test` + `tsc` + `verify:release` green; manual smoke confirms order/cleanup.
- [ ] No commit until everything is implemented and green (commit all together).
