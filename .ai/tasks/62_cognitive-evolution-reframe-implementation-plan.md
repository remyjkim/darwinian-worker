# ABOUTME: TDD implementation plan for the "Cognitive Evolution" reframe — a canonical cognitiveEvolution(manifest) predicate, an additive generated-index field, CLI surfacing, the "mind content"→"cognitive evolution" copy rename, and the docs reframe.
# ABOUTME: Grounds every step on verified file:line evidence; keeps the "mind card" unit name and the card↔mind conflation intact.

# Task 62: Cognitive Evolution Reframe — Implementation Plan

**Status**: Planning
**Created**: 2026-06-30
**Updated**: 2026-06-30
**Assigned**: Claude + Remy
**Priority**: Medium
**Estimated Effort**: 2–3 days
**Dependencies**: none (additive; no lockfile/schema change)
**References**: [.ai/analyses/85_mind-card-cognitive-evolution-reframe.md, .ai/analyses/74_canonical-mind-card-target-architecture.md, .ai/analyses/75_mind-card-activation-defaults-and-stack-composition.md, cli/core/card-manifest.ts, cli/core/visibility.ts, cli/core/mind-generator/sync-mind.ts, cli/commands/mind/list.ts, cli/commands/card/show.ts, cli/commands/card/source/show.ts, cli/core/card-source.ts, cli/commands/card/push.ts, test/core-sync-mind.test.ts, test/commands-mind.test.ts, test/core-card-manifest.test.ts, test/core-visibility.test.ts, test/commands-output-contracts.test.ts]

---

## Objective

Reframe the existing tool-only-vs-full-mind-card distinction as a single, legible property — **Cognitive Evolution (ON/OFF)** — where ON means the card carries the cognitive bundle (persona + beliefs + memory L4/L5/L6), the user-facing umbrella that replaces the internal term "mind content". Keep the **"mind card"** unit name and the card↔mind conflation. Deliver one canonical predicate, surface the computed property on consumer and authoring CLI surfaces, rename the user-facing copy, and reframe the docs (introducing the growth-over-versions narrative).

This is **additive and backward-compatible**: no `card.json`/lockfile schema change, no on-disk artifact rename, no version-floor bump, no cross-repo coordination.

## Success Criteria

- [ ] A single `cognitiveEvolution(manifest)` predicate is the only place that computes "does this card carry cognitive content"; the four duplicated section-walks delegate to it.
- [ ] `cardManifestStrictestVisibility` is refactored onto the predicate with **provably unchanged behavior** (characterization tests green before and after).
- [ ] The per-card generated index (`mind.json`) and the `minds.json` registry entry carry an additive `cognitiveEvolution: boolean`.
- [ ] `drwn mind list`, `drwn card show`, and `drwn card source show` surface "Cognitive Evolution: on/off".
- [ ] User-facing "mind content" copy reads "cognitive evolution"; internal `MindContent*` identifiers renamed to `CognitiveEvolution*`.
- [ ] Docs reframe the tool-only/full distinction (esp. `concepts/minds.md:20`), rename the term, document the new CLI fields, and introduce the growth-over-versions narrative framed per the credibility guard.
- [ ] CHANGELOG entry added; version bumped 0.6.0 → 0.7.0. Full suite + `tsc --noEmit` green.

## Approach

TDD throughout (`bun test`; run one file with `bun test <path>`, typecheck with `bun run typecheck`). Hooks are **not** cognitive — confirmed: the section-walk touches only persona/beliefs/memory (`cli/core/visibility.ts:42-57`), so a hooks-only card is OFF. `enabled` is **presence-based** (`include.length>0`), independent of `visibility`; `visibilities` (for the strictest computation) is collected only where a populated section also has `visibility` set — exactly today's behavior.

**Module placement (avoids an import cycle):** `visibility.ts` already imports from `card-manifest.ts`. Put the predicate in a **new `cli/core/cognitive-evolution.ts`** that imports only `CardManifest`/types from `card-manifest.ts` and returns the collected `visibilities` (not the strictest). `visibility.ts` then imports the predicate and `cardManifestStrictestVisibility` becomes `strictest(cognitiveEvolution(manifest).visibilities)`. Dependency direction: `visibility.ts → cognitive-evolution.ts → card-manifest.ts`. No cycle.

