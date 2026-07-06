# ABOUTME: Target architecture for "Cognitive Evolution" — the computed, presence-based property (persona + beliefs + memory) that reframes the tool-only-vs-full-mind-card distinction, with one canonical predicate and additive surfacing.
# ABOUTME: The durable "what the system is" reference; decision rationale lives in analysis 85, the build sequence in task 62.

# Cognitive Evolution — Target Architecture

**Date**: 2026-06-30
**Author**: Claude + Remy
**Status**: Architecture approved; implementation plan in `.ai/tasks/62_cognitive-evolution-reframe-implementation-plan.md`
**Decision record**: `.ai/analyses/85_mind-card-cognitive-evolution-reframe.md`
**Builds on**: `.ai/analyses/74_canonical-mind-card-target-architecture.md`, `.ai/analyses/75_mind-card-activation-defaults-and-stack-composition.md`
**References**: [cli/core/card-manifest.ts, cli/core/cognitive-evolution.ts (new), cli/core/visibility.ts, cli/core/mind-generator/sync-mind.ts, cli/commands/mind/list.ts, cli/commands/card/show.ts, cli/commands/card/source/show.ts, cli/core/card-source.ts]

---

## Executive Summary

**Cognitive Evolution** is the named property that reframes today's informal "tools-only card vs full mind card" distinction into one legible axis: a card carries the **cognitive bundle** (persona + beliefs + memory L4/L5/L6) or it does not. It is the user-facing umbrella that replaces the internal term *"mind content."*

The architecture has four invariants:

1. **It is computed, not stored.** Cognitive Evolution ON/OFF is derived from the *presence* of cognitive sections in a card's manifest. There is no `card.json` flag, no lockfile change, no schema bump. The system already makes this distinction by presence (`cardManifestStrictestVisibility` returns `null` for a tools-only card); the reframe gives it a name and one canonical home.
2. **One canonical predicate.** A single `cognitiveEvolution(manifest)` in a new `cli/core/cognitive-evolution.ts` module is the only place the cognitive-section walk lives; the four sites that duplicate that walk today delegate to it.
3. **Surfacing is additive.** A `cognitiveEvolution: boolean` field is added to the generated per-card index (`mind.json` / `minds.json`), and an on/off indicator appears on the consumer surfaces (`mind list`, `card show`) and the authoring surface (`card source show`). All strictly additive and backward-compatible.
4. **The unit model is untouched.** The "mind card" name and the card↔mind conflation stay. `drwn card` / `drwn mind` namespaces, on-disk paths, the composed `generated/mind/` artifact, and `activeMinds` are unchanged. Hooks are **not** cognitive — a hooks-only card is Cognitive Evolution OFF.

This doc describes the end-state structures and their relationships. The *why* (the seven-model exploration and rejected alternatives) is in analysis 85; the *how/when* (TDD phases) is in task 62.

---

## Conceptual Model

- A **card** ("mind card", the canonical unit) carries `skills` / `hooks` / `servers` (tool content) and, optionally, **cognitive content**: `persona`, `beliefs`, `memory.{l4,l5,l6}`.
- **Cognitive Evolution** is the property "this card carries cognitive content." **ON** ⟺ any populated cognitive section. **OFF** ⟺ none (a tools-only card; a hooks-only card is also OFF).
- The cognitive bundle is what lets a composed **mind** grow over time. Framed honestly: growth is **over versions** — author → version → re-publish → re-stack — not runtime self-modification (v1 cards are immutable; runtime writeback is reserved, per analysis 74 Deferred).
- The card↔mind conflation is retained: every card is a mind card; Cognitive Evolution is a *property of* the card, not a new card type. No `type` discriminator is introduced (consistent with analysis 74).

**Boundary — what is and isn't cognitive:**

| Content | Cognitive? | Evidence |
|---|---|---|
| `persona`, `beliefs`, `memory.{l4,l5,l6}` | **Yes** | the section-walk in `visibility.ts:42-57` |
| `skills`, `servers` (MCP), `hooks` | No (tool content) | hooks materialize via a separate path (`sync-mind.ts:210`); the walk never reads them |

---

## Data Model

**Source of truth (unchanged):** the manifest's optional `persona` / `beliefs` / `memory` sections (`cli/core/card-manifest.ts:39-41`). Validation already requires `visibility` on any populated section (`card-manifest.ts:109-111`).

**Derived property:** `CognitiveEvolutionState`, computed from a `CardManifest`:

