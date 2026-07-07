# ABOUTME: Investigation + decision doc for evolving the drwn CLI from the card/mind model to the Workers model (Capability Cards -> Worker Blueprints -> Workers -> Scalon Foundry).
# ABOUTME: Maps current state against the v1.4 target naming/architecture, sorts gaps by the CLI<->Foundry boundary, and enumerates the core design forks with options, pros/cons, and recommendations.

# Analysis 100 — Workers CLI: Target Architecture, Gaps, and Core Decisions

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: In Review — core forks ratified 2026-07-07 (see Ratified Decisions); residual decisions in Open Questions
**References**: [analyses/97_worktree-vendored-card-architecture.md, analyses/98_target-tooling-mental-model-and-usage-guide.html, analyses/92_mind-card-lifecycle-storage-and-update-model.md, tasks/68_drwn-card-model-unified-sequential-plan.md, cli/core/types.ts, cli/core/mind-generator/sync-mind.ts, cli/core/card-manifest.ts, cli/core/card-lock.ts, cli/commands/cloud/deploy.ts, cli/commands/cloud/types.ts, cli/core/cloud-http.ts, https://app.notion.com/p/396f1fbef8c280d5a0aecb929e8a5be6]

---

## Executive Summary

The v1.4 company strategy ("Darwinian Workers") renames and re-tiers the framework: **Capability Cards → Worker Blueprints → Workers → Scalon Foundry**. "Mind" is retired. The `drwn` CLI stays the open-source front door.

Two findings reframe this from a greenfield build into a rename-plus-hardening:

1. **The composed mind already _is_ the proto-Worker.** `drwn write` merges the active stack of cards into one runtime bundle (`.agents/drwn/generated/mind/`) — persona (identity), beliefs, memory L4/L5/L6, skills, hooks, MCP servers, with provenance. The project `config.json` (`cards[]` + ordered `activeMinds[]`) is the proto-**Blueprint**.
2. **Cloud deploy contradicts "local-authoritative."** `drwn cloud deploy <cardRef>` sends a *single git ref* to `/api/deployments`; the server re-clones and re-materializes it into a static HTTP chat endpoint. It never touches the local composition or the vendored bytes task 68 built, and it cannot deploy a multi-card Blueprint. This is the real technical seam to close.

Sorting every strategy gap through the "CLI ⟷ Foundry boundary" (the line the strategy itself calls most important), the genuine **near-term CLI** work collapses to three things, which is the agreed scope of this round:

- **A. Naming migration** (everywhere — code, types, manifests, generated paths, tests, docs).
- **B. Worker Blueprint as a first-class artifact** (composition + governance).
- **C. Deploy handoff** so a Blueprint (not a raw cardRef) is what deploys.

Everything else in the six-layer stack — background execution/scheduling, eval-gating, ContextSpace (governed memory), the Coordination Engine, Office — is **Foundry-side or explicitly future-sequenced** and is out of scope for this round.

Two central design forks gate the whole round and are **not yet decided**: (1) whether a Blueprint is a hand-authored **spec** or the composed **output**, and (2) whether a Blueprint is **project-local**, a **standalone publishable artifact**, or **a kind of Card**. This doc lays out both with options and trade-offs and records a recommendation for each.

## Ratified decisions (2026-07-07)

The core forks are settled. The options/pros-cons below (D1–D5) are retained as the reasoning trail; these are the outcomes:

- **D1 (spec vs output): SPEC.** A Blueprint is the hand-authored spec; the composed runtime bundle is its output. Folds into D2.
- **D2 (distribution): a Blueprint is a kind of Card** (`kind:"blueprint"` card whose content is `composed_from:[cards]` + governance). Reuses ALL task-68 distribution machinery; no parallel stack.
- **D4 (governance fields): forward-declare + validate.** `permissions`/`evals`/`escalation`/`context_mounts`/`identity` are stored and schema-validated by the CLI, enforced by Foundry later — not enforced this round.
- **D5 (permissions): collapses into D4.** No new permission surface. Two things were conflated: (1) **hook tool-policy** (`cli/core/hook-policy/`, an allow/deny/ask tool gate enforced *now* in the harness) stays as-is and composes into the bundle unchanged; (2) the strategy's `permissions:` block (`can_merge_pr`, `requires_human_approval_for`) is **Worker _runtime_ authority** — a Foundry concern — so it becomes a forward-declared field (D4), not CLI-enforced.
- **Command surface: two top-level nouns — `drwn card` and `drwn worker`.** Blueprint folds *under* `drwn worker` (it is the authored spec-noun, not its own namespace). Image/container analogy: Blueprint = built versioned image, Worker = running instance; `drwn worker` owns both stages (`new`/`compose`/`publish` author the Blueprint; `deploy`/`list`/`status`/`rollback`/`delete` manage the running Worker).
- **Degenerate Blueprint: a bare card is a Blueprint of one card with default governance.** So `drwn worker deploy <cardRef>` is first-class — single cards deploy directly without authoring a Blueprint. The Blueprint tier is an **on-demand governance/portability layer** that activates only when you need composition or governance; you never pay its cost until it buys something. Its value is concentrated at exactly two moments — **deploy and share** — and absent for local single-capability use (which stays `drwn card` + `config.json` + `drwn write`, unchanged).
- **Deploy handoff: D3/3a — deploy points at a versioned Blueprint ref** (reproducible because immutable); vendored-bytes deploy (3b) deferred.
- **One composition engine.** Project-config composition and Blueprint composition must share a single composer (`sync-mind` → `sync-worker`) with two endpoints (local materialize vs deployable artifact) — never two parallel mechanisms.
- **Canonical Card = capability-only (skills/hooks/MCP). Persona/beliefs/memory leave the canonical card.** The advanced context-management system (persona + beliefs + memory L4/L5/L6) is **descoped from the canonical card model for V1** and re-homed as a **separate, optional capability card** that plugs in only if a user wants it. Implication: the current `CardManifest` persona/beliefs/memory fields and the bulk of `sync-mind`'s composed-mind materialization (which today is largely persona/beliefs/memory merging) get **removed/quarantined** from the canonical path — preserved for the future pluggable card's design, not carried in the base. This is the decisive resolution of the rename-depth question: the "mind content" vocabulary is not merely renamed, it exits the canonical model.
- **Recursion (ratified): Cards-only for V1.** Blueprints compose Cards, not other Blueprints. Revisit "role of sub-roles" post-V1.
- **Rename (ratified): hard rename, no deprecated aliases.** Pre-release; honors the no-backward-compat rule. Glossary: `generated/mind/`→`generated/worker/`, `mind.json`→`worker.json`, `sync-mind`→`sync-worker`, `activeMinds`→`activeWorkers`, `drwn mind {list,use,clear}` retired, `drwn cloud`→`drwn worker`.

## Context

Task 68 (vendored card model) just landed: the local card authoring/distribution model — source → store → project vendor → materialized surfaces — is mature, green on all gates, and committed. The next set of "big changes" is to re-express the framework in the v1.4 Workers vocabulary and to fill the parts of the model the strategy names but the CLI does not yet have: the **Worker Blueprint** and the **Worker deployment** handoff.

Remy scoped this round to **naming migration + Blueprint artifact + deploy handoff**. `drwn cloud` already implements a deployment path; it may need updating once the Blueprint protocol is fixed. Foundry runtime work (background agents, scheduling, orchestration) is deferred. Rename depth: **everywhere** (not surface-only).

The strategy sources are the Notion "Darwinian Workers CLI Home v0.1" and "CL Product Strategy v1.4"; the local design of record is analyses 97 (architecture) and 98 (mental model), both card-era.

## Investigation

### The v1.4 naming map (from strategy)

| v1 (current) | v1.4 (target) | Note |
|---|---|---|
| "Meta-harness" | **Darwinian framework** | OSS substrate for building Workers |
| Card | **Capability Card** | Composable, testable unit of capability |
| Mind / composed mind / `activeMinds` | **Worker Blueprint** (spec) + **Worker** (deployed) | Split: the definition vs the running instance |
| Harness / Mind (the deployable) | **Worker** | The rentable unit of cognitive work |
| Cloud pillar / Mind Studio | **Scalon Foundry** | Hosted deploy/run/orchestrate control plane |
| "Mind" (as a product/primitive noun) | **Retired** | Deprecated everywhere |
| `drwn` CLI | `drwn` CLI | Unchanged — still the front door |

The strategy's canonical Worker Blueprint shape (its own YAML) is the target for the Blueprint artifact:

```yaml
worker_blueprint: Frontend Engineer
version: 1.4.2
composed_from: [React Component Builder, Design System Reviewer, Accessibility Checker, PR Authoring, Code Reviewer]
context_mounts:
  read: [/engineering/frontend, /design-system, /product/current-roadmap]
  write_proposals: [/engineering/frontend/working-memory]
tools: [github, linear, slack, browser, vscode]
permissions:
  can_open_pr: true
  can_merge_pr: false
  requires_human_approval_for: [production_changes, dependency_upgrades, public_api_changes]
evals: [passes_tests, follows_design_system, minimizes_unnecessary_changes, avoids_outdated_context]
escalation:
  human_owner: engineering_lead
  escalate_when: [confidence_below_threshold, conflicting_context_detected, security_sensitive_change]
```

### Current state: the composed mind is the proto-Worker

`cli/core/mind-generator/sync-mind.ts` composes locked cards into two artifacts:

- **Per-card mind bundle** — `.agents/drwn/generated/minds/@scope/name/` (one per installed card).
- **Composed mind** — `.agents/drwn/generated/mind/` (the active stack merged into one), with `mind.json` recording `activeMinds` (ordered), persona entries, beliefs, memory L4/L5/L6, and source provenance (card + version + integrity).

A card (`CardManifest`, `cli/core/card-manifest.ts`) already carries: `persona`, `beliefs`, `memory` (l4/l5/l6), `skills`, `hooks`, MCP servers. So the "runtime identity + memory + tools" of a Worker exists locally today; it is regenerated on every `drwn write` and is not committed.

The proto-Blueprint is `ProjectConfig` (`cli/core/types.ts:114`):

```
cards?: string[]          // composition (which cards)
activeMinds?: string[]    // ordered active stack
servers, skills, hooks, targets, trustedSources, ...  // tool/surface config
```

It has composition + tool/surface config, but **none** of the Blueprint governance layer: no declarative `tools`/`permissions`, no `context_mounts`, no `evals`, no `escalation`, no deploy `identity`. Permissions exist only imperatively via the hook tool-policy engine (`cli/core/hook-policy/`), not as declarative Blueprint fields.

### Current state: deploy re-materializes a single cardRef server-side

`drwn cloud` (`cli/commands/cloud/`): `deploy`, `list`, `status`, `deployments`, `rollback`, `delete`.

- `deploy <cardRef> --name <slug>` POSTs `{cardRef, name, model?, secrets?}` to `/api/deployments`. `cardRef` is a single git ref (`github:owner/repo#v1.0.0`); `file:` refs are rejected. The **server** clones + materializes; the CLI polls `/api/deployments/{id}` until `ready`/`failed`.
- The deployed thing is served as a static HTTP chat endpoint (`minds.darwiniantools.com/m/{slug}/chat`). Deployments are immutable; `rollback` only repoints routing.
- Auth is production-grade (DAH device flow, JWT services-audience, encrypted v2 credentials, 401 refresh-once — `cli/core/auth/`, `cli/core/cloud-http.ts`).
- **Absent:** background/24-7 execution, scheduling, triggers, jobs, worker identity model, runtime memory/ContextSpace binding, eval-gating. `drwn analyze sessions` uploads session logs to an analyzer (proto-observability), not evals.

The seam: deploy takes **one card**, re-materialized **server-side**, bypassing the entire local composition + vendored-bytes model. It has no concept of a composed multi-card Blueprint.

### Gaps sorted by the CLI ⟷ Foundry boundary

| Gap | Side of boundary | Reality today | In this round? |
|---|---|---|---|
| Rename Card→Capability Card, Mind→Worker, composed-mind→Worker, cloud→Foundry; retire "Mind" | **CLI now** | wide surface: `mind/`, `sync-mind`, `activeMinds`, `mind.json`, deep "mind content" vocab | **Yes (A)** |
| Worker Blueprint first-class artifact (composition + governance) | **CLI now** (authoring) | only `cards[]`+`activeMinds[]`; governance absent | **Yes (B)** |
| Deploy a Blueprint (not a cardRef), reproducibly | **CLI ⟷ Foundry seam** | deploy sends one cardRef, server re-materializes | **Yes (C)** |
| Background/24-7 execution, scheduling, triggers | **Foundry-side** | absent | No — deferred |
| Eval-gated runs ("evolvability is the metric") | **Foundry-side**; CLI may author eval specs | no eval primitive; only session-log upload | No — deferred (fields may be forward-declared, see D4) |
| ContextSpace (governed memory / mounts), Coordination Engine, Office | **Foundry-side / future** | memory layers exist locally; no governed remote memory | No — deferred (mounts may be forward-declared) |
| Observability/telemetry, upgrade/evolution manager | **Foundry-side** | `analyze sessions` is a thin start | No — deferred |

## Findings

1. **This is a rename + hardening, not a new subsystem.** The composition engine (`sync-mind.ts`) and the runtime bundle (`generated/mind/`) already produce a proto-Worker from N cards. The Blueprint tier's *composition* half exists; its *governance* half does not.
2. **The Blueprint's missing half is governance, and governance is not derivable from cards.** `permissions`, `context_mounts`, `escalation`, `evals`, deploy `identity` are role-level policy decisions a human authors at composition time. A card cannot supply them. This settles the "spec vs output" fork (see D1): the authored spec must own governance; the composed bundle is its output.
3. **The strategy implies named, reusable, versioned Blueprints** ("Frontend Engineer", a *fleet*, "which launch Blueprints ship"). Today's `config.json` is one implicit blueprint per repo with no name and no version — too weak for the fleet/deploy/ship story. This pressures the distribution fork toward a versioned artifact (see D2).
4. **The deploy seam mostly closes by changing _what_ deploy points at, not _how_ the server fetches.** If a Blueprint is an immutably versioned artifact (like a published card), `deploy @team/frontend-eng@1.2` is reproducible even with server-side re-materialization. True offline/local-authoritative deploy (ship vendored bytes) is a larger, separable step.
5. **"Mind content" vocabulary is load-bearing and deep.** persona/beliefs/memory manifests, `mind.json`, `sync-mind`, `activeMinds`, `resolveGeneratedComposedMindDir`, and many fixtures use "mind". "Everywhere" rename touches the card manifest schema and test corpus — real churn, and it interacts with task 68's just-landed code.

## Core decisions (the forks)

### D1 — Is a Worker Blueprint a hand-authored SPEC or the composed OUTPUT?

**Recommendation: false binary — the Blueprint is the hand-authored spec (input); the composed `worker/` bundle is its output.** The real work is adding governance fields to the spec. Options below are framed as "where does the authored spec live," which is the question that actually matters and feeds D2.

| Option | Description | Pros | Cons |
|---|---|---|---|
| **1a. Spec (authored)** — recommended | Blueprint is an authored artifact declaring `composed_from` + governance; `drwn write` composes it into the runtime bundle. | Matches strategy YAML; governance has a home; clean input/output split; deploy references the spec. | Requires designing a new manifest surface + validation. |
| 1b. Output (derived) | The Blueprint *is* the generated composed bundle; governance is attached/derived. | Reuses `generated/mind/` as-is; nothing new to author. | Conflates artifact with materialization; governance can't be derived; no stable authored identity to publish/deploy. |

### D2 — Is a Blueprint project-local, a standalone publishable artifact, or a kind of Card?

This is the load-bearing decision; it determines how much of task 68's machinery is reused vs rebuilt, and how deploy references a Blueprint.

| Option | Description | Pros | Cons |
|---|---|---|---|
| 2a. Project-local | Blueprint lives in the repo like `config.json` today (perhaps a named `blueprints/` section). | Simplest; no new distribution; per-project freedom. | No cross-repo reuse; no versioned identity for deploy; can't "ship launch Blueprints"; contradicts the fleet story. |
| 2b. Standalone publishable artifact | Blueprint gets its own store/vendor/catalog/lock/publish/version stack, parallel to cards. | Full reuse/versioning/sharing; matches "Blueprint Builder". | Duplicates the entire task-68 distribution engine (large, DRY violation); two parallel stacks to maintain. |
| **2c. Blueprint is a kind of Card** — recommended | A `kind: "blueprint"` card whose content is `composed_from: [cards]` + governance; own verbs/validation on top, shared card storage underneath. | Inherits ALL task-68 distribution (publish/use/outdated/up/vendor/lock/catalog/immutable versioning) for free; one substrate; natural extension of the existing N-card composition path; gives deploy a stable versioned ref. | Risks muddying the "Cards vs Blueprints are distinct tiers" mental model unless UX keeps them separate; composition-of-cards inside a card needs manifest + resolver changes and recursion rules (D-sub-3). |

**Recommendation: 2c with a UX/tier distinction** — structurally a card (shared substrate), presented as its own tier (`drwn blueprint …` / `drwn worker …` verbs, `kind` field, own `doctor`/validation). Conceptual clarity on top; no duplicated plumbing below. This also resolves D-C (deploy) cleanly: deploy points at `@team/role@version`, an immutable artifact.

### D3 (round scope C) — Deploy handoff: what does `drwn cloud/foundry deploy` send?

| Option | Description | Pros | Cons |
|---|---|---|---|
| **3a. Versioned Blueprint ref** — recommended first step | Deploy references `@team/role@version`; server re-materializes from the immutable published blueprint. | Minimal server change; reproducible because version is immutable; reuses current deploy plumbing. | Still server-side materialization; not offline/local-authoritative; server must understand blueprint composition. |
| 3b. Vendored/composed bytes | Deploy uploads the locally composed + vendored Worker bundle. | True local-authoritative + offline reproducibility; server does no resolution. | Bigger change (tarball upload path is currently unsupported); larger payloads; server runtime must accept prebuilt bundles. |

**Recommendation: 3a now, 3b as a later, separable step.** Note the current explicit "`file:` refs / tarball upload not supported yet" — 3b unblocks that.

## Recommendations (summary)

1. **Scope this round to A (rename everywhere) + B (Blueprint = authored spec, option 1a) + C (deploy a versioned Blueprint, option 3a).** Defer Foundry runtime, evals-as-gating, ContextSpace, orchestration.
2. **Adopt D2 option 2c**: a Blueprint is a `kind:"blueprint"` card reusing task-68 distribution, with a distinct UX tier. Revisit if the tier-clarity concern outweighs the DRY win.
3. **Sequence: rename first (mechanical, unblocks clean naming), then Blueprint artifact, then deploy handoff.** Each is a separate plan iteration with its own TDD gates.
4. **Forward-declare `evals`/`escalation`/`context_mounts` as validated-but-not-enforced Blueprint fields** so the artifact is shaped correctly for Foundry, without building enforcement in the CLI this round (pending D4 below).

## Open Questions (residual — for the planning round)

Ratified above: D1 (spec), D2 (card-as-substrate), D4 (forward-declare), D5 (collapses into D4), command surface (`card` + `worker`), degenerate blueprints, D3/3a deploy, **recursion (Cards-only V1)**, **hard rename (no aliases) + glossary**, **persona/beliefs/memory descoped to a separate pluggable capability card**. What remains:

1. **Persona/beliefs/memory descope mechanics.** How much of the existing machinery to remove outright vs quarantine for the future pluggable card: manifest fields, `sync-mind` composed-mind materialization, `resolveGeneratedComposedMindDir`, tests/fixtures. The investigation (analysis 101) scopes this precisely.
2. **Blueprint manifest schema (design, done in plan).** Concrete `kind:"blueprint"` fields: `composedFrom` + `tools`/`permissions`/`evals`/`escalation`/`contextMounts`/`identity` — names, shapes, which are required vs optional, and how `doctor`/validation treats forward-declared (non-enforced) fields.
4. **Deploy contract (C).** Does the CLI resolve a Blueprint → its card set and send that, or send the Blueprint ref and let Foundry resolve composition? Since Foundry runtime is deferred, this fixes the CLI→server contract shape now even if the server lags. Recommendation: send the versioned Blueprint ref; document the resolved-composition contract for Foundry.
5. **Project → Blueprint promotion bridge.** Is `drwn worker new --from-project` (promote a repo's active card set into a portable Blueprint) V1 or later? Recommendation: later; keep V1 to authoring Blueprints directly.
6. **License boundary** (strategy open question) — OSS vs reserved-to-Foundry; shapes naming but does not block the artifact/protocol design.

## Proposed work sequencing

Three staged plans, each with its own TDD gates and `verify:release` at exit:

1. **Task R (rename, everywhere).** Mechanical, wide, low-conceptual-risk; unblocks clean naming. `mind`→`worker` in code/types/paths/tests/docs, `cloud`→`worker` (deploy), retire `mind` vocabulary per the ratified glossary. Land first so later work is authored in final vocabulary.
2. **Task B (Blueprint artifact).** Add `kind:"blueprint"` to the card manifest + composition (`composedFrom`) + forward-declared governance fields + validation/`doctor`; `drwn worker new/compose/publish` on the shared card substrate; one composition engine constraint enforced.
3. **Task C (deploy handoff).** `drwn worker deploy <blueprint|card ref>` (degenerate blueprint accepted); versioned-ref contract to the deploy API; retire single-cardRef-only assumptions.

## Appendix

### A. Current → target concept map

| Current (code) | Target (v1.4) | Lives / becomes |
|---|---|---|
| `card` / `CardManifest` | Capability Card | mostly a label + `kind` field |
| `ProjectConfig.cards[]` + `activeMinds[]` | Worker Blueprint (composition half) | authored spec (D1/D2) |
| governance fields (none) | Blueprint governance half | new manifest fields (B/D4/D5) |
| `generated/mind/` composed bundle + `mind.json` | Worker (runtime output) | rename `generated/worker/` + `worker.json` |
| `drwn mind {list,use,clear}` | `drwn worker`/`blueprint` verbs | rename |
| `drwn cloud deploy <cardRef>` | `drwn foundry deploy <blueprint@ver>` | rename + protocol change (C) |
| `~/.agents/drwn/` store/vendor/catalog | (unchanged substrate) | reused by Blueprints under 2c |

### B. Key code references

- Composition: `cli/core/mind-generator/sync-mind.ts` (`syncMinds` → `materializeMind` → `materializeComposedMind`).
- Proto-blueprint: `cli/core/types.ts:114` (`ProjectConfig`).
- Card content schema: `cli/core/card-manifest.ts:15` (persona/beliefs/memory manifests).
- Lock entry: `cli/core/card-lock.ts:24` (`CardLockEntry`).
- Deploy: `cli/commands/cloud/deploy.ts`; shapes `cli/commands/cloud/types.ts`; auth `cli/core/cloud-http.ts`, `cli/core/auth/`.
- Permissions (imperative): `cli/core/hook-policy/`.