```ts
// cli/core/cognitive-evolution.ts
import type { CardManifest, MemoryLayerName, MindContentVisibility } from "./card-manifest";
export interface CognitiveEvolutionState {
  enabled: boolean;                  // persona || beliefs || memoryLayers.length > 0  (presence)
  persona: boolean;
  beliefs: boolean;
  memoryLayers: MemoryLayerName[];   // populated layers, l4/l5/l6 order
  visibilities: MindContentVisibility[]; // only populated sections that also set visibility
}
export function cognitiveEvolution(manifest: CardManifest): CognitiveEvolutionState { /* single walk */ }
```

## Implementation Plan

### Phase 0 — Characterization tests (lock current behavior before any refactor)

`cardManifestStrictestVisibility` has **no test today** (only production callers: `visibility.ts:42`, `sync-mind.ts:217,243`, `push.ts:55`). Before touching it:

- [ ] **RED→GREEN (add, no code change):** in `test/core-visibility.test.ts`, add direct cases for `cardManifestStrictestVisibility`:
  - tools-only manifest (`{name,version}`) ⇒ `null`.
  - persona internal + beliefs public + memory l6 private ⇒ `"private"` (mirrors the ON fixture at `test/core-card-manifest.test.ts:71-84`).
  - populated section with `include` but no `visibility` ⇒ does **not** contribute to strictest.
  These pass against current code and guard the Phase 2 refactor.

### Phase 1 — The `cognitiveEvolution()` predicate (new module)

- [ ] **RED:** add `test/core-cognitive-evolution.test.ts` asserting `cognitiveEvolution(manifest)`:
  - OFF: `{name,version}` ⇒ `{enabled:false, persona:false, beliefs:false, memoryLayers:[], visibilities:[]}`.
  - ON: manifest from `core-card-manifest.test.ts:71-84` ⇒ `{enabled:true, persona:true, beliefs:true, memoryLayers:["l4","l6"], visibilities:[…]}` with `strictest(visibilities)==="internal"` (or per fixture).
  - Edge: section with `include` but no `visibility` ⇒ `enabled:true`, that section absent from `visibilities`.
- [ ] **GREEN:** implement `cli/core/cognitive-evolution.ts` per the Approach.

### Phase 2 — Refactor `cardManifestStrictestVisibility` onto the predicate

- [ ] **GREEN (Phase 0 tests must stay green):** in `cli/core/visibility.ts:42-57`, replace the inline walk with `return strictest(cognitiveEvolution(manifest).visibilities);`. Run `test/core-visibility.test.ts` — behavior unchanged.

### Phase 3 — Additive `cognitiveEvolution` field on the generated index

- [ ] **RED:** extend `test/core-sync-mind.test.ts` (fixture is ON) to assert `mindJson.cognitiveEvolution === true` and the `minds.json` entry's `cognitiveEvolution === true`. Add an OFF card (`publishCardWithSkills`) and assert `false`. Existing assertions (`:61-71`) are field-level and won't break.
- [ ] **GREEN:** in `cli/core/mind-generator/sync-mind.ts`, add `cognitiveEvolution: cognitiveEvolution(card.manifest).enabled` to the per-card `index` literal (`~:212-224`, after `visibility`) and to the returned entry (`~:233-244`, after `visibility`). Read `hasPersona`/`hasBeliefs`/`memoryLayers` from the predicate to remove the inline duplication. Leave `minds.json` `{version:1}` and the composed `mind/mind.json` untouched.

### Phase 4 — `drwn mind list` surfacing (+ shared registry type)

- [ ] **RED:** extend `test/commands-mind.test.ts` to assert `--json` `minds[].cognitiveEvolution` (existing cards OFF ⇒ `false`); add a table-column assertion.
- [ ] **GREEN:** in `cli/commands/mind/list.ts`: widen `readInstalledMinds` (`:61-69`) return type + the `parsed` cast to carry `cognitiveEvolution?: boolean` (introduce an exported `MindRegistryEntry` type shared with `sync-mind.ts`); the `card.lock` fallback (`:68`) has no manifest source ⇒ default `false`. Add a `"cognitive evolution"` column to `renderTable` (`:53`); the `--json` payload gets it free via the `...mind` spread (`:44-50`).

