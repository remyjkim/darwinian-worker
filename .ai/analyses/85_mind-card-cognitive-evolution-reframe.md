# ABOUTME: Decision record for retaining the "mind card" unit name and reframing the tool-only-vs-full distinction as a single "Cognitive Evolution" on/off property (= persona + beliefs + memory L4/L5/L6).
# ABOUTME: Records why the rename/un-conflation was explored and rejected; the target architecture lives in analysis 86 and the build plan in task 62.

# Mind Card — "Cognitive Evolution" Reframe (Decision Record)

**Date**: 2026-06-29
**Author**: Claude + Remy
**Status**: Decision recorded — target architecture in analysis 86, plan in task 62
**Supersedes**: the earlier "Capability Card Rename & Reframe" draft at this path (rename rejected)
**Target architecture**: `.ai/analyses/86_cognitive-evolution-target-architecture.md`
**Implementation plan**: `.ai/tasks/62_cognitive-evolution-reframe-implementation-plan.md`
**References**: [.ai/analyses/86_cognitive-evolution-target-architecture.md, .ai/tasks/62_cognitive-evolution-reframe-implementation-plan.md, .ai/analyses/74_canonical-mind-card-target-architecture.md, .ai/analyses/75_mind-card-activation-defaults-and-stack-composition.md, .ai/analyses/62_mind-as-card-substrate-evaluation.md, cli/core/card-manifest.ts, cli/core/visibility.ts, cli/core/card-source.ts, cli/commands/card/push.ts, docs-docusaurus/docs/concepts/minds.md]

---

## Executive Summary

We investigated renaming the canonical card unit ("Mind Card" → "Capability Card") and un-conflating "card" (the part) from "mind" (the composed whole). After a structured, adversarially-judged design exploration of seven naming models, **we decided NOT to rename and NOT to un-conflate.** Every un-conflation leaves a residual seam, and splitting "card" from "mind" tested as *more* confusing than the existing conflation, not less.

Instead we keep today's model — **the unit is a "mind card" (canonical card); a card carrying only skills/hooks/servers is a tools-only card, one carrying cognitive content is a full mind card** — and we **reframe that existing distinction as a single legible property: Cognitive Evolution ON / OFF.**

- **Cognitive Evolution = the whole cognitive bundle = persona + beliefs + memory (L4/L5/L6).** It is the user-facing umbrella for what the code currently calls *"mind content."*
- **OFF** (no persona/beliefs/memory) = **tool-only mind card.** **ON** (carries any of them) = **full mind card.**

This is a **reframe, not a mechanism.** "Cognitive Evolution on/off" maps exactly onto a distinction the code already makes by *presence* — a card has cognitive content iff it declares a persona/beliefs/memory section, and the strictest-visibility helper (`visibility.ts:42`) already returns `null` for tool-only cards. The engineering substance is small and contained: **(1)** rename the user-facing "mind content" copy to "Cognitive Evolution"; **(2)** consolidate the duplicated section-walk behind one canonical `cognitiveEvolution(manifest)` predicate and surface its `enabled` flag on the per-card generated index + in `mind list`/`card show`; **(3)** reframe the tool-only/full wording in docs. **No unit rename, no `card.json`/lockfile schema change, no on-disk artifact rename, no cross-repo submodule coordination, no migration.** The durable target architecture is in `.ai/analyses/86_cognitive-evolution-target-architecture.md`; the verified, file:line change list is in `.ai/tasks/62_cognitive-evolution-reframe-implementation-plan.md`.

One honest caveat carried from the exploration: "evolution" names an *aspiration*, not a shipped runtime mechanism — v1 cards are immutable and memory writeback is reserved. The docs must frame Cognitive Evolution as *the cognitive layer that lets a mind grow as you refine and re-publish cards over time*, not as live self-evolution.

---

## The Decision (settled model)

