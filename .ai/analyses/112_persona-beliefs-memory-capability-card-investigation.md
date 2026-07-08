# ABOUTME: Investigation into rebuilding persona/beliefs/memory (analysis 103 design capture) as a separate, optional capability card on the post-task-69 workers CLI.
# ABOUTME: Maps current-architecture constraints, recoverability of the pre-descope implementation, the design space (three options + recommendation), and the testing strategy.

# Analysis 112 — Persona/Beliefs/Memory Capability Card: Design Investigation

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Draft — investigation complete; design decision pending discussion
**References**: [.ai/analyses/103_persona-beliefs-memory-capability-card-design-capture.md, .ai/analyses/100_workers-cli-target-architecture-and-decisions.md, .ai/analyses/101_workers-cli-implementation-strategy.md, .ai/tasks/69_worker-migration-unified-sequential-plan.md]

---

## 1. Question and scope

Task 69 (D-E) descoped persona/beliefs/memory from the canonical card and preserved the design in analysis 103, with intent to rebuild it as a **separate, optional capability card**. This analysis gathers everything needed to design that rebuild well: what the current (post-migration) pipeline provides and constrains, what exactly the old implementation did (and whether it is recoverable), the viable design shapes, and how to test them.

## 2. A necessary interpretation: what "separate capability card" can mean

Cards in this architecture carry **content** (skills, hooks, MCP definitions) — there is no mechanism for a card to carry CLI behavior (no write-time plugin system). So "rebuild as a pluggable capability card" can only mean:

> The CLI regains (some form of) persona/beliefs/memory **support**, and the feature manifests as **cards that carry mind content** — authored, published, resolved, locked, and activated through the standard task-68 pipeline, with no parallel distribution stack.

"Not special-cased in the core" (103 §How to rebuild) therefore refers to **distribution and resolution** — the mind card is an ordinary card in `config.cards[]` / `composedFrom` / the active stack — not to the CLI containing zero mind-content code. Some CLI-side support (validation, materialization, composition, visibility) is unavoidable; the design question is **how much and how generic** (§5). This reading should be confirmed with Remy before drafting the task plan.

## 3. Current architecture: facts that constrain the design

Verified at HEAD (agent-investigated, key points re-verified directly):

1. **Whole-tree publish means distribution is already free.** `publishCard` snapshots the entire source dir (`git.writeTreeFromDir`, `cli/core/card-store.ts:724`), integrity-covers it (`computeCardIntegrity`, :728), and extraction reproduces it. A card containing `persona/`, `beliefs/`, `memory/` dirs already ships them today — unvalidated and unmaterialized, but present in the extracted content root (`CardLockEntry.path` / `contentRootsByCard`).
2. **Manifest validation hard-rejects the section names.** `validateCardManifest` rejects `persona`/`beliefs`/`memory` with a signpost error ("moved to a separate capability card", `cli/core/card-manifest.ts:212-216`). Any design reusing the 103 schema verbatim must remove or condition this rejection. Unknown keys otherwise pass silently (allowlist validation) and survive into the lock verbatim, since the full manifest is embedded in `CardLockEntry.manifest`.
3. **Materialization handles exactly three content types.** `materializeWorker` (`cli/core/worker-generator/sync-worker.ts:121-178`) projects skills (symlinks), MCP servers (`mcp/servers.json`), hooks (bundled composers) into per-card bundles under `generated/workers/<name>/`, plus a `worker.json` index and a global `workers.json`. No composed cross-card artifact exists anymore; extra dirs in the content root are ignored.
4. **Stack ordering survives.** `activeWorkers` in `ProjectConfig` (`cli/core/types.ts`) with `selectActiveCards` (`cli/core/effective-state.ts:259-271`) still yields an **ordered** active list — the layering substrate the old composed bundle used (`activeMinds`) is intact under its new name, currently used only for selection.
5. **Blueprint expansion is orthogonal and compatible.** `expandBlueprints` (`cli/core/card-project.ts:63-90`) splices `composedFrom` members into the resolved list. A mind card can be a blueprint member with zero new machinery; the W4 deploy contract sends pinned members + governance, and mind content would ride along as ordinary card content.
6. **Visibility and the push gate are fully deleted.** `cli/core/visibility.ts` is gone; `card push` has no gate. Analysis 103 explicitly requires the rebuilt card to re-home visibility + push gate for its content.
7. **The version-floor mechanism survives.** `HOOKS_MIN_DRWN_VERSION = "0.3.0"` (`cli/core/card-lock.ts:49`) with `evaluateVersionFloor`; the old `MINDS_MIN_DRWN_VERSION = "0.4.0"` floor was removed and would need restoring if lock entries regain mind fields.
8. **Governance fields establish the "shape-only, consumed externally" pattern.** Blueprint governance (`permissions`, `evals`, …) is shape-validated, locked verbatim, enforced by Foundry — precedent for manifest sections whose semantics live outside the CLI core.

## 4. The old implementation: recovered and reconstructable