```ts
interface CognitiveEvolutionState {
  enabled: boolean;                       // persona || beliefs || memoryLayers.length > 0  (presence)
  persona: boolean;
  beliefs: boolean;
  memoryLayers: MemoryLayerName[];        // populated layers, l4/l5/l6 order
  visibilities: MindContentVisibility[];  // populated sections that also set visibility
}
```

- `enabled` is **presence-based**, independent of `visibility` — an honest predicate even for an (invalid) section that omits visibility.
- `visibilities` collects only sections with both `include>0` and `visibility` set — this is precisely the input today's strictest-visibility uses, so behavior is preserved exactly.

**Persisted vs computed:**

| Artifact | Field | Status |
|---|---|---|
| `card.json` (authored manifest) | persona/beliefs/memory sections | unchanged; **no** stored `cognitiveEvolution` flag |
| `card.lock` | — | unchanged; no new field; no `lockfileVersion`/floor bump |
| `generated/minds/<card>/mind.json` (per-card index) | **`cognitiveEvolution: boolean`** | **added** (derived, regenerated each `drwn write`) |
| `generated/minds.json` (registry, `{version:1, minds:[]}`) | per-entry **`cognitiveEvolution`** | **added**; top-level `version` stays `1` |
| `generated/mind/mind.json` (composed, `schemaVersion:1`) | — | **untouched** |

**Consumer boundary (why this is safe):** the **composed** `generated/mind/mind.json` is what the runtime (CCH) mounts at `/mnt/mind/` — and this architecture **does not modify it**. The added field lives on the **per-card** index and the registry, which are read by-key (`mind list`, the `inspect-harness` skill) — an unknown extra key is ignored. No published JSON schema exists for these artifacts, so there is nothing to version. **No `schemaVersion`/`version` bump is warranted**; bumping would falsely signal a break to consumers that never read the field.

---

## Module Architecture

The cognitive-section walk is duplicated across four sites today; the target consolidates it behind one predicate.

| Site (today) | Walk it performs | Target |
|---|---|---|
| `visibility.ts:42-57` `cardManifestStrictestVisibility` | persona/beliefs/memory, gated on `include>0 && visibility` | delegates: `strictest(cognitiveEvolution(m).visibilities)` |
| `sync-mind.ts:238-242` | `hasPersona`/`hasBeliefs`/`memoryLayers`, gated on `include>0` | reads from the predicate |
| `card-manifest.ts:185-200` | validates each section shape | unchanged (validation stays section-by-section) |
| `card-source.ts:558-572` | enumerates source dirs / manifest includes | may reuse the predicate for surfacing |

**Module placement (resolves the import cycle):** `visibility.ts` already imports from `card-manifest.ts`. The predicate therefore lives in a **new `cli/core/cognitive-evolution.ts`** that imports only types from `card-manifest.ts` and returns the raw `visibilities` (not the strictest). `visibility.ts` imports the predicate; `cardManifestStrictestVisibility` becomes a thin `strictest(...)` over `state.visibilities`.

```
card-manifest.ts            (types: CardManifest, MemoryLayerName, MindContentVisibility)
      ▲           ▲
      │           │
cognitive-        visibility.ts  ──imports──▶ cognitive-evolution.ts
evolution.ts                                  (strictest delegates here)
```

Dependency direction `visibility.ts → cognitive-evolution.ts → card-manifest.ts` — acyclic. `CognitiveEvolutionState` is the one new shared type, exported from the new module.

---

## Surfacing Architecture

The computed property is exposed on three surfaces, plus the generated index that backs them.

```
manifest ─▶ cognitiveEvolution(manifest) ─▶ CognitiveEvolutionState
                                                   │
        ┌──────────────────────────────┬──────────┴───────────┬─────────────────────┐
        ▼                              ▼                       ▼                     ▼
  push gate                  generated index            consumer CLI           authoring CLI
  (visibility.ts:66:         mind.json /                mind list (column +     card source show
   OFF ⇒ skip)               minds.json:                json) ; card show       (table row)
                             cognitiveEvolution          (row + json field)
```