| Aspect | Decision |
|---|---|
| Unit name | **Unchanged** — "mind card" / "card". The card↔mind conflation is *deliberately retained*. |
| The tool-only vs full distinction | **Kept**, but surfaced as one property. |
| Property name | **Cognitive Evolution** (ON / OFF). User-facing umbrella for persona + beliefs + memory. |
| Scope of the property | **The whole cognitive bundle**: persona + beliefs + memory (L4/L5/L6 — three memory tiers). |
| Polarity | **OFF** = no cognitive content = *tool-only mind card*; **ON** = carries cognitive content = *full mind card*. |
| Mechanism | **Presence-based** — Cognitive-Evolution-ON ≡ "card declares any persona/beliefs/memory section". No new flag. |
| Relationship to "mind content" | "Cognitive Evolution" is the new user-facing name; "mind content" is the existing internal term it replaces (rename optional). |

This gives crisp answers to the questions that opened the investigation, *without* un-conflating: a mind card is the canonical unit; whether it is "tool-only" or "full" is simply whether **Cognitive Evolution** is on.

---

## Decision Journey & Design Exploration

The reframe was chosen after, and because of, a rigorous exploration — recorded here so the rejected paths are not silently reopened.

**What was explored and rejected:**
1. **Rename "Mind Card" → "Capability Card"** — rejected: "capability" mis-describes the cognitive half (persona/beliefs/memory are not "capabilities"), and it overloads "mind" across part and whole.
2. **Un-conflate card (part) from mind (whole)** — rejected: Remy found "card vs mind" more confusing than the conflation; every un-conflation model carried an irreducible seam.

**Method:** ground in prior analyses (74/75/62) so as not to re-derive rejected reasoning → develop seven naming models across distinct metaphor families → score each against nine criteria with two independent adversarial judges → synthesize.

**Ranking (avg of two judges, /45):**

| Score | Model | Why it lost (or won) |
|---|---|---|
| 38.5 | Card-and-Mind (drop the qualifier) | Cleanest un-conflation by subtraction — but still an un-conflation, which Remy ultimately declined. |
| 34.5 | Layer-Merge | "layer" collides with the public "Layered Model" concept. |
| 34.5 | Capability-Card (Model C) | Re-legitimizes a per-card "mind" label; prose-only fix. |
| 34 | Card-Game / Loadout | "loadout" connotes static swapping, fights the evolution thesis. |
| 34 | Minimal-Change | Keeps "mind card", fixes only docs. **Closest to the decision taken.** |
| 33 | Biological-Genome (Trait) | Renames the deepest noun *and* over-promises unbuilt evolution. |
| 32 | Plugins → Minds | "plugin" is owned by the host product (Claude Code). |

**The pivotal finding:** the real fork was not *which name* but *whether to touch the substrate at all*. The honest floor of the "don't touch it" branch was **Minimal-Change** (keep "mind card", fix the narrative). The decision is a Minimal-Change landing **plus** a concrete, brand-aligned reframe of the tool-only/full distinction into the **Cognitive Evolution** toggle.

---

## Why It's Low-Cost — a Reframe, Not a Mechanism

The model already encodes the exact distinction Cognitive Evolution names, by *presence of cognitive sections*, and the predicate is **already implemented**:

- `cli/core/visibility.ts:42-57` `cardManifestStrictestVisibility(manifest)` walks `persona`, `beliefs`, and `memory.{l4,l5,l6}` and returns the strictest declared visibility, or **`null` when none are present**. That `!== null` test is, today, exactly "this card has cognitive content" — i.e. **Cognitive Evolution ON**.
- The push gate consumes it: `evaluatePushGate` (`visibility.ts:66-69`) treats `cardVisibility === null` (no cognitive sections) as "skip the gate" — the tool-only path. So the OFF/ON branch is already live in the push flow.
- The per-card materialization index already computes the section booleans: `sync-mind.ts:238-242` emits `hasPersona`, `hasBeliefs`, `memoryLayers` into each card's `mind.json` / `minds.json` entry.

So there is **no new boolean to add to `card.json`**, no lockfile bump, no on-disk path change. Cognitive Evolution is a *name + a canonical predicate + a UX surfacing* over a computed property the system already derives.

---

## Target Architecture & CLI Change List