Verified at pre-descope SHA `1c92ae4` (exists; all files readable via `git show`). Full detail is in analysis 103; the investigation confirmed the capture is accurate and added these reconstruction-relevant findings:

- **Everything 103 lists exists at the SHA**: types + `validateMindContentSection` (card-manifest.ts:11-28, 78-121), lock fields + `MINDS_MIN_DRWN_VERSION` + validators (card-lock.ts), `materializeMind`/`materializeComposedMind` (mind-generator/sync-mind.ts, 396 lines), six authoring functions + templates + doctor scanning (card-source.ts:805-1057), `validatePublishedMindContentDirs` (card-store.ts:356-428), `cardManifestStrictestVisibility` + `evaluatePushGate` (visibility.ts, 89 lines), six source commands + three `mind {use,list,clear}` commands.
- **The full test suite is also recoverable**: `commands-card-source-mind-content.test.ts` (authoring, dry-run/json, doctor issue codes, l6 size warning, readonly), `core-card-source.test.ts` (source-state/doctor units), `core-sync-mind.test.ts` (per-card bundle: persona.md fences, symlinks, mind.json, cleanup), `core-composed-mind.test.ts` (stack-ordered composition, provenance, shrink/cleanup), `core-card-publish-mind-content.test.ts` (publish validation, JSONL, integrity), plus `scenarios-mind-card-pr{1,2}-bash.test.ts` end-to-end journeys, plus deleted cases inside `commands-card-push.test.ts`, `core-card-lock.test.ts`, `core-card-manifest.test.ts`.
- **Dependency drift is modest.** The host files the old code hooked into (card-manifest.ts, card-lock.ts, card-source.ts, card-store.ts, store-paths.ts, effective-state.ts, sync.ts) all still exist at HEAD, renamed internally (`activeMinds` → `activeWorkers`, mind-generator → worker-generator) but structurally recognizable. Helpers the old code used (`materializeDir`, `writeManagedFile`, `computeCardIntegrity`, `isSafePathPart`, managed-path recording) survive. Reconstruction is adaptation, not archaeology.

## 5. Design space

Three shapes, differing in how much the core knows about mind content.

### Option A — Faithful restore, adapted (domain-specific, module-bounded)

Recover the 1c92ae4 implementation, adapt naming to the worker vocabulary, and remove the hard-reject. Restore: manifest sections (103 schema verbatim), lock fields + `MINDS_MIN_DRWN_VERSION`, per-card materialization into the worker bundle, the composed stack-ordered bundle, visibility + push gate, the six authoring commands, publish validation, doctor checks. To honor the descope's spirit, rebuild it **behind a module boundary**: a `cli/core/mind-content/` (name TBD) module exposing narrow entry points that card-manifest/card-lock/sync/publish call at defined seams, rather than re-inlining logic across seven core files as before.

- **Pros**: proven schema and logic; tests recover nearly verbatim; fastest path with lowest behavioral risk; 103 says "reuse this schema verbatim; recover the implementation".
- **Cons**: the core once again knows the words persona/beliefs/memory; optionality is by-usage, not by-architecture (the type space carries the fields for every card).

### Option B — Generic content-section extension point

Core gains one domain-agnostic concept: a card may declare named **content sections** (entries, required-file rules, optional per-entry format, visibility), and the core provides generic validation, publish checks, lock normalization, per-worker materialization, a stack-ordered composed bundle with provenance, a visibility-driven push gate, and generic authoring/doctor commands. The persona/beliefs/memory card then becomes pure declaration — its manifest expresses the 103 schema through the generic mechanism.

- **Pros**: core stays domain-agnostic; "not special-cased" in the strongest sense; future content types (knowledge packs, datasets) come free.
- **Cons**: a framework with exactly one consumer (YAGNI, per house rules); memory's two-level shape (layers l4/l5/l6 each with entries and a format) strains a flat generic schema — either the generic schema grows nesting to fit it, or memory gets flattened (`memory-l4` as a section name) and loses the 103 schema verbatim; scaffolding templates and issue codes are domain content that must live somewhere anyway; a generic design needs its own full design cycle before implementation can start.

### Option C — Minimal passthrough

Only: remove/condition the hard-reject, materialize declared extra dirs verbatim into the worker bundle, and record stack order in an index so **external tooling** composes. No visibility, no push gate, no authoring commands, no publish validation in the CLI.

- **Pros**: tiny core delta.
- **Cons**: fails the 103 reconstruction bar explicitly (visibility + push gate must be re-homed); private mind content becomes pushable with no gate — a real safety regression, not just a missing convenience; the authoring/doctor UX that made the feature usable disappears. Viable only as a deliberately reduced v0, not as the rebuild.

### Recommendation

**Option A with the module boundary** (A′). The 103 capture exists precisely so the schema and behavior can be reused verbatim; the implementation and its full test suite are recoverable with modest adaptation; and the house YAGNI rule cuts against building Option B's one-consumer framework. The module boundary captures most of B's architectural benefit (core files touch mind content only at narrow, explicit seams — which is also the honest reading of "not special-cased") while keeping the proven design. If a second content type ever appears, the bounded module is the natural thing to generalize. Option C's scope (minus its gaps) is roughly A's first milestone anyway.

