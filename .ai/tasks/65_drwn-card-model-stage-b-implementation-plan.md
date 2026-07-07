# ABOUTME: Stage-B implementation plan for the drwn card model — upstream provenance, porcelain verbs, dev links, conflict rule, distributable metadata, profile-card migration, and hardening.
# ABOUTME: Sequences analysis 94 §6 (revised priority order) into TDD phases with concrete files, signatures, tests, and acceptance gates.

# Task 65: drwn Card Model — Stage B Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan phase-by-phase.

**Status**: SUPERSEDED by task 68 (`68_drwn-card-model-unified-sequential-plan.md`), which merges this Stage-B plan with the task-67 materialization substrate into one strictly-sequential order (substrate first, verbs second, hardening after the 97/98 V1 gate). Kept for provenance; do not execute from this doc directly — its phases became Phases 2, 5, 8, 10, 14, 15, 16, 17, 18 in task 68. Prior status: Planning.
**Created**: 2026-07-02
**Updated**: 2026-07-05 (superseded by task 68)
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 8 phased increments (each independently shippable / reviewable)
**Dependencies**: Analysis 93 (target architecture, amended), Analysis 94 (critical assessment — §6 is this plan's spec), Analysis 90/92 (model + operational investigations). Stage A already shipped in the working tree (deprecation reader/writer).
**References**: [.ai/analyses/93_target-card-model-architecture.html, .ai/analyses/94_harness-tooling-critical-assessment.md, .ai/analyses/90_skill-update-model-investigation.md, .ai/analyses/92_mind-card-lifecycle-storage-and-update-model.md, cli/core/card-manifest.ts, cli/core/card-source.ts, cli/core/card-store.ts, cli/core/card-project.ts, cli/core/card-lock.ts, cli/core/project.ts, cli/core/project-writes.ts, cli/core/types.ts, cli/core/effective-state.ts, cli/core/sync.ts, cli/core/skills.ts, cli/core/git.ts, cli/core/catalogs.ts, cli/context.ts, cli/commands/card/source/add-skill.ts, cli/commands/card/source/doctor.ts, cli/commands/card/deprecate.ts, scripts/sync-card-skills.mjs, registry/config.json]

---

## Objective

Turn the immutable-content + per-project-activation model that already exists into one where **provenance is first-class data, the dev and publish loops are ceremony-free, distributed metadata travels with cards, and machine defaults retire into a per-project profile card** — without changing the copy-based materialization substrate (analysis 82) or the immutable store.

## Success Criteria

- [ ] A card manifest can declare a per-skill `upstream` ref (`git+URL#subpath[@rev]`); `drwn card source sync [--check]` refreshes bundled copies from it and is the only sync mechanism (the per-repo `scripts/sync-card-skills.mjs` is deleted from darwinian-minds-skills and replaced by the CLI command).
- [ ] `drwn use`, `drwn up`, `drwn dev`, `drwn release` exist as porcelain over existing plumbing; the operator skills teach them first.
- [ ] `drwn card link`/`unlink` record overrides in a **machine-local, gitignored** `config.local.json`; a cloned project never sees another machine's local path; `check-no-local-paths` stays green.
- [ ] Two cards bundling the same skill name resolve deterministically (later-apply wins) with a loud per-skill warning, and an `exclude` escape hatch.
- [ ] Deprecation and successor metadata live in a distributable `refs/meta/cards` ref, union-merged (never blind-force), surfaced by `card meta show` and the read commands; Stage-A git-config markers migrate on first write.
- [ ] Machine defaults are retired: a profile card + `drwn projects update --all` replace the machine-wide activation channel; `card new --from-defaults` scripts the one-time capture.
- [ ] `drwn write` refuses user-edited managed paths with a **signpost** naming the upstream edit point; machine-scope writes require explicit `--scope machine` (or confirmation).
- [ ] `bun test` green on ubuntu + windows for every phase; `verify:release` passes.

## Ratified decisions (recap — see analysis 94 for rationale)

| # | Decision |
|---|---|
| D1 | Upstream ref form is `git+URL#subpath[@rev]`; rev optional (tag/commit), absent = default branch. Local paths dev-only; publish rejects/rewrites. |
| D2 | `card link` overrides live in machine-local `config.local.json` (gitignored), NOT `config.json`. |
| D3 | Duplicate-skill conflict: deterministic later-apply-wins + warning + `exclude`. Ships BEFORE the profile card. |
| D4 | `refs/meta/cards` metadata is union-merged (fetch → merge → push), never force-pushed. Successor pointers auto-suggested only same-scope; cross-scope needs corroboration/confirmation. |
| D5 | Machine defaults retire → profile card applied per project; needs bulk project ops as a companion. |
| D6 | Catalog v2 (channels + per-version integrity) is Stage C, out of scope here; Stage B keeps auto-replace of the single entry. |

## Dependency-honest phase order

94 §6 lists porcelain as item 2, but `dev` depends on link (item 3) and `release` depends on source sync (item 1). This plan preserves the priority intent while respecting build dependencies: Phase 2 ships `use`/`up`/`release` (release consumes Phase-1 source sync + existing publish/push/catalog + `card diff`); `dev` ships with link in Phase 3.

---

### Phase 0: Foundations and Stage-A debt

**Files:**
- Modify: `cli/core/card-store.ts` (batch the deprecation reader)
- Create: `cli/core/git-ref.ts` (upstream ref parser)
- Test: `test/core-git-ref.test.ts`

**Step 1 — failing test for the upstream ref parser.** `parseUpstreamRef("git+https://h/r.git#skills/x@v1.2.0")` → `{ gitUrl, subpath: "skills/x", rev: "v1.2.0" }`; no `@rev` → `rev: null`; a bare local path → throws `UPSTREAM_LOCAL_PATH_REJECTED`.

Run: `bun test test/core-git-ref.test.ts` — expect FAIL (module missing).

**Step 2 — implement `parseUpstreamRef` / `formatUpstreamRef`** in `cli/core/git-ref.ts`. Reuse existing git-URL parsing from `card-store.ts`'s `parseCardSpec` where possible; do not duplicate.

**Step 3 — batch the Stage-A deprecation reader (author's own debt, 94 §3.6).** Replace the per-version `git config` loop in `listCards` with a single `git config --get-regexp '^drwn\.deprecated\.'` call decoded through `deprecationConfigKey`'s inverse. Add `test/core-card-deprecate.test.ts` case asserting one git invocation for N versions (spy/count).

Run: `bun test test/core-card-deprecate.test.ts test/core-git-ref.test.ts` — expect PASS.

**Step 4 — commit gate:** `bun test && npx tsc --noEmit`.

---

### Phase 1: Upstream provenance + `card source sync`

**Files:**
- Modify: `cli/core/card-manifest.ts` (validate `skills.upstream`)
- Create: `cli/core/card-source-sync.ts`
- Create: `cli/commands/card/source/sync.ts`
- Modify: `cli/commands/card/source/doctor.ts` (staleness + "upstream moved")
- Modify: `cli/core/card-store.ts` (publish rejects local-path upstream)
- Test: `test/core-card-source-sync.test.ts`, `test/commands-card-source-sync.test.ts`

**Step 1 — manifest validation (failing test).** Extend `SkillSelection` (card-manifest.ts:37) with `upstream?: Record<string,string>`. Validate each value parses via `parseUpstreamRef`; each key must appear in `include`. Test rejects an upstream key not in `include`, and a local-path value.

**Step 2 — implement validation**, minimal, in the existing `validateSelection` path.

**Step 3 — `syncCardSource` (failing test).** `syncCardSource(agentsDir, cardName, { check })`: for each `upstream` entry, resolve the git ref (clone/fetch into a cache), extract the subpath at `@rev` (or default branch), and either compare (`check`) or copy into the source's `skills/<name>/` via the same path `add-skill --replace` uses. Return `{ synced[], stale[], moved[] }`. Test: a source with one fresh + one stale skill reports correctly; a moved upstream (simulate redirect) lands in `moved[]`, not a throw.

**Step 4 — implement**, delegating extraction to existing store git helpers (`git.fetch`, `git.revParse`, tree extraction used by `resolveFromGit`). Do NOT shell to a bespoke script.

**Step 5 — command + doctor wiring.** `drwn card source sync <card> [--check] [--json]`; `doctor` calls `syncCardSource(..., {check:true})` and reports `stale`/`moved` as warnings (not `ok:false` failures for `moved`).

**Step 6 — publish guard.** `publishCard` rejects a manifest whose `upstream` contains a local path (`git+file:` or bare path), mirroring check-no-local-paths.

**Step 7 — retire the per-repo script.** In darwinian-minds-skills, delete `scripts/sync-card-skills.mjs` + its `card-map.mjs` sync role; the `sync-card-skills` SKILL and `npm run sync:cards` call `drwn card source sync` instead. (Separate PR in that repo; note the coupling here.)

Run full: `bun test test/*card-source-sync* && npx tsc --noEmit`. Acceptance: `drwn card source sync @darwinian/operator --check --json` reports in-sync against real upstream.

---

### Phase 2: Porcelain — `use`, `up`, `release`

**Files:**
- Create: `cli/commands/use.ts`, `cli/commands/up.ts`, `cli/commands/card/release.ts`
- Create: `cli/core/release-pipeline.ts`
- Test: `test/commands-use.test.ts`, `test/commands-up.test.ts`, `test/core-release-pipeline.test.ts`

**Step 1 — `drwn use <card-ref>` (failing test).** Composes existing ops: clone-if-not-in-store → `card apply` → `drwn write`. Idempotent; `--dry-run` previews. Test: from an empty project, `use @me/x@^1.0.0` ends with x in card.lock and materialized. No new resolution logic — call the existing functions.

**Step 2 — implement `use`** as a thin orchestrator over `resolveCard`/`applyCardToProject`/`syncRepository`.

**Step 3 — `drwn up` (failing test).** `outdated --fetch` → `update` (within ranges) → `write`, across the project's whole card set. Test: a project pinned below latest ends updated + rewritten; nothing to do is a clean no-op.

**Step 4 — implement `up`.**

**Step 5 — `release-pipeline` (failing test).** `runRelease(agentsDir, cardName, { bump? })`: sync --check → **propose bump from `card diff` classification** if `bump` absent → version set → doctor → publish → validate → push (heads+tags+meta) → catalog auto-replace. Each step idempotent; a mid-pipeline failure is resumable (re-run continues from first incomplete step). Test: classification `minor` proposes minor; a doctor failure stops before publish and leaves the source version untouched.

**Step 6 — implement** `runRelease` reusing `card diff` (cli/commands/card/diff.ts logic), `publishCard`, `git.push`, catalog publish. `drwn card release <card> [--bump patch|minor|major] [--yes]`.

Run full: `bun test`. Acceptance: `drwn use`, `drwn up`, `drwn release --help` present; release dry-run on operator proposes a bump.

---

### Phase 3: `card link` / `unlink` (machine-local) + `dev`

**Files:**
- Create: `cli/core/config-local.ts` (read/write `config.local.json`)
- Create: `cli/commands/card/link.ts`, `cli/commands/card/unlink.ts`, `cli/commands/dev.ts`
- Modify: `cli/core/effective-state.ts` (apply overrides during resolution)
- Modify: `cli/core/project.ts` (ensure `.gitignore` carries `config.local.json`)
- Modify: `cli/commands/card/status.ts` (flag dev-linked)
- Test: `test/core-config-local.test.ts`, `test/commands-card-link.test.ts`, `test/core-effective-state-link.test.ts`

**Step 1 — `config.local.json` I/O (failing test).** `{ overrides: { "@scope/name": "file:/abs/dir" } }`. Writing it also ensures `.agents/drwn/config.local.json` is in the project `.gitignore` (append if missing). Test: link write creates the file AND the gitignore entry; never touches `config.json` or `card.lock`.

**Step 2 — implement `config-local.ts`** (the `settings.local.json` pattern).

**Step 3 — resolution honors overrides (failing test).** In `buildEffectiveState`, a linked card resolves its content from the override dir (live copy) instead of `extracted/<sha>`; `card.lock` still shows the pinned version. Test: linked card materializes live-tree edits after `drwn write` without any publish.

**Step 4 — implement** the override branch in effective-state resolution; materialization stays copy-based (no symlink).

**Step 5 — commands + status.** `drwn card link @scope/name file:<dir>` (per-card) and `--all-from <dir>` (bulk, 94/Q1); `drwn card unlink [@scope/name|--all]`; `drwn status` prints `dev-linked (override → <dir>)` loudly. `drwn dev <card> <dir>` = link + `write --watch`; `drwn dev --off` = unlink + write.

**Step 6 — check-no-local-paths stays green** because overrides never enter committed files. Add a CI assertion test that `config.json`/`card.lock` never contain `file:` overrides.

Run full: `bun test`. Acceptance: link an operator source dir, edit a skill, `drwn write`, see the edit materialized; `git status` shows no tracked change.

---

### Phase 4: Duplicate-skill conflict rule (blocks Phase 6)

**Files:**
- Modify: `cli/core/sync.ts` and/or `cli/core/skills.ts` (skill selection merge)
- Modify: `cli/core/types.ts` (`ProjectConfig.skills.exclude` already exists — reuse)
- Test: `test/core-skill-conflict.test.ts`

**Step 1 — failing test.** Two applied cards both bundling `apply-mind-card`: resolution keeps the later-applied card's copy, emits a warning naming both cards + the skill, and honors a project `skills.exclude` entry to drop one deterministically.

**Step 2 — implement** deterministic precedence in the skill-selection assembly (`skillSelection` built for `syncSkillsCore`). Order by card apply order (card.lock / config order). Warning via the existing `SyncResult.warnings` channel — no new surface.

**Step 3 — assert no silent loss.** Test that a dropped duplicate is always reported, never silently omitted (broken-windows / analysis 94 "no silent caps").

Run full: `bun test`. Acceptance: applying two overlapping cards warns and resolves deterministically.

---

### Phase 5: Distributable metadata (`refs/meta/cards`) + migration

**Files:**
- Create: `cli/core/card-meta.ts` (read/merge/write metadata.json on `refs/meta/cards`)
- Modify: `cli/core/card-store.ts` (`deprecateCardVersion` writes meta ref; migrate git-config markers)
- Modify: `cli/commands/card/push.ts`, `cli/core/card-store.ts` fetch/clone refspecs (add `refs/meta/*`)
- Create: `cli/commands/card/meta.ts` (`card meta show`)
- Modify: `cli/core/card-project.ts` (successor trust-scoping on apply/outdated)
- Test: `test/core-card-meta.test.ts`, `test/core-card-meta-merge.test.ts`, `test/commands-card-meta.test.ts`

**Step 1 — metadata read/write via a worktree-less ref (failing test).** Store `metadata.json` as a single-blob tree under `refs/meta/cards` using `git hash-object`/`mktree`/`commit-tree`/`update-ref` (no checkout). `readCardMeta`/`writeCardMeta`. Test: write then read round-trips deprecations + successor.

**Step 2 — implement `card-meta.ts`** using `cli/core/git.ts` plumbing (add thin `hashObject`, `mkTree`, `commitTree`, `updateRef` wrappers if absent).

**Step 3 — union-merge (failing test, D4).** `writeCardMeta` does fetch-ref → union-merge (deprecations keyed by version; last-write-wins only within a single key) → update-ref. Test: two sequential deprecations of different versions both survive; never a force-clobber.

**Step 4 — repoint `deprecateCardVersion`.** It writes the meta ref (via Step 3) AND migrates any existing Stage-A `drwn.deprecated.*` git-config markers into metadata.json on first write, then leaves the config markers as harmless legacy. `getCardDeprecation` reads meta ref first, config fallback. All Stage-A tests stay green.

**Step 5 — distribution.** `card push` adds `refs/meta/*:refs/meta/*`; clone/fetch add `+refs/meta/*:refs/meta/*` (tolerant of absence). Test: push to a bare remote then clone into a fresh store surfaces the deprecation.

**Step 6 — `card meta show` + successor trust-scoping.** `drwn card meta show <card> [--json]`. `card apply`/`outdated` auto-suggest a successor ONLY when same-scope; cross-scope prints "successor claims @other/x — confirm" and requires `--accept-successor` or catalog corroboration. Test: same-scope auto-suggests; cross-scope gated.

Run full: `bun test` (ubuntu+windows). Acceptance: deprecate operator's old version, push, clone elsewhere, see it; two machines' deprecations union-merge.

---

### Phase 6: Retire defaults → profile card + bulk project ops

**Files:**
- Create: `cli/commands/projects.ts` (`projects list`, `projects update --all`)
- Create: `cli/core/project-registry.ts` (discover drwn projects on the machine)
- Modify: `cli/commands/card/new.ts` (`--from-defaults`)
- Modify: `manage-defaults` / `bootstrap-project` skills (docs; separate skills-repo change)
- Test: `test/commands-projects.test.ts`, `test/commands-card-new-from-defaults.test.ts`

**Step 1 — `card new --from-defaults` (failing test).** Captures the machine default skill set (`machine.json`) into a new profile card source (`@handle/everyday`) with `upstream` refs where derivable. Test: N defaults become a card source with N skills.

**Step 2 — implement**, reusing `machine.json` reader + `card new` scaffolding + `add-skill`.

**Step 3 — bulk project ops (failing test).** `project-registry` discovers projects (a machine index of known `.agents/drwn` roots, opt-in registered on `init`/`use`). `drwn projects update --all` runs `up` in each. Test: two registered projects both updated.

**Step 4 — implement** the registry (a `~/.agents/drwn/projects.json` list) + `projects` command.

**Step 5 — migration runbook (doc).** A short `.ai/` note: publish the profile card, `use` it in each project, then `library defaults` entries are removed. Do NOT auto-remove defaults in code — explicit, per analysis 94.

Run full: `bun test`. Acceptance: `card new --from-defaults` yields a profile card; `projects update --all` refreshes registered projects.

---

### Phase 7: Drift signposts + `--scope machine` gate

**Files:**
- Modify: `cli/core/materialize.ts` / `cli/core/sync.ts` (refuse-overwrite message)
- Modify: `cli/core/effective-state.ts` (require explicit machine scope)
- Modify: `cli/commands/write.ts` (or the write entry) — `--scope` flag + confirmation
- Test: `test/core-drift-signpost.test.ts`, `test/core-scope-gate.test.ts`

**Step 1 — signpost (failing test).** When `drwn write` refuses a user-edited managed skill path, the error names the upstream edit point resolved via provenance (Phase 1): "managed by drwn — edit `git+…#skills/<name>`, then drwn write". Test asserts the message contains the upstream ref, not just the local path.

**Step 2 — implement** by threading the resolved `upstream` into the write-record comparison error in `materialize.ts`.

**Step 3 — scope gate (failing test, 94 §5/hardening).** Machine-scope `drwn write` (no project config above cwd) requires `--scope machine` or an interactive confirmation; a bare `drwn write` in a non-project dir errors with guidance instead of silently writing `~/.claude`. Test: non-project write without the flag is refused.

**Step 4 — implement** the gate in the write entrypoint; project-scope behavior unchanged.

Run full: `bun test` (ubuntu+windows). Acceptance: editing a materialized skill then `drwn write` prints the upstream signpost; machine write without `--scope machine` is refused.

---

### Phase 8: Trust-hardening roadmap (apply-time content summaries)

**Files:**
- Modify: `cli/commands/card/apply.ts` (content summary on first apply / on update)
- Create: `.ai/analyses/` roadmap note (signing before open catalogs)
- Test: `test/commands-card-apply-summary.test.ts`

**Step 1 — content summary (failing test).** On first `apply` (and on `update`), print a summary of what the card brings: skills added/changed (name + one-line), MCP servers (with a header-secret note), hooks (requiring consent). Test: applying operator lists its 17 skills; updating shows the diff since the pinned version.

**Step 2 — implement**, reusing `card diff` for the update case and manifest read for first apply.

**Step 3 — roadmap doc** (not code): the instruction-trust threat (94 §3.5), the path to catalog quality signals and card signing, and the trigger ("before any default-registered community catalog grows beyond curated membership").

Run full: `bun test` + `verify:release`. Acceptance: apply/update print a content summary; roadmap doc committed to `.ai/`.

---

## Cross-cutting acceptance gates (every phase)

- `bun test` green on ubuntu-latest AND windows-latest.
- `npx tsc --noEmit` clean.
- `verify:release` passes (includes hardcoded-path scan).
- No new symlinks in any write path (analysis 82 invariant).
- Every user-facing refusal/warning names the next correct command (agent-operator principle, 94 §1).

## Out of scope (tracked elsewhere)

- Catalog schema v2 (channels, per-version integrity) — Stage C.
- Multi-machine registry sync (`drwn store sync`) — open front, 94 §3.4.
- Generated-minds-layer de-symlink — analysis 82 fast-follow.
- Card signing implementation — trust roadmap (Phase 8 documents the trigger, not the build).
