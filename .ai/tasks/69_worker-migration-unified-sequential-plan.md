# ABOUTME: Unified, strictly-sequential implementation plan for the Workers CLI migration — descope persona/beliefs/memory, hard-rename mind/cloud→worker, add the kind:"blueprint" Worker Blueprint artifact, and rework the deploy handoff to a versioned Blueprint ref.
# ABOUTME: Executes the analysis 100/101 target architecture. Descope-before-rename ordering; blueprint-is-a-card on the task-68 substrate; every phase TDD-gated by bun test + tsc, with verify:release at each part boundary.

# Task 69: Workers CLI Migration — Unified Sequential Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan phase-by-phase, in order.

**Status**: Planning — ready to execute pending final review.
**Created**: 2026-07-07
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 4 parts (W1–W4), 13 phases. W1–W2 (descope + rename) are the substrate; W3 (Blueprint artifact) and W4 (deploy handoff) build the new tier.
**Dependencies**: Analyses **100** (ratified architecture + decisions) and **101** (implementation strategy + ratified D-A..D-F). Task 68 (vendored cards) landed and committed.
**References**: [.ai/analyses/100_workers-cli-target-architecture-and-decisions.md, .ai/analyses/101_workers-cli-implementation-strategy.md, cli/core/card-manifest.ts, cli/core/card-lock.ts, cli/core/card-source.ts, cli/core/card-store.ts, cli/core/card-diff.ts, cli/core/visibility.ts, cli/core/mind-generator/sync-mind.ts, cli/core/effective-state.ts, cli/core/card-project.ts, cli/core/skills.ts, cli/core/sync.ts, cli/core/store-paths.ts, cli/commands/mind/list.ts, cli/commands/cloud/deploy.ts, cli/index.ts]

---

## 0. How to read and execute this plan

This is the single linear path from the current card/mind model to the Workers model. It has four parts, done **in order**:

- **W1 — Descope** persona/beliefs/memory from the canonical card (phases 1–4).
- **W2 — Rename** `mind`/`cloud` → `worker`, hard, no aliases (phases 5–7).
- **W3 — Blueprint artifact** — `kind:"blueprint"` card with composition + forward-declared governance (phases 8–11).
- **W4 — Deploy handoff** — `drwn worker deploy` a versioned Blueprint ref (phases 12–13).

**Execution rule:** phases run in numeric order; each is independently reviewable and gated by `bun test` + `npx tsc --noEmit`. Run `bun run verify:release --json` at each PART boundary. **Descope precedes rename** so we never rename identifiers we are about to delete. Rename precedes Blueprint/Deploy so the new tier is authored in final vocabulary.

**Ratified decisions applied (from analysis 101 §Decisions):**
- **D-A** THIN + keep bundle (full `syncMinds` removal is a fast-follow, not here).
- **D-B** HARD REJECT legacy persona/beliefs/memory via **kind-aware, explicitly-named** rejection (not blanket unknown-key reject).
- **D-C** visibility/push-gate becomes a no-op for capability cards; moves with the quarantine.
- **D-D** deploy: CLI resolves blueprint → pinned member set, sends that.
- **D-E** quarantine = design-capture doc + git history; no dead code in tree.
- **D-F** blueprint `CardLockEntry` remains alongside its spliced `composedFrom` members.

## 1. What the current code already gives us (leverage, don't rebuild)

- **Card distribution substrate is kind-agnostic** — publish/version/lock/vendor/catalog operate on manifest + tree; a composition-only card flows through unchanged (`card-store.ts:729`).
- **One composition pipeline exists** — `composedFrom` is the same shape as project `cards[]`; expand at card resolution (`effective-state.ts:100-120`) and everything downstream works.
- **Governance stores for free** — the full manifest embeds verbatim in `CardLockEntry.manifest` (`card-lock.ts:195`).
- **Real tool projection is independent of the mind bundle** — skills via `resolveSkillSource(lockedCards, …, contentRoots)` (`skills.ts:301`), MCP/hooks from effective state. So the mind bundle is removable/thinnable with near-zero runtime risk.
- **Deploy already takes a card ref** (`cloud/deploy.ts:35`) — a blueprint ref drops in.

## 2. Success criteria (acceptance gate, checkable after W4)

