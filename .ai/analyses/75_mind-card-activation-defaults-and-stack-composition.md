# ABOUTME: Target architecture for the post-review mind-card fixes — default activation semantics (ABSENT≠EMPTY) and pre-composed active-stack materialization.
# ABOUTME: Handoff-ready for the implementer; file:line-anchored to the current task-53 tree. Refines analysis 74.

# Mind Card: Activation Defaults & Active-Stack Composition — Target Architecture

**Date**: 2026-06-26
**Author**: Claude + Remy
**Status**: Approved design — ready for implementation
**Refines**: `.ai/analyses/74_canonical-mind-card-target-architecture.md`
**References**: [.ai/analyses/63_drwn-mind-card-target-architecture.md (CCH mount contract), .ai/tasks/53_canonical-mind-card-implementation-plan.md, cli/core/effective-state.ts, cli/core/mind-generator/sync-mind.ts, cli/core/sync.ts, cli/core/write-record.ts, cli/core/types.ts, cli/commands/mind/{use,clear,list}.ts]

---

## Executive Summary

The task-53 implementation (commits `a6edcb2` PR1 additive, `23dcb26` PR2 materialization) is correct and green (924 tests). A four-angle review surfaced two design decisions and three minor items. The four **independent** items are already fixed (see "Already done"). This document specifies the **two approved design changes** for the implementer:

1. **Decision #1 → "1B": default activation via ABSENT ≠ EMPTY.** Today a project with installed `cards` but no `activeMinds` projects **nothing** to the IDE surface — and because `init`/`scaffold`/`card add`/`card apply` never set `activeMinds`, this hits **every new project**, not just legacy ones (and there is no legacy install base — `darwinian-mind` is unpublished). Fix: treat **absent `activeMinds`** as "all installed cards active" (the usable default) and **empty `[]`** (what `drwn mind clear` writes) as "explicitly none". `drwn mind use` continues to set an explicit ordered stack.

2. **Decision #2 → "2B": drwn pre-composes the active stack into a mount-ready artifact.** The downstream CCH/Mindblown contract (analysis 63) mounts a **single** `generated/mind/` directory and reads one `mind.json`/`persona.md`; it has no concept of an ordered multi-mind stack, and the active-stack order currently lives **only** in `config.json` (which the runtime never sees). drwn already owns the merge engine and the order, so drwn composes: it writes a **composed active-stack view** at `generated/mind/` (ordered `persona.md`, union beliefs/memory with provenance, composed `mind.json`) alongside the existing per-mind isolated bundles. This preserves CCH's zero-coupling mount contract, makes stack-order **testable** (closes #5d), and gives the index its provenance/version fields (closes #3).

