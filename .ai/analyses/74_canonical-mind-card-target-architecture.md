# ABOUTME: Target architecture for the canonical "mind card" — one unified card (no type discriminator) that is a superset of today's harness card plus persona/beliefs/memory, with per-mind isolation and activation-time layering.
# ABOUTME: Supersedes the typed-mind-card design (task 46); grounds the darwinian-mind rebrand's card-unit rename.

# Canonical Mind Card — Target Architecture

**Date**: 2026-06-25
**Author**: Claude + Remy
**Status**: Architecture approved; implementation plan exists in `.ai/tasks/53_canonical-mind-card-implementation-plan.md`
**Supersedes**: `.ai/tasks/46_drwn-mind-card-implementation-plan.md`, `.ai/analyses/63_drwn-mind-card-target-architecture.md` (typed `type: "mind"` approach)
**References**: [.ai/analyses/72_darwinian-mind-rebrand-strategy.md, .ai/analyses/62_mind-as-card-substrate-evaluation.md, .ai/analyses/65_mind-card-l3-l4-l5-scenarios.md, .ai/analyses/73_session-signal-vs-card-hooks-architecture-decision.md, cli/core/card-manifest.ts, cli/core/card-source.ts, cli/core/card-store.ts, cli/core/card-project.ts, cli/core/card-lock.ts, cli/core/sync.ts, cli/core/effective-state.ts, cli/core/mcp.ts, cli/core/hook-generator/sync-hooks.ts, cli/core/store-paths.ts]

---

## Executive Summary

The "mind card" was fully designed (task 46 / analysis 63) but never implemented. That design added a `type: "mind"` discriminator and treated mind cards as a *special, singular* card type distinct from "harness cards". This architecture **replaces that** with a simpler, more ambitious model decided in brainstorming with Remy:

- **There is one card. A card *is* a self-contained mind.** No `type` discriminator. "Card" and "mind card" are synonyms. A card carrying only `skills`/`hooks`/`servers` is a tools-only mind; `persona`/`beliefs`/`memory` make it a richer mind.
- **A project may host *multiple* minds** — e.g. a frontend-specialist mind and a backend-specialist mind side by side. The old "one mind per project" rule is removed.
- **Minds are isolated, then layered.** Each mind materializes into its **own self-contained bundle** under `.agents/drwn/` (persona/beliefs/memory **and** its own skills/hooks/mcp). Composition is no longer implicit-at-install; it is **explicit-at-activation**: `drwn mind use <name…>` activates an ordered **stack** of minds that are layer-merged (precedence: later wins) into the active IDE/runtime surface. A single mind is the degenerate one-element stack.
- **`effective-state` and `sync` are repurposed, not torn down.** `effective-state`'s merge engine is reused as the layer-merge over the active stack; `sync` gains an additive per-mind materialization pass and feeds its existing project-surface writers a smaller, ordered input. The only behavior retired is sync's *unconditional* merge of every installed card into the project surface.
- **Scope is "everything"** — persona, beliefs, three-tier memory (L4/L5/L6), per-layer visibility + push-time gate — **except** the project-bound "space/app mind", whose name and the `.agents/drwn/minds/` location are **reserved** but whose mechanics are deferred.

