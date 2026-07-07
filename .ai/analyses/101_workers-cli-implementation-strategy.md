# ABOUTME: Implementation-strategy investigation for the Workers CLI migration — the concrete blast-radius, sequencing, and residual decisions behind achieving the analysis-100 target architecture.
# ABOUTME: Synthesizes the rename inventory, the persona/beliefs/memory descope, the Blueprint-artifact design, and the deploy-handoff delta into a staged, TDD-gated plan-of-plans; basis for the .ai/tasks drafts.

# Analysis 101 — Workers CLI: Implementation Strategy

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Draft — investigation complete; residual forks in §5; basis for task plans
**References**: [analyses/100_workers-cli-target-architecture-and-decisions.md, analyses/97_worktree-vendored-card-architecture.md, cli/core/mind-generator/sync-mind.ts, cli/core/card-manifest.ts, cli/core/card-lock.ts, cli/core/card-source.ts, cli/core/effective-state.ts, cli/core/skills.ts, cli/core/sync.ts, cli/commands/cloud/deploy.ts]

---

## Executive Summary

Analysis 100 ratified the target: **Capability Cards → Worker Blueprints → Workers → Scalon Foundry**, with a hard rename (`mind`/`cloud` → `worker`), persona/beliefs/memory descoped from the canonical card, a Blueprint modeled as a `kind:"blueprint"` card, and deploy pointed at a versioned Blueprint ref. This doc is the concrete blast-radius investigation and the staged implementation strategy.

The single most important finding: **the "mind bundle" is largely redundant, and once persona/beliefs/memory leaves it, the composed-mind artifact collapses entirely.** Verified empirically — the real tool projection (skills/MCP/hooks into `.claude/`, `.codex/`, etc.) resolves from the **lock + vendored content roots**, *not* from `generated/minds/`. The only readers of the generated mind artifacts are `drwn mind list` (name+version, with a `card.lock` fallback) and the composed-dir prune. So descoping persona/beliefs/memory is near-zero runtime risk, and it opens a fork on how far to collapse the now-vestigial `sync-mind` machinery.

The work decomposes into **four staged, TDD-gated tasks**, sequenced **descope → rename → blueprint → deploy** (never rename code you are about to delete). The residual decisions in §5 (collapse depth, lock read-tolerance, visibility, quarantine mechanism, blueprint-expansion shape) are surfaced for ratification before the task plans are drafted.

## Context

Task 68 (vendored cards) just landed and is committed. Analysis 100 recorded the ratified architecture and the two "discuss" forks that were then resolved (Blueprint-is-a-Card; persona/beliefs/memory → separate pluggable capability card). This analysis answers "what exactly must change, in what order, and what still needs a decision," grounded in three parallel code investigations (rename inventory, descope blast-radius, Blueprint design) plus the deploy-contract read.

## Investigation

### 3.1 Rename surface and the internal/external boundary

Approximate surface: ~127 `mind` code identifiers in `cli/`, ~186 in `test/`, 51+ `activeMinds` usages, 2 directories (`cli/core/mind-generator/`, `cli/commands/mind/`), the 8-file `cli/commands/cloud/` group + 3 `cloud-*` core files, ~10 mind/cloud test files, and ~1835 "mind" occurrences across `.ai/`.

The rename splits on a boundary that mirrors the CLI ⟷ Foundry line:

- **Internal (in scope, renames freely):** all `mind`/`cloud` identifiers, types (`MindSummary`→`WorkerSummary`), modules, generated paths, `activeMinds`→`activeWorkers`, command verbs, forward-facing docs.
- **External contracts (out of scope — held explicitly):** npm package name `darwinian-minds` + `darwinian-minds-skills` submodule (brand/distribution decision); wire endpoints `/api/minds`, `/m/{slug}/chat`, domain `minds.darwiniantools.com`, env vars `IMINDS_*`/`DRWN_STUDIO_*`, and the public export path `darwinian-minds/hook-policy` (server/registry-owned; cannot change without a coordinated release). `dminds` bin alias: leave.
- **Historical `.ai/` docs:** the ~1835 occurrences are dated task/analysis records — a decision trail. **Not rewritten** (evergreen-but-dated rule). Only forward-facing docs (README, `knowledges/`, user-facing help) are updated.