Packaging (Decision #4 → "4-ii"): land these as commits **on top of** the existing PR1/PR2 split; do not rewrite `a6edcb2`/`23dcb26`. PR1 stays independently mergeable.

---

## Already done (independent hardening — no further action)

These four landed in the working tree and are green (`tsc` clean, 924 pass):
- **#6** consolidated `isSafePathPart` (one predicate in `store-paths.ts`; `card-manifest.ts` imports it; `assertSafePathPart` wraps it).
- **#5a** deactivation→hook reprojection test (`core-mind-hook-stack.test.ts`).
- **#5b** visibility-gate gaps: unit `unknown`-remote-block + explicit-classification; CLI network-remote-blocked-before-push (`core-visibility.test.ts`, `commands-card-push.test.ts`).
- **#5c** end-to-end stack-order MCP precedence, reorder flips `.mcp.json` (`core-effective-state-stack.test.ts`).

Per **4-ii**, commit these as a single "hardening" commit on top of `23dcb26`.

---

## Decision #1 (1B): Default activation semantics

### Current behavior (the defect)
`cli/core/effective-state.ts:75`:
```ts
activeCards = selectActiveCards(lockedCards, projectConfig.activeMinds ?? []);
```
The `?? []` collapses **absent** and **empty** into the same value, and `selectActiveCards` returns `[]` for an empty list — so a `cards`-only project (no `activeMinds`) projects nothing. `drwn mind clear` writes `[]`; `drwn mind use` writes `[names]`; nothing else sets the field.

### Target behavior
| `activeMinds` state | Meaning | Projected active stack |
|---|---|---|
| **absent** (`undefined`) | default — never explicitly chosen | **all** locked cards, in lockfile order |
| **empty** (`[]`) | explicitly none (`drwn mind clear`) | none |
| **`[names]`** | explicit ordered stack (`drwn mind use`) | those cards, in given order |

### Implementation
- `cli/core/effective-state.ts:75` — stop coalescing; pass the raw field:
  ```ts
  activeCards = selectActiveCards(lockedCards, projectConfig.activeMinds);
  ```
- `selectActiveCards(lockedCards, activeMinds?: string[])`:
  ```ts
  function selectActiveCards(lockedCards: CardLockEntry[], activeMinds?: string[]) {
    if (activeMinds === undefined) return lockedCards;          // absent → all (default)
    if (activeMinds.length === 0) return [];                    // explicit none
    const byName = new Map(lockedCards.map((c) => [c.name, c]));
    return activeMinds.flatMap((name) => (byName.get(name) ? [byName.get(name)!] : []));
  }
  ```
- No disk mutation, no migration command — purely an in-memory default. `init`/`scaffold`/`card add`/`card apply` remain unchanged (they keep `activeMinds` absent, which now means "all active").

### Edge cases & polish
- A name in `activeMinds` not present in `lockedCards` is silently skipped (existing behavior; keep). Consider a `drwn doctor`/`mind list` note when the active stack references an uninstalled card — **optional**, not required.
- `drwn mind list` should render the default state clearly: when `activeMinds` is absent, show all installed minds as active with a note like "(default: all active — run `drwn mind use` to pin an explicit stack)". **Recommended** small UX polish.

### Tests
- `cards`-only project (no `activeMinds`) → `drwn write` projects **all** cards' skills/MCP/hooks (regression-guards the new default). Extend `test/core-effective-state-stack.test.ts` / a `commands-write` case.
- `drwn mind clear` then `write` → projects **nothing** (empty sentinel honored).
- Explicit `mind use` ordering still wins (already covered by `#5c`).

---

## Decision #2 (2B): Pre-composed active-stack materialization

### Layout
Two distinct, complementary structures under `<projectRoot>/.agents/drwn/generated/`:

```
generated/
  minds/                         # UNCHANGED — per-mind isolated bundles for ALL installed cards
    <scope>/<name>/              # persona.md, beliefs/, memory/, skills/, hooks/, mcp/, mind.json
  minds.json                     # UNCHANGED — registry of all installed (alphabetical)
  mind/                          # NEW — composed view of the ACTIVE STACK (ordered)
    persona.md                   #   concatenated across the active stack, in stack order
    beliefs/<scope>/<name>/<entry>          # symlinks, namespaced by originating mind
    memory/{l4,l5,l6}/<scope>/<name>/<entry># symlinks, namespaced by originating mind
    mind.json                    #   composed, ordered index (the mount contract)
```

`generated/mind/` is the **mount target** CCH already expects (analysis 63: `mountPreExecAssets` uploads `.agents/drwn/generated/mind/` → `/mnt/mind/`, runtime reads `/mnt/mind/mind.json`). The per-mind `generated/minds/` bundles remain the canonical, integrity-bearing units; `generated/mind/` symlinks into them (or into the extracted trees) and never duplicates content.

### What drives composition
The **active stack** (`state.activeCards`, in order, per Decision #1) — **not** all locked cards. So:
- absent `activeMinds` → composed view contains all installed minds in lockfile order;
- explicit `mind use a b` → composed view = `[a, b]` in that order;
- `mind clear` (`[]`) → **no** `generated/mind/` (writer removes it via write-record).

### Merge / precedence policy (define explicitly)
- **persona** — concatenate each active card's persona entries in **stack order** (earlier layers first, later appended), preserving the existing markers `<!-- drwn:persona:start card="…" entry="…" -->`. No dedup. Stack order is the contract; the runtime decides weighting.
- **beliefs / memory** — **union**, **namespaced by originating mind** (`beliefs/<scope>/<name>/<entry>`) so two minds with the same entry name never collide. Order in `mind.json` follows stack order, then entry order. Each entry carries provenance.

### `generated/mind/mind.json` schema (closes #3)
```jsonc
{
  "schemaVersion": 1,
  "activeMinds": ["@scope/base", "@scope/frontend"],   // ordered stack (the missing order channel)
  "persona": { "path": "persona.md", "entries": [ { "card": "@scope/base", "entry": "voice" } ] },
  "beliefs": { "entries": [ { "card": "@scope/base", "entry": "x", "path": "beliefs/@scope/base/x", "visibility": "internal" } ] },
  "memory": {
    "l4": { "entries": [ { "card": "@scope/base", "entry": "r", "path": "memory/l4/@scope/base/r", "visibility": "internal", "format": "md" } ] },
    "l5": { "entries": [ … ] },
    "l6": { "entries": [ … ] }
  },
  "sources": [ { "card": "@scope/base", "version": "1.2.0", "integrity": "sha256-…" } ],
  "drwnVersion": "0.4.x",
  "writtenAt": "2026-06-26T00:00:00.000Z"
}
```
`writtenAt` uses `new Date().toISOString()` (CLI runtime — `Date` is available here; the Workflow-script restriction does not apply). `integrity` is per source card (reuse the per-mind values). `drwnVersion` from the existing `DRWN_VERSION` constant.

> Note: `generated/minds.json` (registry of all installed) stays alphabetical and unchanged — it is a catalog, not the active composition. The **order** now lives in `generated/mind/mind.json.activeMinds`.

### Implementation
- Extend `cli/core/mind-generator/sync-mind.ts`: keep the per-card loop over `state.lockedCards` (`:226`) for `generated/minds/`; **add** a composition pass over `state.activeCards` that writes `generated/mind/` (persona concat, namespaced belief/memory symlinks, composed `mind.json`). If `state.activeCards` is empty, ensure `generated/mind/` is absent.
- `cli/core/sync.ts` (`syncMinds` call site ~`:375`) — pass/already has `state.activeCards`.
- `cli/core/write-record.ts` — register `generated/mind/` as managed (`managed-directory` for the tree + `managed-content` for `persona.md`/`mind.json`) so a stack change or `mind clear` cleans it via the existing content-hash-guarded cleanup (`sync.ts` `cleanupRemovedManagedPaths`), preserving user-edited files with a warning.
- `cli/core/store-paths.ts` — add `resolveGeneratedComposedMindDir(generatedDir)` → `join(generatedDir, "mind")`.

### Tests (closes #5d + #3)
- **#5d** persona stack-order: two active minds each with a persona entry → `generated/mind/persona.md` contains both in stack order; **reorder** via `mind use` → order flips. Assert marker order.
- Composed `mind.json`: `activeMinds` matches the ordered stack; beliefs/memory entries carry `card`/`path`/`visibility`; `drwnVersion`/`writtenAt` present (#3).
- Collision: two active minds with the same belief entry name both appear (namespaced), neither clobbers the other.
- `mind clear` → `generated/mind/` removed on next `write`; user-edited `persona.md` preserved-with-warning (content-hash guard).
- Default (absent `activeMinds`) → `generated/mind/` composes all installed minds.

---

## Packaging (Decision #4 → 4-ii)

The work is already two clean commits; do **not** rewrite them:
- `a6edcb2` — PR1 (additive data model): independently compiles/tests; safe to land alone.
- `23dcb26` — PR2 (materialization + the 4-line `lockedCards → activeCards` break).

Land the remaining work as commits **on top**:
1. **Hardening** commit — the four already-done fixes (#6, #5a–c).
2. **1B** commit — the ABSENT≠EMPTY default (+ tests, + optional `mind list` polish).
3. **2B** commit — composed `generated/mind/` materialization (+ #5d/#3 tests).

1B and 2B are projection/materialization changes, i.e. they extend PR2 — PR1 (`a6edcb2`) remains untouched and independently mergeable.

---

## Acceptance Criteria

- [ ] `cli/core/effective-state.ts` distinguishes absent (`undefined` → all locked) from empty (`[]` → none); `selectActiveCards` updated; no disk mutation.
- [ ] New project with `card add`/`apply` (no `mind use`) projects all cards on `drwn write`; `mind clear` projects nothing; `mind use` ordering wins.
- [ ] `generated/mind/` composed view written from the **active stack** in order: `persona.md` (stack-ordered, marked), namespaced belief/memory symlinks, composed `mind.json` (with `activeMinds` order, provenance, `drwnVersion`, `writtenAt`).
- [ ] `generated/minds/` per-mind bundles + alphabetical `minds.json` registry unchanged.
- [ ] `generated/mind/` cleaned on stack change / `mind clear` via write-record (content-hash guard preserves user edits).
- [ ] Tests: 1B default/clear/order; persona stack-order + reorder (#5d); composed `mind.json` fields + provenance (#3); belief-name collision namespacing.
- [ ] `bun test` / `tsc --noEmit` / `verify:release` green. The four hardening fixes committed on top of `23dcb26`; `a6edcb2` untouched.

---

## Risks & Notes

| Risk | Mitigation |
|---|---|
| `generated/mind/` + `generated/minds/` confusion (singular vs plural) | Document in code comments; `mind/` = composed active view (mount target), `minds/` = per-card catalog. Both names are load-bearing to the CCH contract (63) and the isolation model (74). |
| ABSENT=all softens the "explicit activation" intent | Accepted by decision (usability for the common case); `mind use`/`mind clear` give full explicit control; `mind list` surfaces the default state. |
| Belief/memory merge policy ambiguity | Fixed here: union + namespace-by-mind (no silent collision); precedence only matters for tools (already last-wins) and persona (stack-order concat). |
| CCH still references the old single-mind `mind.json` shape (63) | The composed `mind.json` is a superset (adds `activeMinds`/provenance); the single-mind degenerate case (one active card) yields the same persona.md + a one-element stack — backward-compatible with the 63 contract. Flag the schema delta to the CCH owner. |
| `writtenAt` nondeterminism in tests | Assert presence/format, not value (mirrors existing index tests). |