- [ ] Canonical `CardManifest` has no persona/beliefs/memory; validator hard-rejects them with a signpost error; `kind:"blueprint"` accepts `composedFrom` + governance.
- [ ] `materializeComposedMind` + composed dir removed; `materializeMind` thinned to skills/MCP/hooks; capability projection byte-identical to pre-change.
- [ ] No internal `mind`/`cloud` vocabulary remains; `drwn worker` is the deploy + authoring surface; `activeMinds`→`activeWorkers`, `generated/worker/`, `workers.json`.
- [ ] Author → publish → `use` a `kind:"blueprint"` card; `composedFrom` members compose via the one engine; degenerate single-card path intact; `diffCards` composition-aware.
- [ ] `drwn worker deploy <blueprint>` resolves members CLI-side and sends the pinned set; degenerate card deploy works.
- [ ] `npx tsc --noEmit`, `bun test`, `bun run verify:release --json` all green.
- [ ] Analysis 103 (persona/beliefs/memory design capture) written; external contracts (§Out of scope) untouched.

---

# PART W1 — Descope persona/beliefs/memory

### Phase 1: Design-capture doc + kind-aware manifest validation (hard reject)

**Goal:** preserve the persona/beliefs/memory design (D-E), then make the canonical validator reject those keys while staying forward-compatible for blueprint governance (D-B).

**Files:**
- Create: `.ai/analyses/103_persona-beliefs-memory-capability-card-design-capture.md`
- Modify: `cli/core/card-manifest.ts` (`validateCardManifest` ~:130-247; the `MindContent*` types ~:11-128)
- Test: `test/core-card-manifest.test.ts`

**Steps:**
1. Write analysis 103: capture the persona/beliefs/memory schema (`MindContentManifest`, `MemoryLayerManifest`, l4/l5/l6, visibility), the materialization shape (`materializeComposedMind` layout), the authoring commands, and the doctor checks — enough to rebuild it later as a pluggable capability card. Point at the pre-descope git SHA for the implementation.
2. Write failing test: a manifest with `persona`/`beliefs`/`memory` returns a validation error naming the field and pointing to "advanced context management moved to a separate capability card". A manifest with an unknown *future* key (e.g. `tools` on a blueprint) still passes. Run: `bun test test/core-card-manifest.test.ts` → FAIL.
3. Implement: introduce a `kind?: "card" | "blueprint"` field (default `"card"`). In `validateCardManifest`, when `kind !== "blueprint"`, push a named error for each of `persona`/`beliefs`/`memory` present. Do **not** add a blanket unknown-key reject. Remove the `persona`/`beliefs`/`memory` fields from the `CardManifest` interface (types move to analysis 103 / git history per D-E).
4. Run tests → PASS. `npx tsc --noEmit` (expect breakages in dependents — fixed in later phases; keep this phase's test green).
5. Commit: `feat(card): reject persona/beliefs/memory on canonical cards; add kind field`.

### Phase 2: Collapse composed-mind, thin the per-card bundle

**Goal:** delete the dead composed-mind artifact; thin `materializeMind` to capability-only (D-A).

**Files:**
- Modify: `cli/core/mind-generator/sync-mind.ts` (remove `materializeComposedMind` :279-379, `personaContent` :99-115, `composedCardRelPath`; thin `materializeMind` persona/beliefs/memory blocks :177-216)
- Modify: `cli/core/store-paths.ts` (remove `resolveGeneratedComposedMindDir` :173)
- Modify: `cli/core/sync.ts` (remove composed-dir prune :482-489 and the import :37)
- Modify: `cli/core/card-lock.ts` (remove persona/beliefs/memory lock fields/validators :34-36,233-345 and the `hasMindContent`→`MINDS_MIN_DRWN_VERSION` floor :105-109)
- Modify: `cli/core/card-project.ts` (remove persona/beliefs/memory mapping :56-58)
- Test: `test/core-sync-mind.test.ts`, `test/core-composed-mind.test.ts` (delete the latter), `test/core-card-lock.test.ts`

**Steps:**
1. Delete `test/core-composed-mind.test.ts` (the artifact it tests is gone). Prune persona/beliefs/memory assertions from `core-sync-mind.test.ts`, keeping skills/MCP/hooks bundle assertions.
2. Write failing test: `materializeMind` for a capability card writes `skills/`, `mcp/servers.json`, `hooks/`, and a `mind.json` with **no** persona/beliefs/memory fields; no `generated/mind/` composed dir is produced. Run → FAIL.
3. Implement: excise persona/beliefs/memory blocks from `materializeMind`; delete `materializeComposedMind` and callers; drop composed-dir resolver + prune; remove persona/beliefs/memory from `CardLockEntry` + lock validators + version floor.
4. Run tests → PASS; `npx tsc --noEmit` → PASS (dependents resolved).
5. Commit: `refactor(mind): remove composed-mind artifact; thin per-card bundle to capabilities`.

### Phase 3: Remove the authoring surface + publish validation

**Goal:** unregister persona/beliefs/memory authoring; remove publish-time persona/beliefs/memory validation.

**Files:**
- Modify: `cli/core/card-source.ts` (remove `add/removeCardSourcePersona|Belief|Memory` :805-1057, templates :789-803, doctor persona/beliefs/memory scanning :555-711, `CardSourceMemoryState`/mind-content state types :48-99)
- Delete: `cli/commands/card/source/{add,remove}-{persona,belief,memory}.ts` (6 files)
- Modify: `cli/index.ts` (unregister those commands :46-59,160-165)
- Modify: `cli/core/card-store.ts` (remove `validatePublishedMindContentDirs` :356-395 and its call sites :675,761,802,846)
- Test: delete `test/commands-card-source-mind-content.test.ts`, `test/core-card-publish-mind-content.test.ts`; prune `test/core-card-source*.test.ts`

**Steps:** 1) delete the dedicated tests; 2) write a test asserting `drwn card source doctor` on a capability card passes with no persona/beliefs/memory issue codes; 3) remove the authoring functions, command files, registrations, and publish validation; 4) tests → PASS, `tsc` → PASS; 5) commit `refactor(card): remove persona/beliefs/memory authoring + publish validation`.