### 3.2 Persona/beliefs/memory descope — and the verified redundancy of the mind bundle

**Footprint** (quarantine/remove targets): manifest types + `validateMindContentSection` and memory validators (`card-manifest.ts:11-128`, fields at `:41-43`); lock fields + validators + the `hasMindContent`→`MINDS_MIN_DRWN_VERSION` floor (`card-lock.ts:34-36,105-109,233-345`); the persona/beliefs/memory blocks of `materializeMind` and all of `materializeComposedMind` (`sync-mind.ts:99-115,177-216,279-379`); the whole authoring surface (`card-source.ts` add/remove persona/belief/memory + doctor scanning; 6 `card/source/*` command files; publish validation `card-store.ts:356-395`); visibility (`visibility.ts:42-57` computes card visibility **solely** from persona/beliefs/memory, feeding the `card push` gate); and ~3 dedicated test files (~120 assertion-lines) plus ~6 mixed files and fixtures.

**The redundancy finding (verified, not inferred).** The real projection into agent tool configs does **not** go through the mind bundle:
- Skills resolve via `resolveSkillSource(name, lockedCards, …, contentRoots)` (`skills.ts:301`) — lock + vendored content roots.
- MCP via `syncMcp(state.activeServers …)` and hooks via `syncHooks(state)` (`sync.ts`), both from effective state, not the bundle.
- `generated/mind/` has no reader but the prune (`sync.ts:484`); `minds.json` is read only by `mind list` (`mind/list.ts:62`, with a `card.lock` fallback).

So `materializeMind`'s skills/MCP/hooks materialization **duplicates** the real path, and the composed-mind artifact is **~100% persona/beliefs/memory**. Consequences:
- `materializeComposedMind` **collapses to a dead stub** once persona/beliefs/memory leaves → removable, along with `resolveGeneratedComposedMindDir` and the prune.
- `materializeMind` becomes a redundant capability bundle — thin it to skills/MCP/hooks (conservative), or remove it wholesale (opt-in — see §5 D-A).

**Orthogonal and STAYS:** the active-stack **selection** — `activeMinds`→`activeWorkers`, `selectActiveCards` (`effective-state.ts:159,259`), `skillApplyOrderCards`, `activeServers`, and `mind use/list/clear`. This gates which cards' capabilities project and in what order. Do not conflate the collapsing *artifact* with the surviving *selector*.

**Runtime blast radius: near-zero.** No in-repo consumer reads persona/beliefs/memory output back; removal changes generated artifacts + authoring, not target-config behavior.

### 3.3 Blueprint artifact — a `kind:"blueprint"` card

**Substrate is card-kind-agnostic.** Publish/version/lock/vendor/catalog operate on the manifest + source tree and never assume a content shape, so a composition-only card flows through `publishCard`/vendor/lock unchanged (`card-store.ts:729`).