## 6. Cross-cutting decisions to settle before planning

1. **Interpretation confirmation** (§2): CLI regains support; users author mind-content cards. Or does Remy envision a single first-party published card (e.g. `@drwn/mind-base`) as the flagship, with authoring targeting it?
2. **Section gating**: with the hard-reject removed, can *any* card carry mind content, or only cards opting in (e.g. `kind: "card"` + a marker, or no gate at all)? The simplest faithful restore has no gate (any card may carry it — that was the pre-descope behavior); a marker adds complexity for unclear benefit.
3. **Composed bundle location and name**: old was `generated/mind/` with `mind.json` (`activeMinds`). Post-rename candidates: keep `generated/mind/` (content is still "mind content") vs align to the worker vocabulary. Index field should follow `activeWorkers` naming regardless.
4. **Visibility scope**: restore strictest-wins visibility computed **only** from mind content, and the push gate exactly as captured (`--remote-visibility`, `--unsafe-push-public`)? Or take the chance to generalize visibility to all card content? (Recommend: restore as captured; generalizing is scope creep.)
5. **Lock floor**: restore `MINDS_MIN_DRWN_VERSION` — value likely needs to be the first release that ships the rebuild, not the historical "0.4.0". Does lockfileVersion bump (currently 5)?
6. **`exclude`/`shared`**: remain rejected in card manifests (they were composed-only / Wave 2 concepts). Recommend keeping the rejection verbatim.
7. **Command surface naming**: old commands were `card source add-persona|add-belief|add-memory` etc. and `mind {use,list,clear}`. The stack commands now live at `worker stack {list,use,clear}` — the rebuild needs no new stack commands, only the six source commands (and doctor integration). Confirm the six names stay.
8. **Deploy interaction**: mind-content cards as blueprint members flow through the W4 contract untouched (members are pinned refs; content rides in the card). Does Foundry/server need to *know* about mind content for materialization on the worker side, or is the composed bundle a purely local/CLI artifact as before? (Old answer: CLI never read it back; external agent tooling consumed it. Confirm this still holds for deployed workers.)

## 7. Testing strategy

The repo's harness fits this feature exactly; the old suite maps 1:1 onto current conventions (bun test; `scaffoldCliFixture`/`envFor`/`runAgentsCli`/`cleanupTempRoots` in `test/helpers.ts`; `file://` bare-repo remotes in `test/fixtures/git-helpers.ts`; no snapshots — determinism via double-run idempotency and content-hash checks).

**Recover, then adapt, the pre-descope suite** (rather than writing from scratch): the five dedicated files plus scenario journeys enumerated in §4 already cover authoring (incl. `--dry-run --json`, `--keep-files`, `DRWN_STORE_READONLY`), doctor issue codes (`orphaned_persona_dir`, `missing_belief_md`, `missing_memory_jsonl`, l6 size warning), publish validation (missing PERSONA/BELIEF/MEMORY files, invalid JSONL), per-card materialization (fenced persona.md, belief/memory symlinks, index fields), composition (stack ordering, provenance, shrink/cleanup on deselection), lock round-trip + floor, and the push gate matrix (unknown remote blocks, less-restrictive remote blocks, `--unsafe-push-public` warns).

**TDD sequencing** (RED→GREEN per rule 02, one seam at a time), mirroring the dependency order:

1. Manifest: remove/condition hard-reject + restore `validateMindContentSection` (unit, `core-card-manifest.test.ts` style — direct function calls, no fixtures).
2. Lock: fields, normalization-from-manifest, validators, version floor (unit).
3. Publish validation: `validatePublishedMindContentDirs` incl. JSONL validation (fixture + `publishCard`).
4. Authoring commands: six `card source` commands with dry-run/json/readonly/keep-files matrices (CLI subprocess tests, `commands-*` style).
5. Doctor: source scanning + issue codes, `--json` shape (CLI).
6. Per-worker materialization: bundle layout, `worker.json`/`mind.json` fields, idempotent double-write (core + CLI `write --json`).
7. Composed bundle: ordering by `activeWorkers`, provenance entries, cleanup on stack shrink/clear (core).
8. Visibility + push gate: unit matrix on `evaluatePushGate` + CLI push tests against `file://` remotes.
9. Scenario e2e: full journey — `card new` → add persona/belief/memory → `publish` → `card add` in project → `worker stack use` → `write` → assert composed bundle → `push` gate behavior; plus a blueprint journey (mind card as `composedFrom` member surviving expansion and deploy dry-run).

Every mutating command follows the established patterns: `--dry-run --json` reports planned changes without writing; readonly env blocks writes; second `write` produces zero changes and byte-identical output.

## 8. Suggested next step

Discuss §5 recommendation and §6 decisions with Remy; then draft the task plan (next number under `.ai/tasks/`) with phases matching the TDD sequencing in §7, recovering code and tests from `1c92ae4` per milestone.