This rides on the `darwinian-mind` rebrand (analysis 72): the rebrand is naming-only and lands first; this architecture is the substance behind the renamed "mind card" unit. It also integrates with the landed hooks baseline — card **policy** hooks (PR #14), conditional hook ownership (PR #17 / Task 54), and **signal** hooks (PR #18 / Task 55) — whose shared `settings.json` `hooks` writer uses a conditional-ownership model (analysis 73, Option 1) that the activation projection depends on.

---

## Context

Drwn today distributes **harness cards**: a card bundles `skills`, `hooks` (policy modules), `servers` (MCP), `extensions`, `targets`. It has git-backed publish/resolve, lockfile v3 with hook-consent, integrity hashing, and a `sync` that **merges all installed cards into one project-global surface** (`.claude`/`.codex`/`.cursor`) plus `.agents/drwn/generated/…`.

The product is being rebranded `darwinian-harness` → `darwinian-mind` (analysis 72). The unit "harness card" becomes "mind card", and — per Remy — the notion of distinct card *types* is removed: there is one canonical card. This document defines what that one card **is** and how multiple of them run in a project.

The design was settled through brainstorming. The decisions and their rationale are recorded inline below as **[Decided]**.

---

## Conceptual Model

**[Decided]** A **card** is a self-contained **mind** — the canonical, portable unit. There is no `type` field.

**[Decided]** A **mind** (the runnable thing) is what a card becomes when materialized. A **project hosts N minds** (N ≥ 0). Minds are independent: a runtime can run one mind, or a layered stack of several.

**[Decided]** Two multi-mind operations, one mechanism:
- **Side-by-side / independent** — run `frontend-mind` alone, `backend-mind` alone. Different stack selections.
- **Layered** — activate `[base-mind, frontend-mind]` as an ordered stack, merged into one surface.

**[Reserved, deferred]** A **space mind / app mind** is a future project-bound mind whose persona/beliefs/memory live *in the project repo* and evolve there (vs. the portable card). The term and the `.agents/drwn/minds/` location are reserved in v1; mechanics are not built.

---

## Manifest (`card.json`)

**[Decided]** Drop the never-shipped `type` discriminator. Extend today's `CardManifest` with **three always-optional, always-allowed** sections. There is no "rejected on non-mind cards" rule — every card may declare them.

```jsonc
{
  "$schema": "…",
  "name": "@scope/frontend-mind",
  "version": "1.2.0",
  // existing capabilities — unchanged shape/semantics:
  "skills":     { "include": […] },
  "hooks":      { "include": […] },      // policy hooks (PR #14)
  "servers":    { … },                    // MCP
  "extensions": { … },
  "targets":    { … },
  // new optional mind content:
  "persona": { "include": ["voice", "values"], "visibility": "internal" },
  "beliefs": { "include": ["radical-transparency"], "visibility": "internal" },
  "memory": {
    "l4": { "include": ["reflections"],  "visibility": "internal", "format": "md" },
    "l5": { "include": ["observations"], "visibility": "private",  "format": "md" },
    "l6": { "include": ["transcripts"],  "visibility": "private",  "format": "jsonl" }
  }
}
```

Field semantics (carried from analysis 63, minus the type gate):
- `visibility ∈ {private, internal, public}`, **required** on any persona/beliefs/memory-layer with a non-empty `include`. No default — explicitness is load-bearing for the push gate.
- `memory.format ∈ {md, jsonl, mixed}`, default `md`.
- Entry names validated safe (no slashes/dots/traversal) via the existing `isSafeEntryName` pattern.

Memory layer meaning (the refinement model, analysis 62/65): **L4** = synthesized reflections/opinions (stable), **L5** = curated observations indexing L6, **L6** = raw trajectory (high volume; Git LFS deferred — v1 stores L6 as ordinary in-tree text).

---

## Source Authoring Layout

Extends today's source tree; mind dirs are additive.

```
~/.agents/drwn/sources/<name>/
  card.json
  skills/<skill>/SKILL.md           # unchanged
  hooks/<hook>/policy.ts            # unchanged (policy hooks)
  mcp-servers/<id>.json             # unchanged
  persona/<entry>/PERSONA.md        # new
  beliefs/<entry>/BELIEF.md         # new
  memory/l4/<entry>/…               # new (md / jsonl / mixed)
  memory/l5/<entry>/…
  memory/l6/<entry>/…
```

New authoring mutators mirror the existing `addCardSourceHook`/`addCardSourceSkill` shape:
`addCardSourcePersona`, `addCardSourceBelief`, `addCardSourceMemory` (+ removes), and `readCardSourceState` extended to walk persona/beliefs/memory and surface them in `card source doctor`.

---

## Materialization — Per-Mind Isolation

**[Decided]** The old single `generated/mind/` and the one-mind-per-project rule are gone. Each installed mind materializes its own **complete, isolated** bundle.

```
<project>/.agents/drwn/
  generated/
    minds/
      <scope>/<name>/
        mind.json                  # per-mind index
        persona.md                 # concatenated persona entries (machine-readable markers)
        beliefs/<entry>/BELIEF.md  # symlinks into extracted tree
        memory/{l4,l5,l6}/<entry>/…# symlinks into extracted tree
        skills/<skill>/            # THIS mind's skills (symlinks)
        hooks/composer.<ext>       # THIS mind's policy-hook composer, per runtime
        mcp/servers.json           # THIS mind's MCP server defs
    minds.json                     # registry of all installed minds
  minds/                           # RESERVED for future space minds (not written in v1)
```

- **`minds.json`** is the enumerable registry a runtime reads to discover installed minds: `[{ name, version, treeSha, integrity, path, hasPersona, hasBeliefs, memoryLayers, visibility }]`.
- **`mind.json`** (per mind) carries the entry lists, paths, per-layer visibility, treeSha/integrity, and `drwnVersion`/`writtenAt` — the consumer index CCH (or any runtime) mounts.
- **Isolation:** a mind's `skills`/`hooks`/`servers` materialize **only** into its own namespace — no cross-mind merge at this layer. A mind is genuinely self-contained.
- Beliefs/memory use symlinks into `~/.agents/drwn/extracted/<tree-sha>/…`, exactly like today's skill materialization.

Drwn stays **runtime-unaware**: it writes the bundles + registry; a runtime (CCH today) mounts whichever mind(s) it runs — the same zero-coupling pattern hooks already use.

---

## Activation & Layering

**[Decided]** Composition moves from *implicit-at-install* to *explicit-at-activation*.

- **`drwn mind use <name…>`** sets the project's **active stack** — an ordered list of one or more installed minds — and projects it into the local IDE surface. `drwn mind list` shows installed minds + the active stack; `drwn mind clear` empties it.
- **Layer-merge (precedence: later layer wins):**
  - **tools** (skills/hooks/mcp): union; on key conflict the later layer wins.
  - **persona**: concatenated in stack order with the existing machine-readable markers.
  - **beliefs/memory**: union; each entry tagged with its originating mind in the merged `mind.json` so provenance survives.
- **`effective-state` repurposed:** its merge logic is reused, but its **input changes** from "all locked cards" to "the active mind stack (ordered)". This is the core reuse that shrinks the rewrite.
- A single active mind is the degenerate one-element stack; the same code path serves both "one mind" and "layered minds".

The **canonical, always-written** artifacts are the per-mind bundles + `minds.json` under `.agents/drwn/generated/`. The IDE projection (`.claude`/`.codex`/`.cursor`) is derived from the **active stack** only — not from the whole lockfile.

---

## Tools, Hooks, and the Shared `settings.json` Writer

The IDE projection writes the active stack's tools into `.claude/settings.json`, `.mcp.json`, `.codex/config.toml`, `.cursor/mcp.json` — reusing today's writers. Two constraints from the landed hooks baseline (analysis 73, Task 54, Task 55) shape this:

- **Policy hooks** (mind-card content): each mind has its own composer (the runtime-mount artifact under `generated/minds/<name>/hooks/`), but the IDE projection registers a **single** drwn-owned `PreToolUse`/`PostToolUse` `.*` entry that bundles the **active stack's** policies in stack order. One entry, not one-per-mind — see the collision note below. Per-card **hook consent** (lockfile) still gates execution.
- **Conditional-ownership writer [implemented by Task 54; reused here]:** the projection writes hooks through Task 54's shared writer (`mergeOwnedHooks` + the `_drwn.ownedHooks` side-table), which owns only drwn-created matcher entries and preserves foreign entries. This is what lets the active stack's `.*` entry coexist with (a) the user's hand-written hooks and (b) first-party **signal hooks** (`drwn hook …`, Task 55: `Skill` matcher + matcher-less prompt events). Drift/cleanup is **per-entry**: deactivating a mind reprojects and drops only the changed stack entry.
- **Collision constraint:** Task 54 keys a matcher entry's identity by its matcher alone (`m:.*`), so the projection MUST emit a single `.*` entry for the stack; emitting one `.*` entry per active mind would collide on identity. (This resolves the earlier open question toward "one merged stack composer".)
- **Signal hooks are a foreign co-tenant**, not card content — observation-only, Claude-only, consent-free. The projection neither owns nor deletes them.
- **Terminology:** this design says **policy hooks** (mind content) vs **signal hooks** (first-party signals) to avoid the overloaded bare word "hook".

---

## Visibility & the Push Gate

**[Decided]** Adopt analysis 63's visibility model, **retriggered on section presence** instead of `type`:

- **Publish validation** (`drwn card publish`): a card declaring persona/beliefs/memory must have referenced files present, valid JSONL where `format: "jsonl"`, and `visibility` set on every non-empty layer.
- **Push gate** (`drwn card push`): compute the **strictest** visibility across all visibility-bearing sections; classify the remote (`file://`/local → private; network → unknown); refuse pushing to a less-restrictive remote unless `--remote-visibility=<v>` or `--unsafe-push-public`. **Trigger = presence of any visibility-bearing section.** A tools-only card (no persona/beliefs/memory) pushes exactly as today, unaffected.

---

## Lockfile & Integrity

- **Bump** the lockfile (v3 → v4). Each entry gains optional `persona` / `beliefs` / `memory` (entries + per-layer visibility). No `type` field. v3 lockfiles read forward with mind sections absent.
- `store.minDrwnVersion` bumped so older drwn refuses v4 rather than silently dropping mind metadata.
- **Active stack** is persisted in project config (e.g. `.agents/drwn/config.json` → `activeMinds: ["@scope/base", "@scope/frontend"]`), not in the lockfile (the lockfile records what's *installed*; the stack records what's *active*).
- Integrity hashing extends over the new persona/beliefs/memory dirs (same canonical-JSON-of-files scheme).

---

## CLI Surface

Additive, mirroring existing command families:

- **Authoring:** `card source add-persona|add-belief|add-memory <name> <entry> …` (+ `remove-*`); persona/belief/memory additions require explicit `--visibility`; memory additions also accept `--layer l4|l5|l6` and optional `--format md|jsonl|mixed`; `card source doctor` extended; `card new` unchanged (no `--type` — all cards are minds).
- **Publish/push:** existing `card publish`/`card push` gain the visibility validation + gate and `--remote-visibility` / `--unsafe-push-public` flags.
- **Activation (new family):** `drwn mind list`, `drwn mind use <name…>`, `drwn mind clear`. (`drwn mind show <name>` optional.)
- `drwn write`/sync materializes per-mind bundles + `minds.json` always, and projects the active stack to the IDE surface.

The implementation plan keeps both CLI families: `card …` manages the portable unit (author/publish/install), while `mind …` activates and runs installed units.

---

## Sync Orchestration — Extended, Not Rewritten

`syncRepository()` keeps its skeleton and its hardest-won machinery:

- **Kept:** orchestration skeleton; `write-record.json` + managed-paths tracking (safe cleanup / drift refusal); per-runtime config writers; `syncMcp`; skill-symlink machinery.
- **Added:** a **per-mind materialization pass** — for each locked card, write its isolated bundle to `generated/minds/<name>/` (a `syncMind`-style writer for persona/beliefs/memory + per-mind skills/hooks/mcp) and append to `minds.json`. Purely additive.
- **Changed:** the project-surface projection is fed the **active stack** (via repurposed `effective-state`) instead of the full lockfile, and writes hooks through the conditional-ownership writer.

**Net teardown = one behavior:** sync no longer unconditionally merges every installed card into the project surface. Everything else survives.

---

## Relationship to the Existing Architecture (risk map)

| Layer | Today | Change | Risk |
|---|---|---|---|
| `card-manifest.ts` | no `type` | add persona/beliefs/memory | additive, low |
| `card-source.ts` | skills/hooks/mcp | add persona/belief/memory mutators + dirs | additive, low |
| `card-store.ts` / `card-project.ts` | publish/resolve/install | integrity over new dirs; publish validation | low–med |
| `card-lock.ts` | v3 | v4 + mind metadata | medium |
| `effective-state.ts` | merge all cards → project | **repurposed**: merge **active stack** | medium (reuse) |
| `sync.ts` | merge to project surface | add per-mind pass; project active stack | medium |
| `mcp.ts` `mergeClaudeSettingsText` | wholesale `hooks` replace | **conditional-ownership merge** (Task 54) with signal-hook coexistence (Task 55) | medium (shared) |
| `hook-generator/sync-hooks.ts` | one composer/project | one composer **per mind** | medium |
| `card` CLI | consumer + authoring | add mind authoring + `mind use/list/clear` | medium |

The conceptual shift is large (cards are isolated minds; composition is explicit). The **code** change is largely additive over the existing sync/effective-state/write-record foundation, with one genuine behavior retirement.

---

## Sequencing (avoid a big-bang)

1. **Rebrand first** (analysis 72) — naming-only, lands on `darwinian-mind` identity, no behavior change.
2. **Additive data model** — manifest + source + authoring CLI + lockfile v4 + publish/push gate. Ships without touching the sync projection; existing cards keep working.
3. **Materialization cutover** — per-mind isolation pass + `minds.json` + `drwn mind use` + the `effective-state` reinput + conditional-ownership hook writer. This is the breaking slice (cross-card implicit composition retired); TDD hard, version as a deliberate `0.x` break with release notes. Build on the landed PR #14 / #17 / #18 hooks baseline.

---

## Deferred / Reserved (not v1)

- **Space/app mind** mechanics (project-resident evolving memory, path/scope binding) — name + `.agents/drwn/minds/` location reserved only.
- **Git LFS for L6** (v1 stores L6 in-tree); R2/S3 backing.
- **Runtime delta / Mind Cloud writeback** (cards stay immutable).
- **CCH-side mounting** of `generated/minds/` (lives in the CCH repo).
- **Refinery → mind-card import** tooling.
- **A cross-card "compose several cards into one mind" primitive** — explicitly out; layering operates over whole minds, not sub-card fragments.

---

## Sub-Decisions Resolved In Task 53 Plan

1. **Persona layering**: concatenate stacked personas in stack order.
2. **Hook ownership marker**: Task 54 implements the writer as a `_drwn.ownedHooks` side-table (event → entry-identity → hash). This design reuses it; the projection emits a single `.*` stack entry to satisfy Task 54's matcher-keyed identity. No separate marker scheme needed.
3. **`card` vs `mind` CLI families**: keep both. `card` manages the unit; `mind` activates the run.
4. **`memory.l6` interim size policy**: no LFS in v1; store L6 in-tree and surface a soft `card source doctor` warning only.
5. **Active-stack precedence on MCP/server key conflicts**: last layer wins.

---

## Findings

1. The typed-mind-card design (task 46) is **superseded**: no `type`, no one-mind-per-project, no harness-vs-mind distinction.
2. The new model is *more* capable (multiple specialized minds; explicit ordered layering) yet **smaller in code delta** than feared, because `effective-state`/`sync`/`write-record` are reused, not rebuilt.
3. The single retired behavior — implicit cross-card composition — is the deliberate, conscious break and the main migration risk for existing card users.
4. The activation projection is **coupled to the analysis-73 conditional-ownership hook writer**; this architecture should land after (or with) that writer exists.
5. Scope is full (persona/beliefs/memory/visibility) **except** space/app mind, which is reserved.

## Recommendations

1. Adopt this as the canonical mind-card architecture; mark task 46 / analysis 63 superseded.
2. Build it in the sequenced PR 1 / PR 2 shape from `.ai/tasks/53_canonical-mind-card-implementation-plan.md`, after the naming-only rebrand is present.
3. Preserve the Task 54/55 hook coexistence constraints: one active-stack `.*` policy-hook entry, plus signal-hook entries when enabled.