### Phase 5 — `drwn card show` surfacing

- [ ] **Pre-check:** confirm no full-shape contract pins `card show --json` (grep shows the output-contract test covers `card source show`, not published `card show`).
- [ ] **RED:** add a `card show` test asserting a "cognitive evolution" row (human) and `cognitiveEvolution` key (`--json`).
- [ ] **GREEN:** in `cli/commands/card/show.ts`: add `["cognitive evolution", state.enabled ? "on" : "off"]` to `rows` (`~:83-101`, after `integrity`) from `cognitiveEvolution(card.manifest)`; add `cognitiveEvolution` to the `renderJson({ ...card, … })` object (`:80`).

### Phase 6 — `drwn card source show` surfacing

- [ ] **RED / update:** add the on/off to `test/commands-card-source-mind-content.test.ts`; **update the `card source show --json` output contract at `test/commands-output-contracts.test.ts:54`** (it will gain the field — confirm whether it is a full-shape assertion and update in lockstep).
- [ ] **GREEN:** surface in `cli/commands/card/source/show.ts` table (`~:41-50`), derived from `readCardSourceState` (`card-source.ts:524`) — `manifestPersona`/`manifestBeliefs`/`manifestMemory` already populated (`:558-564`), or call `cognitiveEvolution(state.manifest)`. (Do **not** use `card source doctor` — its human output short-circuits on `report.ok`.)

### Phase 7 — User-facing copy rename ("mind content" → "cognitive evolution")

- [ ] **GREEN + guard tests:** update and add a `toContain` guard for each:
  - `cli/core/visibility.ts:73` and `:79` (push-gate warning/reason).
  - `cli/commands/card/push.ts:41` (flag help).
  - `cli/core/card-source.ts:245` (`assertSafeMindContentName` default label `"mind content entry"` → `"cognitive-evolution entry"`).
  - Add a guard, e.g. `expect(pushed.stderr).toContain("cognitive-evolution content")` in `test/commands-card-push.test.ts`.

### Phase 8 — Internal identifier rename (`MindContent*` → `CognitiveEvolution*`)

Mechanical, non-breaking (no on-disk impact). Rename across:
- [ ] `cli/core/card-manifest.ts` — `MindContentVisibility` (`:9`), `MindContentManifest` (`:13`), `validateMindContentSection` (`:80`, calls `:185-200`). Keep `PersonaManifest`/`BeliefsManifest`/`MemoryLayerManifest` aliases.
- [ ] `cli/core/card-source.ts` — `CardSourceMindContentState`, `CardSourceMindContentMutationResult`, `assertSafeMindContentName`, `assertMindContentVisibility`, `listMindContentDirs` (`:48,144,245,249,280,567-572`).
- [ ] `cli/core/card-store.ts` — `validatePublishedMindContentDirs` (`:393` + callers `:686,758,799,843`).
- [ ] `cli/core/card-lock.ts` — `validateMindContentLockSection` (`:139,140,185,224`).
- [ ] `cli/core/visibility.ts:5,7` import/alias.
- [ ] Update importing tests (e.g. `test/core-card-lock.test.ts` references to "mind content metadata"). Keep the on-disk section keys `persona`/`beliefs`/`memory` unchanged. Run `bun run typecheck`.

### Phase 9 — Docs reframe + narrative