**Validation is an allowlist, not a strict schema** (`validateCardManifest`, `card-manifest.ts:130-247`): unknown keys pass silently. So `kind`, `composedFrom`, and governance fields are stored today but ignored — excellent forward-compat, but "validate-only" requires **adding positive validators** (mirror `validateMindContentSection`; and the `stability`/`skills.shared`-"reserved" patterns are the models for validate-but-don't-enforce).

**One composition engine — expand at resolution.** `composedFrom:[cards]` is structurally identical to project `cards[]`. The integration point is **card resolution** (`resolveProjectCards`/`buildEffectiveState`, `effective-state.ts:100-120`): when a resolved entry is `kind:"blueprint"`, recursively resolve its `composedFrom` and splice the members into the card list. Everything downstream (`mergeCardManifestsIntoProjectConfig`, selection, projection) works untouched. **Do not build a parallel blueprint composer.**

**Governance rides into the lock verbatim** — the full manifest is embedded in `CardLockEntry.manifest` (`card-lock.ts:195`), so forward-declared fields persist source→publish→lock with zero new plumbing; no hoisting needed.

**Two real gaps to close in the Blueprint task:**
1. `diffCards` (`card-diff.ts:81-88`) ignores `composedFrom` and governance, so the publish semver-bump guardrail waves through composition changes as `patch`. Extend it to treat `composedFrom` as a diff-significant set.
2. The **empty-mind choke point** (`syncMinds` materializes a degenerate bundle for a composition-only card) — dissolves if D-A opts into bundle removal; otherwise needs the blueprint entry handled explicitly.

**Command surface:** `drwn worker` = the renamed cloud verbs (`deploy` already takes a card ref — a blueprint ref drops in unchanged — plus `list/status/deployments/rollback/delete`) + authoring verbs (`new`/`compose`/`publish`) that are thin wrappers over existing `card-source.ts`/`card-store.ts` primitives (`createCardSource`, add/remove-member mirroring `addCardSourceSkill`, `patchCardSourceManifest`, `publishCard`).

### 3.4 Deploy handoff delta

Today: `POST /api/deployments {cardRef, name, model, secrets?}`; server clones+materializes one card; polls to ready (`cloud/deploy.ts`). Because a Blueprint is a card, a **degenerate (single-card) deploy works with essentially no contract change**. The substantive change is **multi-card composition resolution**: a blueprint references N cards, so either (a) the CLI resolves the blueprint → pinned member set (`card.lock`) and sends that (leans on task-68 local-authoritative composition; server stays simple), or (b) the CLI sends the blueprint ref and Foundry resolves `composedFrom` (new server logic). This is the deploy-contract fork (§5 D-D). D3/3a (send versioned ref) is the ratified direction; the resolution-locus is the open detail.

## Findings

1. **Descoping persona/beliefs/memory is cheap at runtime and collapses the composed-mind artifact** — the biggest structural simplification of the round, verified against the real projection path.
2. **The mind bundle is redundant with the real skills/MCP/hooks projection.** This makes "rename the mind-generator" partly a "delete the mind-generator" question (§5 D-A).
3. **Blueprint-is-a-Card is genuinely cheap** — the substrate is kind-agnostic, composition reuses one engine via resolution-time expansion, and governance stores for free. The only new code is validators, `diffCards` extension, `composedFrom` expansion, and thin authoring verbs.
4. **Sequencing matters: descope precedes rename.** The "mind content" identifiers are the descope targets; renaming them first would be renaming code slated for deletion.
5. **The active-stack selector survives the descope** and is the load-bearing capability mechanism; protect its tests.
6. **Migration landmine:** existing vendored `card.lock` files and published cards carry persona/beliefs/memory + are pinned to lockfile v5 (task 68). Read-tolerance is a backward-compat decision (§5 D-B), though the allowlist validator already tolerates unknown keys, making tolerate-and-ignore nearly free.

## Decisions (ratified 2026-07-07)

- **D-A — Collapse depth: THIN + keep bundle.** Thin `materializeMind` to skills/MCP/hooks; keep the per-card bundle; `worker list` reads `workers.json`. Full removal of the redundant `syncMinds` is logged as a **fast-follow**, not this round.
- **D-B — Legacy persona/beliefs/memory: HARD REJECT.** The canonical (capability) card validator rejects manifests/locks carrying `persona`/`beliefs`/`memory`; fixtures are regenerated. **Implementation nuance:** this is an **explicit named rejection** of those three keys (with a "moved to a separate capability card" error), *not* a blanket unknown-key reject — a blanket reject would also kill the forward-declared governance fields D4 requires on blueprint cards. Validation is therefore **kind-aware**: capability cards reject the descoped keys; `kind:"blueprint"` cards accept `composedFrom` + governance. Pre-release, so breaking existing vendored locks / published cards is accepted.
- **D-C — Visibility + push gate: confirmed no-op; move with quarantine.** persona/beliefs/memory is the only source of card visibility; capability-only cards have none, so `card push`'s visibility gate becomes a no-op. Intended; the gate + `cardManifestStrictestVisibility` move with the quarantined feature (design-captured, code removed).
- **D-D — Deploy resolution: CLI resolves, sends pinned member set.** CLI expands blueprint→member `card.lock` and sends that; the deploy server stays simple. Contract documented for Foundry.
- **D-E — Quarantine: design-capture doc + git history.** Write an analysis doc capturing the persona/beliefs/memory schema + materialization; delete the code; rely on git history. No dead code in the tree.
- **D-F — Blueprint expansion: entry REMAINS alongside members.** The blueprint `CardLockEntry` stays (carrying governance/provenance); its `composedFrom` members are spliced in *addition* so governance survives into the lock.

## Implementation strategy — four staged tasks

Each task: red/green TDD, `npx tsc --noEmit` + focused tests per step, full `bun test` + `verify:release` at exit. Sequenced for minimal rework.

1. **Task W1 — Descope persona/beliefs/memory (semantic).**
   Remove persona/beliefs/memory from the canonical `CardManifest`; delete `materializeComposedMind` + composed-dir + prune; thin `materializeMind` per D-A; unregister the 6 authoring commands; move visibility/push-gate per D-C; apply read-tolerance per D-B; write the quarantine design-capture doc (D-E). Prune the ~3 dedicated + ~6 mixed test files; **keep** active-stack/selection tests green. Exit: green suite, persona/beliefs/memory gone from canonical path, capability projection unchanged.
2. **Task W2 — Hard rename `mind`/`cloud` → `worker` (mechanical).**
   Rename the now-smaller surface: identifiers, `activeMinds`→`activeWorkers`, generated paths (`workers.json`), `cli/commands/mind/`→`worker/` folded under `drwn worker`, `cli/commands/cloud/`→`worker` deploy verbs, `MindSummary`→`WorkerSummary`, forward-facing docs. Hold external contracts (§3.1). Exit: green suite, no internal `mind`/`cloud` vocabulary, external contracts untouched.
3. **Task W3 — Worker Blueprint artifact.**
   Add `kind:"blueprint"` + `composedFrom` + forward-declared governance fields with positive validators; `composedFrom` expansion at resolution (D-F); extend `diffCards`; `drwn worker new/compose/publish` authoring verbs; `doctor`/validate for blueprint refs. Exit: author→publish→use a blueprint; degenerate single-card path intact; semver guardrail composition-aware.
4. **Task W4 — Deploy handoff.**
   `drwn worker deploy <blueprint|card ref>`; composition-resolution per D-D; versioned-ref contract documented for Foundry; retire single-cardRef-only assumptions. Exit: deploy a multi-card blueprint (or degenerate card) via the ratified contract.

**Dependencies:** W1→W2 (descope before rename); W2→W3 (author blueprint code in final vocabulary); W3→W4 (deploy needs the artifact). W3 and W4 could overlap once the artifact schema is fixed.

## Open Questions

1. Ratify D-A through D-F (§5) before drafting task plans — D-A (collapse depth) and D-D (deploy resolution locus) are the load-bearing ones.
2. Whether W1 and W2 are two task docs or one (they touch overlapping files but are semantically distinct; leaning two for review clarity).
3. Package-name / external-contract rename timing (held out of W2; needs its own brand/Foundry-coordinated decision).

## Appendix — pivotal file references

- Descope: `card-manifest.ts:11-128`, `card-lock.ts:34-36,105-109,233-345`, `sync-mind.ts:99-115,177-216,279-379`, `card-source.ts` (authoring), `card-store.ts:356-395`, `visibility.ts:42-57`.
- Redundancy proof: `skills.ts:301`, `sync.ts:448-484`, `mind/list.ts:62`.
- Blueprint: `card-manifest.ts:130-247`, `card-diff.ts:81-88`, `card-lock.ts:195`, `effective-state.ts:100-120,159,259`, `card-project.ts:40-116`.
- Deploy: `cloud/deploy.ts:35,101-143`, `cloud/types.ts`.
- Selection (keep): `effective-state.ts:159,259-271`, `commands/mind/{use,list,clear}.ts`.