### Phase 4: Move visibility/push-gate + regenerate fixtures

**Goal:** capability cards have no visibility → push gate no-op (D-C); regenerate all fixtures without persona/beliefs/memory.

**Files:**
- Modify: `cli/core/visibility.ts` (`cardManifestStrictestVisibility` :42-57 — capture in 103, remove), `cli/commands/card/push.ts` (`evaluatePushGate` visibility branch)
- Modify: `test/fixtures/dm-card-base-fixture.ts`, `test/helpers.ts` (drop persona/beliefs/memory)
- Test: `test/core-card-push.test.ts` (or equivalent), broad suite

**Steps:** 1) failing test: `card push` on a capability card is not gated by visibility; 2) remove the visibility computation + push-gate branch; 3) regenerate fixtures/helpers without persona/beliefs/memory; 4) full `bun test` → PASS; 5) commit `refactor(card): retire card visibility (capability-only); regenerate fixtures`.

**PART W1 exit gate:** `npx tsc --noEmit`, `bun test`, `bun run verify:release --json` green; persona/beliefs/memory gone from canonical path; capability projection unchanged.

---

# PART W2 — Hard rename mind/cloud → worker

### Phase 5: Core identifiers, config field, generated paths

**Files:** `cli/core/effective-state.ts` (`selectActiveCards`, `activeMinds`→`activeWorkers`), `cli/core/types.ts` (`ProjectConfig.activeMinds`→`activeWorkers`), `cli/core/config-local.ts`, `cli/core/store-paths.ts` (`resolveGeneratedMindsDir`/`resolveGeneratedMindDir`→`Workers`; `generated/minds`→`generated/workers`, `minds.json`→`workers.json`), `cli/core/mind-generator/`→`cli/core/worker-generator/` (`sync-mind.ts`→`sync-worker.ts`, `syncMinds`→`syncWorkers`, `materializeMind`→`materializeWorker`), `cli/core/sync.ts`, `cli/core/migrate-vendor.ts`, `cli/core/diagnostics.ts`. Tests: all referencing the above.

**Steps:** rename by category with `tsc` after each; update `activeMinds` reads/writes (51+ sites) and their tests; rename generated path resolvers + the on-disk names; move the generator dir. Red/green: existing tests updated to new vocabulary stay green. Commit per category (`refactor(rename): activeMinds→activeWorkers`, `refactor(rename): generated/minds→generated/workers`, `refactor(rename): mind-generator→worker-generator`).