The durable "after" state — the conceptual model, data model, the canonical `cognitiveEvolution()` predicate and its import-cycle-safe module placement, the surfacing architecture, the terminology architecture, and the risk map — lives in its own document: **`.ai/analyses/86_cognitive-evolution-target-architecture.md`**. The verified, TDD-ordered, file:line change list lives in **`.ai/tasks/62_cognitive-evolution-reframe-implementation-plan.md`**.

In brief: introduce one `cognitiveEvolution(manifest)` predicate (new `cli/core/cognitive-evolution.ts`) that the four duplicated section-walks delegate to; refactor `cardManifestStrictestVisibility` onto it; add an additive `cognitiveEvolution: boolean` to the generated per-card index; surface on/off in `mind list` / `card show` / `card source show`; rename user-facing "mind content" copy and the internal `MindContent*` identifiers to "cognitive evolution"; reframe the docs (keeping the conflation). No `card.json`/lockfile/on-disk/cross-repo change.

---

## What Does NOT Change

Explicitly out of scope — no work, no migration:
- The unit name ("mind card"/"card"), `card.json`, `CardManifest`, the `drwn card` / `drwn mind` CLI namespaces, the product name `darwinian-minds`.
- On-disk artifacts: `generated/minds/`, `minds.json`, per-card `mind.json`, singular `generated/mind/`, `activeMinds` config key.
- The lockfile schema/version; the section keys `persona`/`beliefs`/`memory`.
- The `darwinian-minds-skills` submodule and the external `dm-cards-catalog-v1` catalog — **no cross-repo coordination** (the earlier rename would have required renaming `apply/author/share-mind-card`; the reframe does not).

---

## The "Evolution" Credibility Note

Carried from the exploration grounding, and load-bearing for the docs: **nothing evolves at runtime in v1.** Cards are immutable; runtime memory delta / Mind Cloud writeback / the refinery import path are all explicitly reserved (analysis 74, Deferred/Reserved). A card's persona/beliefs/baked-memory is static once published.

Therefore "Cognitive Evolution" must be framed as **the cognitive layer that lets a *mind* grow over time — as you refine, version, and re-publish cards, and as you layer more cards into the active stack** — not as a self-modifying runtime engine. Landing/docs copy that implies live self-evolution would reintroduce the exact "Darwinian-as-dead-brand-word" credibility gap the exploration flagged. Framed as trajectory-over-versions, the term is honest and on-brand.

---

## Findings

1. The rename ("Capability Card") and the un-conflation (card vs mind) were explored rigorously and **rejected**; the conflation is retained by deliberate choice.
2. The chosen reframe is **presence-based and additive** — it names an existing computed distinction; it does not introduce a flag, a schema change, or a migration.
3. Implementation churn is **low and entirely in-repo**: ~4 user-facing strings, one consolidated `cognitiveEvolution(manifest)` predicate + surfacing it on the generated index and in `mind list`/`card show`, an optional internal `MindContent*` rename, and docs that adopt "Cognitive Evolution on/off". No cross-repo work.
4. "Cognitive Evolution" is brand-aligned but describes an **aspiration** (immutable v1 cards); docs must frame it as growth-over-versions, not runtime self-evolution.
5. The earlier investigation's surface maps (CLI/schema/docs/tests/skills) remain accurate; most of their *rename-specific* scope is now moot because nothing is renamed.

## Open Sub-Decisions

1. **Internal rename or not?** Surface "Cognitive Evolution" in user-facing strings/docs only (cheapest), or also rename the internal `MindContent*` identifiers for code/docs coherence (recommended, non-breaking).
2. **Term casing/usage:** "Cognitive Evolution" (title case, as a named product property) vs "cognitive evolution" (lowercase descriptor). Recommend title case when naming the on/off property, lowercase in running prose.
3. **CLI surfacing:** add the computed "Cognitive Evolution: on/off" field to `card show`/`doctor`/`mind list`? (Recommended, low effort.)
4. **Persona/beliefs naming under the umbrella:** keep per-section names (`persona`/`beliefs`/`memory`) and let "Cognitive Evolution" be only the umbrella — confirmed by the "whole cognitive bundle" decision; no per-section rename.

(The detailed, verified change list lives in **Changes to the drwn CLI** above — Tiers A–D.)