Keep the conflation everywhere ("a card is a mind" stays); only reframe the tool-only/full description and the term.
- [ ] **Critical fix** — `docs-docusaurus/docs/concepts/minds.md:20`: replace *"a regular harness card, not a mind card"* with Cognitive-Evolution-OFF wording (every card is a mind card; the distinction is Cognitive Evolution off vs on). Also `:7` (introduce the umbrella) and `:68` ("Mind content is scaffolded…").
- [ ] Term rename ("mind content"→"cognitive evolution") in: `concepts/beliefs-memories-personas.md:7`, `concepts/hook-policies.md:108`, `reference/cli/card.md:45,176`, `reference/cli/mind.md:7,115`, `reference/schemas/card-manifest.md:74`, and `INSTALL.md:8,87,163,271-273,285` (keep `A card is a "mind."` at `:87`).
- [ ] `.ai/knowledges` maintainer docs: `01_agents-cli-usage-guide.md:266,383`, `02_per-project-config-guide.md:503,516`, `09_mind-cards-manual-test-guide.md:2,238,562,566`, `10_drwn-cli-architecture.md:653,663,670,1257`, `11_card-usage-guide.html:298,575,578`.
- [ ] Document the new CLI fields: `reference/cli/mind.md:20,32-41` (column + JSON `cognitiveEvolution`), `guides/managing-minds.md:34-40` (table example), `reference/cli/card.md:247` (card show indicator).
- [ ] **Introduce the narrative** (does not exist today; `frontend-landing/` is empty) in `docs-docusaurus/docs/intro.md` + `README.md` + `INSTALL.md`: "Cognitive Evolution — a mind that grows over time as you refine, version, and re-publish cards." **Credibility guard:** frame as growth-over-versions, never runtime self-evolution (v1 cards are immutable). Do **not** "fix" memory tier counts — L4/L5/L6 is already correct everywhere; there is no "six" to correct.
- [ ] `docs-astro/` is deprecated (zero hits) — skip.

### Phase 10 — Release hygiene

- [ ] CHANGELOG.md: `### Added` (cognitiveEvolution predicate/index field + CLI surfacing) and `### Changed` (copy + internal rename), under a new `## [0.7.0] — <date>` header (Keep-a-Changelog format).
- [ ] Bump `package.json` version 0.6.0 → 0.7.0. **No** `MINDS_MIN_DRWN_VERSION` floor bump (lockfile/schema untouched).

## Acceptance Criteria

- [ ] `bun test` fully green; `bun run typecheck` clean.
- [ ] Characterization tests (Phase 0) green both before and after the Phase 2 refactor.
- [ ] A tools-only card and a hooks-only card both report Cognitive Evolution **off**; a card with any of persona/beliefs/memory reports **on**, across `mind list`, `card show`, `card source show`, and the generated index.
- [ ] No "mind content" string remains in user-facing output; no `MindContent*` identifier remains in `cli/`.
- [ ] `git grep -n "not a mind card"` returns nothing in docs.

## Testing Strategy

- Unit: the predicate (`core-cognitive-evolution.test.ts`), the visibility parity (`core-visibility.test.ts`), manifest validation (`core-card-manifest.test.ts`).
- Integration/CLI (real `drwn` via `runAgentsCli`): index shape (`core-sync-mind.test.ts`), `mind list` (`commands-mind.test.ts`), `card show`, `card source show` + the `commands-output-contracts.test.ts:54` contract update, push copy guard (`commands-card-push.test.ts`).
- Use the existing CLI-driven cognitive-card pattern (`add-persona/add-belief/add-memory` then `publish`, as in `core-sync-mind.test.ts:17-37`) and `publishCardWithSkills` for OFF cards.

## Risks & Mitigation

- **Silent behavior change in strictest-visibility** → Phase 0 characterization tests written *first*; Phase 2 is a pure delegation.
- **Import cycle** → predicate lives in a new module returning `visibilities`; visibility.ts depends on it, not vice versa.
- **Output-contract breakage** → Phase 6 explicitly updates `commands-output-contracts.test.ts:54`; Phase 5 pre-checks for a `card show` full-shape assertion before adding the field.
- **`readInstalledMinds` narrowing / card.lock fallback** → widen the type and default the lock-only path to `false` (documented behavior, not a silent gap).
- **MindContent* rename churn** → isolated to Phase 8, mechanical, guarded by `typecheck`; section keys and lockfile untouched.

## Notes (scope boundaries)

- **Out of scope (flagged, separate PR):** the submodule `darwinian-minds-skills` skill `author-mind-content` carries the old term — cosmetic drift, non-breaking, a separate-repo change.
- **No schemaVersion bump:** the field is additive to regenerated output; CCH consumes the *composed* `mind/mind.json` (untouched) — bumping would falsely signal a break.
- The card↔mind conflation and the `drwn card`/`drwn mind` namespaces are deliberately retained.