### Phase 6: Command surfaces — `drwn mind` and `drwn cloud` → `drwn worker`

**Files:** `cli/commands/mind/`→ folded into `cli/commands/worker/` (`list/use/clear` become `worker list/use/clear`, reading `workers.json`/lock); `cli/commands/cloud/`→`cli/commands/worker/` (`deploy/list/status/deployments/rollback/delete`, `CloudX`→`WorkerX` classes, `MindSummary`→`WorkerSummary` in `types.ts`); `cli/core/cloud-*.ts`→`worker-*.ts` (keep `IMINDS_*`/`DRWN_STUDIO_*` env + wire endpoints untouched — external contract); `cli/index.ts` registration.

**Steps:** create the `worker` command group; move mind + cloud subcommands under it; rename classes/types; update `index.ts`; update `test/commands-mind.test.ts`→`test/commands-worker.test.ts` and `test/commands-cloud.test.ts`→`test/commands-worker-deploy.test.ts`. Note: the wire strings `/api/minds`, `minds.darwiniantools.com` stay (server-owned); add a code comment marking them external. Commit `refactor(rename): drwn mind + drwn cloud → drwn worker`.

### Phase 7: Forward-facing docs + help strings

**Files:** `README.md`, `INSTALL.md`, `.ai/knowledges/10_drwn-cli-architecture.md`, `.ai/knowledges/02_per-project-config-guide.md`, user-facing command descriptions/help. **Not** the historical `.ai/tasks`/`analyses` trail.

**Steps:** update user-facing "Mind"→"Worker" vocabulary in forward-facing docs + help text/output strings; leave dated historical docs. Commit `docs(rename): mind→worker in forward-facing docs + help`.

**PART W2 exit gate:** `tsc`, `bun test`, `verify:release` green; no internal `mind`/`cloud` identifiers (`grep -rin "\bmind\b" cli/` clean except external-contract comments); external contracts untouched.

---

# PART W3 — Worker Blueprint artifact

### Phase 8: Blueprint manifest schema + validators

**Files:** `cli/core/card-manifest.ts` (extend for `kind:"blueprint"`: `composedFrom: string[]`, and forward-declared `tools`/`permissions`/`evals`/`escalation`/`contextMounts`/`identity` with positive shape validators mirroring the `stability`/`skills.shared`-"reserved" patterns), `cli/commands/card/new.ts` / `createCardSource` (`card-store.ts:254`) for a `--kind blueprint` scaffold. Test: `test/core-card-manifest.test.ts`, `test/commands-card-new.test.ts`.

**Steps:** red/green — (a) a blueprint manifest with `composedFrom` + governance validates; a capability card with those fields is rejected (kind-aware); (b) governance fields are shape-validated (typo → error) but non-enforcing; (c) `card new --kind blueprint` scaffolds `{name,version,kind:"blueprint",composedFrom:[]}` with no capability dirs. Commit `feat(blueprint): kind:"blueprint" manifest schema + validators`.

### Phase 9: `composedFrom` expansion in the one composition engine (D-F)

**Files:** `cli/core/effective-state.ts` (`buildEffectiveState` :100-120 / `resolveProjectCards` path), `cli/core/card-project.ts` (`resolveProjectCards` :40-64). Test: `test/core-effective-state.test.ts`, new `test/core-blueprint-composition.test.ts`.

**Steps:** red/green — resolving a `kind:"blueprint"` entry recursively resolves its `composedFrom` members (Cards-only; reject a blueprint member with a clear error — recursion is post-V1) and **splices members in addition** to the blueprint entry (D-F), which remains carrying governance/provenance. Assert downstream capability projection equals applying the members directly. Commit `feat(blueprint): expand composedFrom at resolution (one engine)`.

### Phase 10: Semver-bump guardrail learns composition/governance

**Files:** `cli/core/card-diff.ts` (`diffCards` :81-88 — add `composedFrom` as a diff-significant set via `diffStringSet`; classify member-set changes as minor/major). Test: `test/core-card-diff.test.ts`.

**Steps:** red/green — changing a blueprint's `composedFrom` classifies above `patch`; `publishCard`'s `assertSemverBumpMatchesClassification` enforces the bump. Commit `fix(blueprint): diffCards treats composedFrom as diff-significant`.

