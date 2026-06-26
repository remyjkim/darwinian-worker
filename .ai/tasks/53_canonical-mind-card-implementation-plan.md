# ABOUTME: TDD-phased implementation plan for the canonical mind card — persona/beliefs/memory + per-mind isolation + activation-time layering.
# ABOUTME: Two-PR split (additive data model; materialization cutover). File:line-anchored to the current CLI. Supersedes task 46.

# Task 53: Canonical Mind Card Implementation Plan

> **Execution discipline:** Use the plan task-by-task and apply strict TDD for every code-changing task (tests are the spec — write the failing test first). If `superpowers:executing-plans` / `superpowers:test-driven-development` are available in the executing environment, use them; otherwise follow the same TDD loop directly. Do not commit unless explicitly instructed; the per-phase "Commit" notes describe the intended cadence.

**Status**: Ready for PR 1 execution on stacked branch `remyjkim/canonical-mind-card-task-53-pr1` (Task 52 rebrand present at `e6a2af7`). If PR 1 is retargeted directly to `origin/main`, merge/rebase Task 52 first.
**Created**: 2026-06-25
**Updated**: 2026-06-26
**Assigned**: Unassigned
**Estimated Effort**: 2 PRs — PR 1 (additive data model) ~4–6 days; PR 2 (materialization cutover) ~5–8 days
**Dependencies**: Task 52 (darwinian-mind rebrand) must be present before Task 53 code changes. It is present on this stacked branch. Hook prerequisites are present on `origin/main`: PR #14 (card policy hooks), PR #17 / Task 54 (conditional-ownership hooks writer), PR #15 (signal-hooks design baseline), and PR #18 / Task 55 (signal-hook materialization). **PR 2 hard-depends on Task 54 and Task 55 being merged** — PR 2 reuses Task 54's `mergeOwnedHooks` / `_drwn.ownedHooks` side-table rather than writing its own settings.json hook writer, and **builds on Task 55's `sync-hooks.ts` composition** (must preserve signal-entry concatenation, not overwrite it). Sequence now: `origin/main@38e43a7` hook baseline → Task 52 stacked rebrand → Task 53 PR 1.
**Supersedes**: `.ai/tasks/46_drwn-mind-card-implementation-plan.md` (typed `type: "mind"` approach)
**References**: [.ai/analyses/74_canonical-mind-card-target-architecture.md, .ai/analyses/73_session-signal-vs-card-hooks-architecture-decision.md, .ai/tasks/54_claude-hooks-conditional-ownership-writer-implementation-plan.md, .ai/tasks/55_signal-hook-materialization-implementation-plan.md, cli/core/card-manifest.ts, cli/core/card-source.ts, cli/core/card-store.ts, cli/core/card-project.ts, cli/core/card-lock.ts, cli/core/store-paths.ts, cli/core/sync.ts, cli/core/effective-state.ts, cli/core/hook-generator/sync-hooks.ts, cli/core/mcp.ts, cli/core/write-record.ts, cli/core/types.ts, cli/core/project.ts, cli/commands/card/source/add-hook.ts, cli/commands/card/push.ts, cli/index.ts]

---

## Objective

Implement the **canonical mind card** (architecture in analysis 74): one unified card (no `type` discriminator) that is a superset of today's card — `skills`/`hooks`/`servers`/`extensions` plus optional **persona** / **beliefs** / **memory** (L4/L5/L6) with per-layer **visibility** — materialized as **self-contained, isolated minds** under `.agents/drwn/generated/minds/<name>/`, with **multiple minds per project** and explicit **activation-time layering** via `drwn mind use <name…>`.

This **supersedes task 46**: no `type` field, no one-mind-per-project, no harness-vs-mind distinction. It is **naming-aligned with task 52** (rebrand) — land that first so identifiers/strings are `darwinian-mind`.

---

## Architecture (summary; full design in analysis 74)