- **Generated index** — `sync-mind.ts` writes `cognitiveEvolution: cognitiveEvolution(card.manifest).enabled` into the per-card `index` and the returned registry entry.
- **`drwn mind list`** — `readInstalledMinds` (`list.ts:61-69`) is widened to carry the field (a shared `MindRegistryEntry` type replaces the ad-hoc `{name,version}` cast); a column is added to the table and the field flows into `--json` via the existing spread. The `card.lock` fallback path (no manifest available) defaults to OFF — a documented limitation, not a silent gap.
- **`drwn card show`** — adds a row + a `cognitiveEvolution` JSON key, computed from `card.manifest` in scope.
- **`drwn card source show`** — adds an on/off row from `readCardSourceState` (the authoring side). The `--json` output-contract (`test/commands-output-contracts.test.ts:54`) is part of this surface and is updated in lockstep. (`card source doctor` is **not** used — its human output short-circuits on `report.ok`.)

**Shared type:** the per-card registry entry — currently an unnamed inferred type in `sync-mind.ts` decoupled from `MindListEntry` in `list.ts` — is unified into one exported `MindRegistryEntry` so the new field is typed end-to-end.

---

## Terminology Architecture

- **User-facing umbrella:** "Cognitive Evolution" (the property) over the cognitive bundle (persona, beliefs, memory). Replaces "mind content" in CLI copy (`visibility.ts:73,79`; `push.ts:41`; the `card-source.ts:245` label) and docs.
- **Internal identifiers:** `MindContent*` → `CognitiveEvolution*` across `card-manifest.ts` / `card-source.ts` / `card-store.ts` / `card-lock.ts` / `visibility.ts`. Non-breaking — none are persisted on disk.
- **Unchanged on-disk vocabulary:** the section keys `persona` / `beliefs` / `memory` (and `l4/l5/l6`), the `generated/minds*` paths, `activeMinds`, the lockfile fields. Cognitive Evolution is the *umbrella name*, not a per-section rename.

---

## Relationship to the Existing Architecture (risk map)

| Layer | Today | Change | Risk |
|---|---|---|---|
| `card-manifest.ts` | section types + validation | add `MindContentVisibility`→`CognitiveEvolutionVisibility` alias rename only | low |
| `cognitive-evolution.ts` | — | **new** module: predicate + `CognitiveEvolutionState` | low (new, isolated) |
| `visibility.ts` | inline strictest walk | delegate to predicate | low (parity-tested) |
| `sync-mind.ts` per-card index | `hasPersona`/… inline | add `cognitiveEvolution`; read from predicate | low (additive) |
| `mind list` | `{name,version,active}` | shared type + column + json | medium (type widening + lock fallback) |
| `card show` / `card source show` | field tables | add row/field; update source-show contract | medium (output contract) |
| `MindContent*` identifiers | in 5 core files | mechanical rename | medium (churn, typecheck-guarded) |
| docs | "mind content" / tool-only-vs-mind | reframe term + the `minds.md:20` un-conflation line; introduce narrative | low |
| CCH / composed `mind/mind.json` | mounts composed artifact | **none** | none |

The conceptual shift is small (name an existing computed distinction); the code change is additive over the existing predicate, with one genuine consolidation (the four walks → one) and one mechanical rename.

---

## Backward Compatibility & Consumers

- **Additive everywhere.** New field on regenerated output; consumers read by key. The headline consumer (CCH) mounts the composed artifact this plan does not touch.
- **No version-floor bump.** Floors (`card-lock.ts:48-49`, `MINDS_MIN_DRWN_VERSION`) key off `lockfileVersion`, which is unchanged.
- **Release:** additive feature ⇒ minor bump (0.6.0 → 0.7.0) + CHANGELOG entry. No schema doc to update.

---

## Deferred / Out of Scope

- **Submodule term drift** — the `darwinian-minds-skills` skill `author-mind-content` carries the old term; cosmetic, non-breaking, a separate-repo change.
- **Stored/persisted `cognitiveEvolution` or a per-card-index `schemaVersion`** — not warranted; the property is derived and the artifact is regenerated. Revisit only if a strict external consumer ever needs to pin the index shape.
- **Runtime "evolution" mechanics** (memory writeback, Mind Cloud, refinery import) — reserved per analysis 74; the "Cognitive Evolution" name describes growth-over-versions today, not a runtime engine.
- **Un-conflation / unit rename** — explicitly rejected (analysis 85).

## Findings

1. The property already exists in the codebase as a presence test (`cardManifestStrictestVisibility() !== null`); the architecture's job is to name it, centralize it, and surface it — not to add a mechanism.
2. The only genuine engineering is the predicate consolidation (four walks → one, with the import-cycle-safe module placement) and the `mind list` type widening; everything else is additive or mechanical.
3. The change is fully backward-compatible and touches no schema, lockfile, on-disk path, composed artifact, or cross-repo dependency.
