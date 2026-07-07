# ABOUTME: Design-capture of the persona/beliefs/memory "advanced context management" system being descoped from the canonical card in task 69 (D-E), preserved so it can be rebuilt later as a separate pluggable capability card.
# ABOUTME: The implementation lives in git history at the pre-descope SHA below; this doc records the schema, storage, materialization, authoring, doctor, and visibility model so the feature is reconstructable without archaeology.

# Analysis 103 — Persona / Beliefs / Memory: Capability-Card Design Capture

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Reference — preservation record for a descoped feature
**Pre-descope SHA**: `1c92ae437964b480721be91474bd8b49b7490562` (last commit before task 69 W1; the full implementation is recoverable here)
**References**: [.ai/analyses/100_workers-cli-target-architecture-and-decisions.md, .ai/analyses/101_workers-cli-implementation-strategy.md, .ai/tasks/69_worker-migration-unified-sequential-plan.md, .ai/analyses/92_mind-card-lifecycle-storage-and-update-model.md]

---

## Purpose

Task 69 removes persona/beliefs/memory (the "advanced context management" system) from the **canonical** card, which becomes capability-only (skills/hooks/MCP). Per decision D-E, the code is deleted (not quarantined as dead code) and preserved via git history + this capture. The intent: rebuild it later as a **separate, optional capability card** users plug in only when they want persona/beliefs/memory. This doc records everything needed to reconstruct it faithfully.

## What the feature was

A card could carry, alongside its capabilities, three kinds of "mind content":
- **persona** — stable voice / operating style, authored as `persona/<entry>/PERSONA.md`.
- **beliefs** — durable principles / decision rules, authored as `beliefs/<entry>/`.
- **memory** — layered memory in three tiers **l4 / l5 / l6**, each `memory/<layer>/<entry>/`, with a per-layer `format` of `md | jsonl | mixed`.

When multiple cards were active, their persona/beliefs/memory were **composed in active-stack order** into a single `generated/mind/` bundle (persona concatenated; beliefs/memory linked with provenance). Nothing in the CLI read this bundle back at runtime — it was an authored/materialized artifact consumed by external agent tooling.

## Schema (manifest types — `cli/core/card-manifest.ts`)

```typescript
export type MindContentVisibility = "private" | "internal" | "public";
export type MemoryLayerName = "l4" | "l5" | "l6";
export type MemoryFormat = "md" | "jsonl" | "mixed";

export interface MindContentManifest {
  include?: string[];                 // entry names to include
  visibility?: MindContentVisibility; // required when include is non-empty
  exclude?: string[];                 // NOT allowed in card manifests (composed-only concept)
  shared?: string[];                  // NOT allowed in card manifests (Wave 2)
}
export type PersonaManifest = MindContentManifest;
export type BeliefsManifest = MindContentManifest;
export interface MemoryLayerManifest extends MindContentManifest { format?: MemoryFormat; }
export type MemoryManifest = Partial<Record<MemoryLayerName, MemoryLayerManifest>>;

// On CardManifest: persona?: PersonaManifest; beliefs?: BeliefsManifest; memory?: MemoryManifest;
```

**Validation** (`validateMindContentSection`, card-manifest.ts pre-descope :82-128): `exclude`/`shared` rejected on cards; `include` must be an array of safe path parts; `visibility` required when `include` non-empty and constrained to the three values; `format` allowed only on memory layers and constrained to `md|jsonl|mixed`; memory layers restricted to `l4|l5|l6`.

## Storage

- **Source (authoring):** `sources/@scope/name/{persona,beliefs,memory/{l4,l5,l6}}/<entry>/`, with `PERSONA.md` for persona and `.md`/`.jsonl` for memory per `format`.
- **Lock:** `CardLockEntry.persona/beliefs/memory` (card-lock.ts pre-descope :34-36), normalized from the manifest at write (:91-96), validated by `validateMindContentLockSection`/`validateMemoryLock`/`validateMemoryLayerLockSection`/`validateMemoryFormat` (:233-345).
- **Version floor:** presence of mind content raised the lock's `minDrwnVersion` via `hasMindContent` → `MINDS_MIN_DRWN_VERSION` (card-lock.ts pre-descope :105-109) — distinct from `HOOKS_MIN_DRWN_VERSION`.