### Phase 11: `drwn worker new/compose/publish` authoring verbs

**Files:** `cli/commands/worker/{new,compose,publish}.ts` (thin wrappers over `createCardSource`, member add/remove mirroring `addCardSourceSkill`/`patchCardSourceManifest` `card-source.ts:1135,1223`, and `publishCard`), `cli/index.ts`. Test: `test/commands-worker-blueprint.test.ts`.

**Steps:** red/green — `worker new`→`worker compose --add @scope/card`→`worker publish` round-trips: authors a blueprint source, mutates `composedFrom` (field-preserving spread + re-validate), publishes a versioned blueprint card. Then `drwn use @scope/blueprint@ver` composes its members. Commit `feat(worker): blueprint authoring verbs (new/compose/publish)`.

**PART W3 exit gate:** `tsc`, `bun test`, `verify:release` green; author→publish→use a blueprint end to end; degenerate single-card path intact.

---

# PART W4 — Deploy handoff

### Phase 12: CLI-side blueprint resolution for deploy (D-D)

**Files:** `cli/commands/worker/deploy.ts` (was `cloud/deploy.ts`). Test: `test/commands-worker-deploy.test.ts`.

**Steps:** red/green — `worker deploy <ref>` where ref is a `kind:"blueprint"` card resolves `composedFrom` into a pinned member set (reuse the W3 resolution + task-68 lock machinery) and includes it in the deploy payload; a bare card ref (degenerate blueprint) deploys unchanged. Keep polling/secrets logic intact. Commit `feat(worker): resolve blueprint members CLI-side for deploy`.

### Phase 13: Deploy contract + Foundry handoff documentation

**Files:** `cli/commands/worker/deploy.ts` (payload shape), `.ai/analyses/101_workers-cli-implementation-strategy.md` (append the finalized contract), analysis of the `POST /api/deployments` body extension (add `members`/pinned-set alongside `cardRef`). Test: assert the payload carries the resolved member set + integrity.

**Steps:** red/green — deploy payload includes `{ blueprintRef, members:[{ref,treeSha,integrity}], name, model, secrets? }`; document that Foundry materializes the pinned set (no server-side version resolution required). Commit `feat(worker): versioned blueprint deploy contract + Foundry handoff doc`.

**PART W4 exit gate + acceptance:** the §2 success criteria all check; full `verify:release` green.

---

## Cross-cutting acceptance gates (every phase)

- `npx tsc --noEmit` clean.
- Focused red/green test for the phase; no unrelated test disabled.
- `bun test` green at phase end; `bun run verify:release --json` green at each PART boundary.
- Commit messages human-authored, no AI trailers (per project rules).

## Risks & mitigations

- **Fixture regeneration churn (W1/D-B).** Concentrated in ~3 dedicated + ~6 mixed files + 2 fixtures; do it phase-by-phase, keep active-stack/selection tests green.
- **Rename touching task-68 code.** W2 runs after W1 shrinks the surface; rename by category with `tsc` between each to localize breakage.
- **Empty-mind choke point (blueprint).** D-A keeps the thinned bundle, so a composition-only blueprint materializes a minimal capability bundle; verify it is inert and members carry the real capabilities.
- **Hard-reject breaking existing store cards.** Accepted (pre-release, D-B); analysis 103 + git history preserve the descoped design for the future pluggable card.

## Out of scope (tracked elsewhere)

- Full removal of the redundant `syncWorkers` bundle (D-A fast-follow).
- External-contract renames: npm package name `darwinian-minds`, `darwinian-minds-skills` submodule, wire endpoints `/api/minds`, domain `minds.darwiniantools.com`, env vars, `darwinian-minds/hook-policy` export path.
- Foundry runtime: background execution, scheduling, orchestration, eval-gating enforcement, ContextSpace.
- Blueprints composing Blueprints (recursion) — post-V1.
- The persona/beliefs/memory pluggable capability card build (analysis 103 captures the design).

## Provenance

Derived from analyses 100 (ratified architecture) and 101 (implementation strategy + ratified D-A..D-F), grounded in three parallel code investigations (rename inventory, descope blast-radius, blueprint design) and the deploy-contract read, 2026-07-07.