- A card **is** a self-contained mind. Persona/beliefs/memory are always-optional, always-allowed manifest sections.
- Each installed card materializes its **own isolated bundle** (persona/beliefs/memory **and** its own skills/hooks/mcp) under `<projectRoot>/.agents/drwn/generated/minds/<scope>/<name>/`, plus a top-level `minds.json` registry.
- **Composition moves from implicit-at-install to explicit-at-activation.** `drwn mind use <name…>` sets an ordered **active stack**; `effective-state` is repurposed to merge **the active stack** (not the full lockfile) into the IDE surface. Precedence: later layer wins; persona concatenates.
- `sync` is **extended, not rewritten**: an additive per-mind pass + a smaller projection input. The single retired behavior is sync's unconditional merge of all installed cards into the project surface.

---

## Sub-Decisions Resolved (open items from analysis 74)

1. **Persona layering** → **concatenate** stacked personas in stack order, using the existing machine-readable markers. (Not top-layer-replace.)
2. **Hook ownership** → **reuse Task 54's writer.** Task 54 implements the conditional-ownership writer as a dedicated `_drwn.ownedHooks` side-table (event → entry-identity → hash) with a `mergeOwnedHooks` helper in `mcp.ts` (it explicitly rejected the per-server-style/sentinel alternatives). PR 2 does **not** write its own settings.json hook writer — it feeds the active stack's composed `ClaudeHooksConfig` through the existing `mergeOwnedHooks`. **Collision constraint (R2):** Task 54 keys matcher entries by matcher alone (`m:.*`), so multiple `.*` entries would collide. Therefore the **IDE projection emits a single `.*` composer entry for the active stack** (bundling the stack's policies); per-mind composers under `generated/minds/<name>/hooks/` remain the runtime-mount artifact only. (See sub-decision 5 note and Phases 8–9.)
3. **`card` vs `mind` CLI families** → **keep both**: `card …` manages the unit (author/publish/install); `mind …` activates/runs (list/use/clear).
4. **L6 interim size** → no LFS in v1; store L6 in-tree as text/JSONL; add a **soft size warning** in `card source doctor` only.
5. **Active-stack MCP/server key conflict** → **last-layer-wins** in the IDE projection (mirrors existing field-merge precedence).

---

## Tech Stack

- Bun 1.2+, TypeScript, Clipanion 4; `bun:test`. No new deps.
- Verification: `bun test`, `bun run typecheck`, `bun run verify:release`.

---

## Success Criteria

**PR 1 — data model (no behavior change to existing sync projection):**
- [ ] `card.json` accepts `persona`/`beliefs`/`memory` with `visibility`; validation rejects malformed shapes and missing visibility on non-empty layers.
- [ ] `card source add-persona|add-belief|add-memory` (+ removes) author the source layout; `card source doctor` reports persona/beliefs/memory issues + L6 size warning.
- [ ] `card publish` validates persona/PERSONA.md, beliefs/BELIEF.md, memory dirs + JSONL; integrity unchanged in mechanism (whole-tree hash auto-covers new dirs).
- [ ] Lockfile **v4** round-trips persona/beliefs/memory; v3 reads forward (auto-fill absent).
- [ ] `card push` enforces the visibility gate (`--remote-visibility`, `--unsafe-push-public`); tools-only cards push unchanged.
- [ ] Existing sync/materialization behavior **unchanged** through PR 1.

**PR 2 — materialization cutover (the deliberate behavior break):**
- [ ] `drwn write` materializes each installed card to `.agents/drwn/generated/minds/<name>/` (persona.md, beliefs/, memory/, skills/, hooks/composer, mcp/) + `minds.json`.
- [ ] `drwn mind list/use/clear` manage an ordered active stack persisted in project config.
- [ ] The IDE surface (`.claude`/`.codex`/`.cursor`) is projected from the **active stack** only, via repurposed `effective-state`.
- [ ] Hooks write through the **conditional-ownership** writer: layered minds' policy hooks coexist with user + signal hooks; deactivating a mind removes only its entries.
- [ ] Removing/deactivating a mind cleans up its `generated/minds/<name>/` bundle via write-record.
- [ ] `bun test` / `typecheck` / `verify:release` green.

---

## Two-PR Delineation

- **PR 1 (Phases 1–5):** additive — manifest, source authoring, publish validation, lockfile v4, visibility/push gate. Ships independently; existing cards keep working; **no sync projection change**.
- **PR 2 (Phases 6–11):** the materialization cutover — per-mind isolation, active stack, per-mind hooks, conditional-ownership writer, `mind` CLI, migration. Versioned as a deliberate `0.x` behavior break.

---

## Phase 0 — Branch & Baseline

- Current execution branch: `remyjkim/canonical-mind-card-task-53-pr1`, stacked on Task 52 HEAD `e6a2af7` above `origin/main@38e43a7`.
- Baseline `bun run verify:release --json` was green on 2026-06-26 before implementation. Re-run at the start of code work if the branch is rebased or receives new upstream changes.

---

# PR 1 — Additive Data Model

## Phase 1 — Manifest + Validation

**Files:** `cli/core/card-manifest.ts` (interface 7-23; `validateCardManifest` 51-119, existing section checks 86-107), `test/core-card-manifest.test.ts`.

- **Test first** (mirror existing valid/invalid `{ ok, errors }` assertions): reject `persona.exclude`/`shared`; require `include` array; **require `visibility` when a persona/beliefs/memory layer has non-empty `include`**; reject invalid `visibility`/`format`; validate entry names via the `assertSafePathPart` rule.
- Add interfaces `PersonaManifest`, `BeliefsManifest`, `MemoryLayerManifest`, `MemoryManifest` (shapes per analysis 74) to `CardManifest` (after line 23 fields). **No `type` field.**
- Add validation block after line 107 mirroring the hooks/skills pattern.
- Commit `feat(card-manifest): accept persona/beliefs/memory sections`.

## Phase 2 — Source Authoring + Doctor + CLI

**Files:** `cli/core/card-source.ts` (mirror `addCardSourceHook` 522-557 / `removeCardSourceHook` 559-596; `CardSourceState` 48-68; `readCardSourceState` enumeration 420-459; issue reporting 437-459), new `cli/commands/card/source/add-persona.ts` etc. (mirror `add-hook.ts`), `cli/index.ts` registration (imports ~38-47, register ~128-137). Tests: `test/commands-card-source-hook-mutate.test.ts`, `test/core-card-source.test.ts`, `test/commands-doctor.test.ts`.

- **Test first**: dry-run JSON reports `[add-persona, update-manifest]` without writing; real run scaffolds `persona/<entry>/PERSONA.md` (+ `BELIEF.md`, `memory/l{4,5,6}/<entry>/`) and appends to manifest with explicit visibility; doctor flags orphaned/missing persona/belief/memory dirs + files; **L6 soft-size warning**.
- Implement `addCardSourcePersona/Belief/Memory` + `remove*` (mirror hook mutators: validate name, read manifest, build `nextManifest`, `changes[]`, `dryRun` + `assertStoreWritable`). Persona and belief mutators take required `--visibility private|internal|public`; memory mutators take `--layer l4|l5|l6 --visibility private|internal|public [--format md|jsonl|mixed]`.
- Extend `CardSourceState` with persona/belief/memory bundled/orphaned/missing fields; extend `readCardSourceState` enumeration + issue loops.
- Add + register the CLI commands (mirror `add-hook.ts` class + `index.ts`).
- Commit `feat(card-source): author persona/beliefs/memory + doctor`.

## Phase 3 — Publish Validation

**Files:** `cli/core/card-store.ts` (`validatePublishedHookDirs` 376-391; `publishCard` skill check 670-681, call sites 682 + 721-722; integrity 343-357 — **whole-tree, auto-covers new dirs, no change**). Tests: `test/core-card-publish-hooks.test.ts`, `test/core-card-integrity-content.test.ts`.

- **Test first**: publish rejects missing `PERSONA.md`/`BELIEF.md`, missing/empty memory dirs, invalid JSONL when `format: "jsonl"`, and missing `visibility`; succeeds on a complete mind card; integrity stays deterministic and changes when a persona/memory file changes.
- Add `validatePublishedPersonaDirs/BeliefDirs/MemoryDirs` (mirror `validatePublishedHookDirs`); call at 682 (source) + 721-722 (extracted).
- Commit `feat(card-publish): validate mind content pre- and post-extract`.

## Phase 4 — Lockfile v4

**Files:** `cli/core/card-lock.ts` (`CardLockEntry`/`CardLockfile` 19-41; `writeCardLock` 57-66; `validateCardLockfile` 68-78; `validateCardLockEntry` 80-120; `HOOKS_MIN_DRWN_VERSION` 43), `cli/core/card-project.ts` (`resolveProjectCards` 34-55). Tests: `test/core-card-lock.test.ts`.

- **Test first** (mirror v2→v3 round-trip): write v4 with persona/beliefs/memory metadata; read back preserving include lists, visibility, and memory `format`; **v3 reads forward** with mind fields absent; reject pre-v2.
- Bump `lockfileVersion: 2 | 3 | 4`; `writeCardLock` emits `4` with `MINDS_MIN_DRWN_VERSION`; `validateCardLockfile` accepts 4; `validateCardLockEntry` version-gates optional `persona`/`beliefs`/`memory` metadata objects (not bare string arrays); `resolveProjectCards` extracts them from the manifest (after line 49), preserving `include`, `visibility`, and memory layer `format`.
- Commit `refactor(card-lock): bump to v4 with mind content`.

## Phase 5 — Visibility + Push Gate

**Files:** new `cli/core/visibility.ts` (`classifyRemoteUrl`, `strictest`, `evaluatePushGate` per analysis 63/74), `cli/commands/card/push.ts` (gate after `git.push` site ~34; add `--remote-visibility`, `--unsafe-push-public`). Tests: new `test/core-visibility.test.ts`, `test/commands-card-push.test.ts`.

- **Test first**: strictest-visibility computation; `file://`/local → private, network → unknown; refuse less-restrictive remote; `--remote-visibility`/`--unsafe-push-public` overrides (with stderr audit warning); **trigger only when a visibility-bearing section is present** (tools-only card pushes unchanged).
- Implement `visibility.ts`; wire the gate into `card push` **before** the push call. Use `git.remoteGetUrl` (or `remoteList` fallback if needed) to classify the selected remote, and read `card.json` from the local bare repo before pushing.
- Commit `feat(card-push): visibility gate for mind content`. **End PR 1.**

---

# PR 2 — Materialization Cutover (deliberate behavior break)

> Coordinate the Phase 9 writer change with analysis 73 (PR #14 card hooks + PR #15 signal hooks). Version this PR as a conscious `0.x` break; document the retirement of implicit cross-card composition.

## Phase 6 — Per-Mind Materialization Pass (additive within sync)

**Files:** `cli/core/store-paths.ts` (add `resolveGeneratedMindsDir`/`resolveGeneratedMindDir` after 173; `assertSafePathPart` 43-54), new `cli/core/mind-generator/sync-mind.ts`, `cli/core/sync.ts` (`syncRepository` 327-377 — insert after the hooks step ~357; managed-paths 363-368), `cli/core/write-record.ts` (`ManagedPath` kinds 15-19). Tests: `test/scenarios-card-materialization.test.ts` (mirror), new `test/core-sync-mind.test.ts`.

- **Test first**: a fixture card with persona/beliefs/memory materializes `generated/minds/<name>/` with `mind.json`, concatenated `persona.md` (markers), beliefs/memory symlinks into `extracted/<sha>/`, per-mind `skills/`, `hooks/composer.mjs`, `mcp/servers.json`; top-level `minds.json` lists all installed minds; a removed card's bundle is cleaned on next sync.
- Implement `syncMind` (mirror `syncHooks` materialization + symlink patterns); write per-mind bundle for **every** locked card; emit `minds.json`; record per-mind paths as `managed-content`/`generated-symlink` so `cleanupRemovedManagedPaths` (sync.ts:89-167) cascades.
- Insert an additive call in `syncRepository` (does **not** yet change the existing project-surface projection).
- Commit `feat(sync): per-mind isolated materialization + minds.json`.

## Phase 7 — Active Stack + effective-state Reinput

**Files:** `cli/core/types.ts` (`ProjectConfig` 114-133 — add `activeMinds?: string[]`), `cli/core/project.ts` (`loadProjectConfig` 41-47), `cli/core/effective-state.ts` (`buildEffectiveState` 47-119 — input at line 71; projection inputs 73-107). Tests: `test/scenarios-card-materialization.test.ts`, new `test/core-effective-state-stack.test.ts`.

- **Test first**: with `activeMinds: [A, B]`, the IDE surface reflects only A+B (ordered, last-wins); empty/absent stack → empty projection (or documented default); installed-but-inactive cards still materialize their bundles (Phase 6) but do **not** project.
- Add `activeMinds` to `ProjectConfig`; in `buildEffectiveState`, derive the **ordered active stack** from `activeMinds` ∩ `lockedCards` and feed the merge (lines 73-107) from the stack instead of all `lockedCards`. Keep `lockedCards` available for Phase 6 materialization.
- Commit `refactor(effective-state): project active mind stack`.

## Phase 8 — Per-Mind Composers + Active-Stack Composer

**Files:** `cli/core/hook-generator/sync-hooks.ts` (`syncHooks` 137-230, `collectPolicies` 55-90, `claudeHooksConfig` 92-98). Tests: `test/core-hook-bundle-composer.test.ts`.

- **Test first**: each active mind gets its own composer under `generated/minds/<name>/hooks/` (runtime-mount artifact); the **active stack projects exactly one `.*` composer entry** into the IDE surface, bundling the active stack's policies in stack order (later-wins on conflicts). Consent still gates per card.
- Refactor `syncHooks`: materialize a per-mind composer for each installed mind (Phase 6 path), and build **one** stack composer (or one `.*` entry whose composer aggregates the active stack) for the projection — **not** N `.*` entries (avoids the Task-54 `m:.*` identity collision, R2).
- **Coordination with Task 55 (same code seam):** Task 55 already establishes the `sync-hooks.ts` composition that concatenates per-event arrays (card composer `.*` + signal `Skill` entries via the current `mergeClaudeHookConfigs` helper). This phase **replaces the single card-composer `.*` entry with the active-stack `.*` entry while preserving the signal concatenation** — the projected `ClaudeHooksConfig` is `{ stack `.*` composer } ∪ { signal entries when enabled }`, both fed through `mergeOwnedHooks`. Do not regress signal coexistence.
- Commit `refactor(sync-hooks): per-mind composers + single stack projection`.

## Phase 9 — Project Hooks Through Task 54's Writer

**Files:** `cli/core/mcp.ts` (reuse Task 54's `mergeOwnedHooks` + `_drwn.ownedHooks`; do **not** add a parallel writer), `cli/core/hook-generator/sync-hooks.ts` (pass the stack `ClaudeHooksConfig` to the writer). Tests: extend `test/hooks-collision.test.ts` and `test/core-mcp-merge-hooks.test.ts` with the mind-stack case; `test/sync-mcp.test.ts`.

- **Prereq:** Task 54 merged. If Task 54 is not yet merged when PR 2 starts, that is a blocker — do not reimplement the writer.
- **Test first**: the active stack's single `.*` composer entry merges alongside foreign entries (user hooks + Task 55 signal `Skill`/prompt entries) under shared event keys; deactivating/removing a mind reprojects and Task 54's per-entry cleanup drops only the stack entry when it changes; `--force` semantics preserved.
- Feed the Phase 8 stack `ClaudeHooksConfig` through the existing `mergeOwnedHooks`; rely on Task 54's per-entry drift/cleanup. No new ownership representation.
- Commit `feat(mind): project active-stack hooks via ownedHooks writer`.

## Phase 10 — `drwn mind` CLI Family

**Files:** new `cli/commands/mind/{list,use,clear}.ts` (mirror `add-hook.ts` scaffold + `BaseCommand`), `cli/index.ts` registration, write path triggers projection from `activeMinds`. Tests: new `test/commands-mind.test.ts`.

- **Test first**: `mind list` shows installed minds (from `minds.json`) + active stack; `mind use A B` persists `activeMinds=[A,B]` and reprojects on next write; `mind clear` empties it.
- Implement the three commands; persist via project config load/write; register in `index.ts`.
- Commit `feat(cli): drwn mind list/use/clear`.

## Phase 11 — Verification, Docs + Migration

- `bun test` / `typecheck` / `verify:release` green; full materialization scenario (publish mind card → install → `mind use` → `write` → assert `generated/minds/` + projected surface + coexisting signal hooks).
- **Docs (parity with Task 54 P4):** update `.ai/analyses/60_drwn-card-hooks-target-architecture.md` and `.ai/knowledges/10_drwn-cli-architecture.md` to describe the per-mind composer materialization + single active-stack `.*` projection, building on Task 54's `ownedHooks` edits (evergreen, describe target state as-is). Update the `generated/` layout in knowledge 10 for `generated/minds/<name>/` + `minds.json`.
- Add a migration note: **implicit cross-card composition is retired**; projects now select an active stack. Version bump + release notes.
- Commit `docs(mind): migration note for active-stack model`.

---

## Out of Scope / Deferred (reserved)

- Space/app mind mechanics (project-resident evolving memory, path/scope binding) — name + `.agents/drwn/minds/` location reserved only.
- Git LFS / R2 for L6; runtime delta / Mind Cloud writeback.
- CCH-side mounting of `generated/minds/` (CCH repo).
- Refinery → mind-card import tooling.
- A cross-card "compose several cards into one mind" primitive (layering is over whole minds).

---

## Risk & Mitigation

| Risk | Mitigation |
|---|---|
| PR 2 changes default sync behavior for existing users | Two-PR split; PR 1 fully additive; PR 2 versioned as a deliberate break with migration note + tests |
| Reinventing the hooks writer / colliding with Task 54 | Reuse Task 54's `mergeOwnedHooks` + `_drwn.ownedHooks`; project a **single** `.*` stack composer entry (R2) so Task 54's `m:.*` identity stays unique; land after Task 54+55 merge |
| Per-mind cleanup deletes user-edited mind files | Reuse write-record content-hash guard (sync.ts:95-103) — drifted files preserved with warning |
| effective-state reinput breaks non-mind projects | Empty/absent `activeMinds` path explicitly tested; `lockedCards` still available for materialization |
| Scope creep into space/app mind or LFS | Hard out-of-scope list above |

---

## Final Checklist

- [ ] PR 1: manifest, source authoring + doctor, publish validation, lockfile v4, visibility/push gate — all TDD, existing behavior unchanged.
- [ ] PR 2: per-mind materialization, active stack, per-mind hooks, conditional-ownership writer (building on PR #14, Task 54 / PR #17, and Task 55 / PR #18), `mind` CLI, migration.
- [ ] `bun test` / `typecheck` / `verify:release` green at each PR boundary.
- [ ] task 46 marked superseded.
- [ ] No commit unless explicitly instructed.

---

## Notes

- Grounding pass complete: every phase cites exact files/lines in the current CLI. The biggest single risk concentrates in Phases 7–9 (effective-state reinput + conditional-ownership writer); they are isolated and individually TDD'd.
- Lands on the `darwinian-mind` identity (task 52). If task 52 has not merged when PR 1 starts, rebase before PR 2.