## Materialization (`cli/core/mind-generator/sync-mind.ts`)

- **Per-card** (`materializeMind`, pre-descope :169-277): persona → `persona.md` (concatenated from `persona/<entry>/PERSONA.md` with fence comments via `personaContent` :99-115); beliefs/memory → linked dirs via `materializeDir`; `mind.json` index recorded persona/beliefs/memory presence.
- **Composed** (`materializeComposedMind`, pre-descope :279-379): merges active cards in order into `generated/mind/`. Index shape:

```jsonc
{
  "schemaVersion": 1,
  "activeMinds": ["@me/base", "@me/overlay"],     // ordered active stack
  "persona": { "path": "persona.md" | null, "entries": [{ "card", "entry" }] },
  "beliefs": { "entries": [{ "card", "entry", "path", "visibility" }] },
  "memory": { "l4": {entries:[...]}, "l5": {...}, "l6": {entries:[...], format?} },
  "sources": [{ "card", "version", "integrity" }],
  "drwnVersion": "<DRWN_VERSION>"
}
```

The composed dir resolver was `resolveGeneratedComposedMindDir` → `generated/mind/` (store-paths.ts pre-descope :173).

## Authoring surface

- Core: `addCardSourcePersona`/`remove`, `addCardSourceBelief`/`remove`, `addCardSourceMemory`/`remove` (card-source.ts pre-descope :805-1057); templates (:789-803):
  - persona: "Capture stable voice, operating style, and collaboration preferences here."
  - belief: "Capture durable beliefs, principles, and decision rules here."
  - memory: "Capture durable memory notes here." / jsonl: `{"type":"memory","name","content":""}`.
- Commands: `cli/commands/card/source/{add,remove}-{persona,belief,memory}.ts` (6), registered in `cli/index.ts`.
- Publish validation: `validatePublishedMindContentDirs` (card-store.ts pre-descope :356-395).
- Doctor: persona/beliefs/memory dir scanning + issue codes (`orphaned_persona_dir`, `missing_belief_md`, `missing_memory_jsonl`, l6-size warning, …) in `card-source.ts` (pre-descope :555-711).

## Visibility model (tied to the push gate)

`cardManifestStrictestVisibility` (visibility.ts pre-descope :42-57) computed a card's visibility **solely** from persona/beliefs/memory visibility (strictest wins). It fed `evaluatePushGate` (`cli/commands/card/push.ts`) to block pushing private content. Skills/hooks/MCP had no visibility concept — so **card visibility was a pure persona/beliefs/memory feature** and retires with it (D-C). The future pluggable card should re-introduce visibility + the push gate for its own content.

## How to rebuild as a pluggable capability card

- Ship persona/beliefs/memory as a card whose manifest defines its own `persona/beliefs/memory` sections (this exact schema), materializing its own `generated/` bundle — resolved through the standard card pipeline, not special-cased in the core.
- Re-home visibility + the push gate as that card's concern.
- Composition/ordering: the active-stack ordering (`activeWorkers`, post-rename) still exists and can drive layering if the pluggable card opts in.
- Reuse this schema verbatim; recover the implementation from the pre-descope SHA.

## Appendix — file:line map (pre-descope)

- `cli/core/card-manifest.ts`: types :11-29, fields :41-43, `validateMindContentSection` :82-128, wiring :214-229.
- `cli/core/card-lock.ts`: fields :34-36, floor :105-109, validators :233-345.
- `cli/core/mind-generator/sync-mind.ts`: `personaContent` :99-115, `materializeMind` p/b/m blocks :177-216, `materializeComposedMind` :279-379.
- `cli/core/card-source.ts`: authoring :805-1057, templates :789-803, doctor :555-711, state types :48-99.
- `cli/core/card-store.ts`: `validatePublishedMindContentDirs` :356-395 (calls :675,761,802,846).
- `cli/core/visibility.ts`: `cardManifestStrictestVisibility` :42-57.
- `cli/core/store-paths.ts`: `resolveGeneratedComposedMindDir` :173.
- `cli/commands/card/source/{add,remove}-{persona,belief,memory}.ts`; `cli/index.ts` registration.
