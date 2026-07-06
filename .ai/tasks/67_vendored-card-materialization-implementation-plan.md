# ABOUTME: Implementation plan for the worktree-vendored card materialization substrate (analysis 97 rev 2) — the normalization-tolerant integrity manifest, reflink-populated committed vendor trees, the surface taxonomy, the total crash-safe drwn write reconcile, mode resolution + machine-local overlay, and GC roots.
# ABOUTME: Sequences the eleven ratified decisions of 97 rev 2 into TDD phases with concrete files, signatures, tests, and acceptance gates, grounded in the current code (materialization is already copy-based for skills; computeCardIntegrity is already a per-file mode-aware manifest; ensureExtracted is already atomic). Rev 1 adds five pre-flight decisions (PD-1..5) resolving code-vs-97 forks, a lock-schema step, integrity back-compat, store read-only chmod, generated-layer fate, the drift signpost, GC discovery, and task-65 CLI interlocks.

# Task 67: Vendored Card Materialization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan phase-by-phase.

**Status**: SUPERSEDED by task 68 (`68_drwn-card-model-unified-sequential-plan.md`), which merges this substrate plan and task 65 into one strictly-sequential order. Kept for provenance; do not execute from this doc directly — its 9 phases became Phases 1, 3, 4, 6, 7, 9, 11, 12, 13 in task 68 (all rev-1 amendments carried forward). Prior status: Ready for implementation (rev 1 — amended after handoff review).
**Created**: 2026-07-05
**Updated**: 2026-07-05 (rev 1: added pre-flight decisions, lock-schema step, integrity back-compat, store chmod, generated-layer fate, drift signpost, GC discovery, task-65 CLI dependencies)
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 9 phased increments (each independently shippable / reviewable). Phases 0–2 are start-ready with no external dependency; Phases 3–8 depend on the pre-flight decisions below and (for CLI acceptance) the task-65 interlocks noted per phase.
**Dependencies**: Analysis 97 rev 2 (design of record — decision ledger §12 is this plan's spec), 97_review01 (all findings resolved in rev 2), 98 (operator mental model). Interlocks with task 65 (Stage B) — see "Relationship to task 65". Stage A (deprecation reader/writer) already shipped in the working tree.
**References**: [.ai/analyses/97_worktree-vendored-card-architecture.md, .ai/analyses/97_review01_vendored-architecture-faults-and-amendments.md, .ai/analyses/98_target-tooling-mental-model-and-usage-guide.html, .ai/tasks/65_drwn-card-model-stage-b-implementation-plan.md, .ai/tasks/60_drwn-windows-ci-green-implementation-plan.md, .ai/analyses/82_drwn-portable-multi-surface-write-path-target-architecture.md, cli/core/card-store.ts, cli/core/card-lock.ts, cli/core/card-install.ts, cli/core/card-project.ts, cli/core/materialize.ts, cli/core/sync.ts, cli/core/mcp.ts, cli/core/skills.ts, cli/core/mind-generator/sync-mind.ts, cli/core/write-record.ts, cli/core/effective-state.ts, cli/core/store-paths.ts, cli/core/git.ts, cli/core/project.ts, cli/commands/write.ts, cli/commands/init.ts, cli/commands/store/gc.ts, cli/index.ts]

---

## Objective

Replace the store-symlink generated layer with **materialize-from-vendor**: pinned card content is populated into a per-project, committed `vendor/` tree by a **copy-on-write clone of the store** (never a shared inode), verified by a **normalization-tolerant content manifest**, and `drwn write` becomes a **total, crash-safe, idempotent reconcile**. This makes analysis 97's three requirements hold at once — home-managed sources, per-branch/worktree committable materialization, git-remote sources with pull-based update — while resolving every finding in 97_review01.

## What the current code already gives us (leverage, don't rebuild)

Confirmed by survey — the substrate is closer than the design docs assume:

| Already true | Where | Consequence for this plan |
|---|---|---|
| Skill materialization is **copy-based** (`cpSync` → `materializeDir`), not store-symlinked | `cli/core/materialize.ts:41`, `cli/core/skills.ts:392` | The de-symlink work is **narrow**: only the mind-generator layer symlinks the store. |
| Store symlinks exist **only** in the mind generated layer | `cli/core/mind-generator/sync-mind.ts:55-71,176-199` (`ensureDirSymlink`) | Phase 5 replaces these with reflinked vendor content; skills are untouched. |
| `computeCardIntegrity` is a **per-file, mode-aware** hash (raw bytes + exec-bit flag, sorted, canonical JSON → `sha256-…`) | `cli/core/card-store.ts:343-357` | The normalization-tolerant manifest is an **extension** (add EOL normalization), reused as `card.lock.integrity`. One integrity notion. |
| `ensureExtracted` is **atomic**: store-local temp dir + `rename`, EEXIST-tolerant | `cli/core/card-store.ts:467-487` | Store concurrency (Q2) is mostly done; Phase 6 only adds the Windows rename spelling + a narrow fetch lock. |
| Lock has `integrity` + `hookConsent`; extraction keyed by git **treeSha** | `cli/core/card-lock.ts:26,33-36`, `store-paths.ts:91-94` | Manifest derives from the existing `integrity`; treeSha stays the store address only. |
| `EffectiveState` already carries the resolved server set (`cardServerDefinitions`, `activeServers`) | `cli/core/effective-state.ts:29-46` | Ownership-from-lock (F3) threads an existing value; no new resolution. |
| `managed-fields` write-record entries with per-server `fieldHashes` | `cli/core/write-record.ts:29`, `sync.ts:255-318,349-355` | Merge surfaces already field-merge; the fix is to derive ownership from the lock, not only prior hashes. |

## What is missing (the build surface)

`vendor/` tree + reflink population; EOL normalization in the manifest; `.gitattributes`/`.gitignore` authoring in `init`; per-card **mode resolution**; the machine-local **overlay** (`config.local.json` + `card.lock.local`) merge in `buildEffectiveState`; the **total reconcile** (prune + crash-safe add) in `drwn write`; GC **roots**; `drwn card fork`. Commands absent today: `use`, `up`, `dev`, `release`, `card link/unlink`, `card fork`, `card source sync`, `card meta`, `projects` (several owned by task 65).

## Pre-flight ratified decisions (rev 1 — resolve the code-vs-97 forks before coding)

The first draft left several forks between analysis 97's prose and the code as it exists. Each is ratified here (PD-1..5) so an implementer never has to stop and design mid-phase. Rationale is given because these are load-bearing.

**PD-1 — Surface kind follows the write-record *kind*, not the filename (refines 97 §5).** Verified in code: project `.mcp.json` and `.cursor/mcp.json` are written **whole-file** (`managed-content`; `sync.ts:298-301,363-368`) — drwn owns the entire file, users are not expected to hand-edit them. The genuine **merge** surfaces (mixed ownership, `managed-fields`) are **machine `~/.claude.json`** (`sync.ts:305-318`), **`.codex/config.toml`** (`sync.ts:350-355`), and **`.claude/settings.json`** hooks. Therefore: `managed-content` + `managed-directory` ⇒ **projection** (deterministic, gitignored); `managed-fields` ⇒ **merge** (committed, field-merged). 97 §5's inclusion of `.mcp.json` among merge surfaces is imprecise for the *project* scope and is corrected here. (The F3 store-poisoning-of-user-servers concern is real and is fully addressed for the actual merge surfaces in Phase 3; project `.mcp.json` was never a merge target, so it is unaffected.) *If a future requirement demands preserving user-authored servers inside a project `.mcp.json`, converting it to a field-merge surface is a scoped fast-follow — out of scope for task 67.*

**PD-2 — `card.lock` gains an explicit `treeSha` (+ derived vendor path); it is the vendor address (fills a 97 §12 gap).** Today a lock entry (`card-lock.ts:21-40`) carries `path` (the machine-local extracted dir) and `integrity`, but **not** the git treeSha (it is recomputed at resolve time in `resolveRepoVersion`, `card-store.ts:678`). The vendored model needs a machine-independent address. Add `treeSha: string` to `CardLockEntry` (lockfileVersion bump 4→5, with a tolerant reader for 4). The vendor directory is *derived* (`vendor/@scope/name/<shortSha>/`), not stored, to avoid a second source of truth. This lands in **Phase 1 Step 0** (schema) so Phase 5 can consume it. `path` remains the store extracted dir for non-vendored resolution.

**PD-3 — Project materialization mode lives on `ProjectConfig`, not the card manifest.** Per-project settings are in `ProjectConfig` (`types.ts:114-137`) / `.agents/drwn/config.json`, written via `project-writes.ts`. The `materialization: "vendored" | "linked"` field is added **there**, not on `CardManifest` (`card-manifest.ts:29-48`). Phase 4 is corrected accordingly.

**PD-4 — The `generated/` layer is retained only for mind *composition*; its store-symlinks are removed, not its existence.** `generated/mind/` (composed active-stack mount) and `generated/minds.json` (index) stay — they are drwn-owned projection output, treated as projection surfaces (gitignored, regenerated). What changes: the per-entry **store symlinks** inside `generated/minds/<card>/…` (`sync-mind.ts:55-71,176-199`) become reflinked content sourced from `vendor/<sha>/…` (vendored cards) or `extracted/<sha>/…` (overlay cards). The composed `generated/mind/` mount is rebuilt from those real files. So `generated/` is a **projection surface tree**, not a committed one; it never contained committable content and does not gain any.

**PD-5 — GC project discovery = an opt-in machine index, with the current project always a root.** `computeGcRoots` (Phase 6) reads a machine index of known project roots (`~/.agents/drwn/projects.json`, registered on `init`/first write — the same index task 65 Phase 6 introduces for `projects`). Until that index exists, roots = the current project's `card.lock` + committed `vendor/` + local sources + retention window (never a machine-wide scan, which would be slow and surprising). A missing index degrades safely to "current project only," and GC stays **dry-run by default**, so an unindexed project is never pruned out from under a user.

## Success Criteria (V1 acceptance — mirrors analysis 97 §16)

- [ ] A consumed card materializes into `.agents/drwn/vendor/@scope/name/<sha>/` with **no store symlink**; a second machine with an **empty store** checks out the branch and `drwn write` reconstructs projection surfaces **offline**.
- [ ] A **vendor edit cannot mutate the store**: `echo >> vendor/…/x` leaves `extracted/<sha>/x` unchanged (reflink), or fails loudly (read-only-hardlink fallback).
- [ ] A fresh checkout with **`core.autocrlf=true`** verifies against the manifest — no false integrity failure.
- [ ] `drwn write` **prunes** a vendor tree when its card is removed/updated, but **preserves+reports** a drifted one; a second immediate run is a **no-op**; it **converges from a partial vendor tree**.
- [ ] A **merge surface** (`.codex/config.toml`, machine `~/.claude.json`) keeps a user-owned server across `drwn write`, and drwn identifies its own servers **on a fresh checkout with no write-record**.
- [ ] An explicit committed `materialization: "vendored"` is **not** overridden by a stray `CARDS_SOURCE_PATH`; `set-but-source-absent ⇒ vendored`.
- [ ] A **personal card** activated via the overlay materializes **from the store** and leaves **zero trace** in `vendor/` or the committed lane.
- [ ] `drwn store gc --dry-run` reports roots = project locks + committed vendor + local sources + retention, and never proposes pruning a referenced `<treeSha>`.
- [ ] `bun test` green on ubuntu + windows (copy fallback + `autocrlf=true` exercised); `npx tsc --noEmit` clean; `verify:release` passes.

## Ratified decisions (recap — see analysis 97 rev 2 §12 for the full ledger + rationale)

| # | Decision | Phase |
|---|----------|-------|
| A | Vendor is independent, normalization-stable, content-addressed; **reflink → read-only-hardlink → copy**; integrity anchor = normalization-tolerant manifest derived from `card.lock.integrity`; committed `.gitattributes vendor/** -text linguist-generated` | 0,1,2 |
| B | **Surface taxonomy** (ownership × distribution): projection surfaces gitignored+deterministic; merge surfaces committed+field-merged; owned-field set **derived from the effective lock** | 3 |
| C | `drwn write` is a **total, crash-safe, idempotent reconcile** (temp+rename add, drift-gated prune, overlay branch); determinism scoped to projection surfaces | 5 |
| D | Requirement 3 partially served in V1 (pull-based version-up ships; distributable deprecation is V2, catalog-reflected, named closing move) | 7 |
| — | Mode resolution precedence (explicit → project setting → per-card auto → default); overlay cards materialize from `extracted/`; machine-local overlay; store concurrency; GC roots; `card fork` V1 | 4,6,7 |

## Relationship to task 65 (Stage B)

This plan owns the **materialization substrate**; task 65 owns **provenance, porcelain, distributable metadata, and defaults retirement**. Interlocks:

- **`config.local.json`**: task 65 Phase 3 scoped it to link-overrides. This plan (Phase 4) is the authority for the overlay: it adds **local activation** + the sibling **`card.lock.local`**, and the local-wins merge in `buildEffectiveState`. If task 65 Phase 3 ships first, Phase 4 extends it; otherwise Phase 4 builds it.
- **Provenance (`upstream`, `card source sync`)**: task 65 Phase 1. This plan's drift **signpost** (Phase 5) consumes it if present, degrades to the `vendor/<sha>/…` path if not.
- **Porcelain `use`/`up`/`release`, `card meta`, `projects`, defaults retire**: remain task 65. Task 67 touches only the **already-existing** `card update`/`card outdated` (Phase 7, to re-vendor/report against `treeSha` pins) and does **not** create `up`; when `up` lands in task 65 it inherits the reconcile via `write`. The `projects.json` index that GC discovery (PD-5) reads is also task 65 Phase 6; task 67 degrades safely without it.

## Dependency-honest phase order

The manifest (Phase 0) underpins vendor verification (Phase 1); `.gitattributes` (Phase 2) is cheap and unblocks byte-exact-checkout tests; the surface split (Phase 3) is independent and de-risks the reconcile; mode + overlay (Phase 4) must exist before the reconcile reads them (Phase 5); the reconcile (Phase 5) is the integration point; concurrency + GC (Phase 6) harden it; distribution (Phase 7) and migration (Phase 8) close V1.

---

### Phase 0: Normalization-tolerant content manifest (invariant A — the integrity anchor)

**Files:**
- Create: `cli/core/content-manifest.ts`
- Modify: `cli/core/card-store.ts:343-357` (`computeCardIntegrity` delegates to the manifest)
- Test: `test/core-content-manifest.test.ts`

**Step 1 — failing test.** `computeContentManifest(dir)` returns `{ files: Array<{ path: string; exec: boolean; hash: string }> }` sorted by `path`, where `hash = sha256(normalizeEOL(bytes))` (CRLF→LF for files that decode as UTF-8 text; raw bytes for binary). `verifyManifest(dir, manifest)` returns `{ ok: boolean; mismatches: string[] }`. Test: a dir with an LF file and its CRLF-munged copy produce the **same** manifest (the F2 spike result); a binary file with a flipped byte produces a mismatch; an exec-bit change is detected.

Run: `bun test test/core-content-manifest.test.ts` — expect FAIL (module missing).

**Step 2 — implement `content-manifest.ts`.** Reuse the `walkVersionTree` traversal shape from `card-store.ts:313-341` (skip `.git`, `.integrity`; sort by relPath; exec = `(mode & 0o111) !== 0`). Add EOL normalization: decode as UTF-8; if it round-trips losslessly, hash `text.replace(/\r\n/g, "\n")`; else hash raw bytes. Serialize `sha256-<hex over canonical JSON>` exactly as today so the string is drop-in compatible with `card.lock.integrity`.

**Step 3 — make `computeCardIntegrity` delegate.** `computeCardIntegrity(versionDir)` now calls `computeContentManifest` and returns its digest string. Assert every existing integrity test still passes (`test/core-card-integrity-content.test.ts`, `test/core-card-publish-mind-content.test.ts`, `test/commands-store-migrate-to-git.test.ts`, `test/core-card-install*`). This keeps `card.lock.integrity` unchanged in shape but **normalization-tolerant** — closing F2 at the source.

**Step 4 — backward-compatibility check (this is the day-one migration decision).** The digest is **identical to today for any card whose text files are already LF** (normalization is a no-op on LF), and identical for binary files (raw-byte path unchanged). It **only** differs for a card that shipped CRLF bytes in a text file — those are rare and, if present, were already fragile across platforms. Rule: **no re-publish or re-lock is required**; existing locks stay valid. Add a test that recomputes integrity for a fixture card with LF content and asserts **exact string equality** with a pre-recorded pre-change digest (guards against accidental digest drift). If any existing published card in the wild used CRLF text, `store verify` will report the mismatch and the fix is a normal re-publish — documented, not automated.

**Step 5 — commit gate:** `bun test && npx tsc --noEmit`.

**Acceptance:** the CRLF round-trip that produced a MISMATCH in the review's F2 spike now verifies; existing LF-content lock integrity values recompute **byte-identically** (Step 4 test); no lock rewrite is triggered.

---

### Phase 1: Vendor population primitive (invariant A — the mechanism)

**Files:**
- Create: `cli/core/vendor.ts`
- Modify: `cli/core/store-paths.ts` (add `resolveProjectVendorRoot`, `resolveProjectVendorTree`)
- Modify: `cli/core/card-lock.ts:15-46` (add `treeSha` to `CardLockEntry`; bump `lockfileVersion` 4→5 with tolerant v4 reader)
- Modify: `cli/core/card-project.ts:34-57` (`resolveProjectCards` records `treeSha` from the resolved card)
- Modify: `cli/core/card-store.ts:669-697` (`resolveRepoVersion` returns `treeSha` on `ResolvedCard`)
- Modify: `cli/core/card-store.ts:467-487` (`ensureExtracted` chmod read-only — see Step 3b)
- Test: `test/core-vendor.test.ts`, `test/core-card-lock.test.ts` (v5 round-trip + v4 back-compat)

**Step 0 — lock schema carries `treeSha` (failing test — PD-2).** Add `treeSha: string` to `CardLockEntry`; bump `CardLockfile.lockfileVersion` union to `2 | 3 | 4 | 5` and default new writes to 5; the reader accepts a v4 entry lacking `treeSha` (recompute-on-read via `getCommitTree` for legacy locks, then persist on next write). `resolveRepoVersion` already computes `treeSha` (`card-store.ts:678`) — thread it onto `ResolvedCard`, and have `resolveProjectCards` copy it into the entry. Test: a v5 lock round-trips `treeSha`; a v4 lock without it still loads and gets `treeSha` backfilled. **This step runs first because Phase 5's reconcile keys `DESIRED_VENDOR` on `treeSha`.**

**Step 1 — path helpers (failing test).** `resolveProjectVendorRoot(projectRoot)` → `<projectRoot>/.agents/drwn/vendor`; `resolveProjectVendorTree(projectRoot, cardName, treeSha)` → `…/vendor/@scope/name/<shortSha>/` (12-char short sha; `card.lock` keeps the full treeSha as the integrity/address key — analysis 97 §4, PD-2). Test: scoped and unscoped names split correctly; the same `(name, treeSha)` is stable across calls.

**Step 2 — `populateFile` (failing test, the F1 spike as a test).** `populateFile(src, dst)` copies via, in order: `copyFileSync(src, dst, constants.COPYFILE_FICLONE)` (reflink); on `ENOTSUP`/`EXDEV`/`EINVAL` fall back to hardlink **only if the source is read-only** (else skip); else `copyFileSync(src, dst)`. Test (POSIX): after reflink, editing `dst` leaves `src` **unchanged** and inodes differ (`statSync().ino`); a hardlink into a read-only source refuses the edit (`EACCES`); copy is always independent. Mirror Appendix B §F1.

**Step 3 — implement `populateFile`** using `node:fs` `constants.COPYFILE_FICLONE`. Detect reflink-unsupported by catching the documented errno set and recording the chosen mechanism for `--verbose`.

**Step 3b — store files become read-only so the hardlink fallback fails loudly (failing test — completes the F1 amendment).** The read-only-hardlink fallback in Step 2 is only safe if the store side is actually read-only. Extend `ensureExtracted` (`card-store.ts:467-487`) to `chmod 0o444` **regular files only** on the extracted tree after the atomic rename, before returning — **leave directories at 0o755**. Rationale (precision): making *directories* read-only would break (a) GC/`rm` of the tree, and (b) the `.integrity` sidecar write in the legacy migrate path (`store-migrate.ts:154`) and any post-extract processing; making only files read-only still makes a hardlinked file's in-place write fail with `EACCES` (the guarantee we need) while leaving dir mutation intact. `walkVersionTree` already skips `.integrity`/`.git` (`card-store.ts:321`), and `computeCardIntegrity` reads only — both unaffected. Test: after `ensureExtracted`, a regular file under `extracted/<sha>/` is not writable; a hardlink of it into `vendor/` then an in-place write raises `EACCES` (the F1 spike's "edit refused" row); GC can still `rm -rf` the tree. Reflink remains the primary path and never shares the inode; this only hardens the fallback.

**Step 4 — `ensureVendorTree` crash-safe (failing test, the IR spike as a test).** `ensureVendorTree(storeDir, vendorDir, manifest)`: if `verifyManifest(vendorDir, manifest).ok` → return (idempotent no-op); else `rm -rf vendorDir`, populate each file into a **sibling temp dir** `vendor/.tmp-<sha>-<pid>`, then `renameSync(tmp, vendorDir)` (atomic publish), then `verifyManifest` or throw. Test: seed a **half-written** vendorDir (one file `PARTIAL`) → `ensureVendorTree` repairs it and verifies; a second call is a no-op.

**Step 5 — `pruneVendorTrees` drift-gated (failing test).** `pruneVendorTrees(vendorRoot, desiredTreeShas, manifests)`: for each existing tree not in `desired`, delete it **iff** `verifyManifest` passes; otherwise preserve + return it in `{ preserved: [] }`. Test: a stale clean tree is removed; a drifted stale tree is preserved and reported.

**Step 6 — commit gate:** `bun test test/core-vendor.test.ts && npx tsc --noEmit`.

**Acceptance:** all four F1/IR spike behaviors are now regression tests: no store poisoning, crash-safe repair, idempotency, drift-gated prune.

---

### Phase 2: `.gitattributes` + `init` gitignore authoring (invariant A hygiene; resolves 96 D4 + review §5 nits)

**Files:**
- Create: `cli/core/git-hygiene.ts` (`ensureGitignoreEntries`, `ensureVendorGitattributes`)
- Modify: `cli/commands/init.ts:77-84` (call them instead of warning only)
- Modify: `cli/core/project.ts` (export the gitignore appender for reuse on first write)
- Test: `test/core-git-hygiene.test.ts`, `test/commands-init-hygiene.test.ts`

**Step 1 — `ensureGitignoreEntries` (failing test).** Idempotently append missing lines to `<projectRoot>/.gitignore` under a managed `# drwn` block: `.agents/drwn/config.local.json`, `.agents/drwn/card.lock.local`, `.agents/drwn/write-record.json`, and the projection surface dirs (`.claude/skills/`, `.cursor/` per target). Test: second call adds nothing; pre-existing user lines untouched.

**Step 2 — `ensureVendorGitattributes` (failing test).** Write/merge `<projectRoot>/.agents/drwn/.gitattributes` with `vendor/** -text linguist-generated` under a managed block. Test: byte-exact checkout — commit a `vendor/` tree with an LF file, clone with `core.autocrlf=true`, assert the working bytes are unchanged (the F2 spike case (b) `MATCH`).

**Step 3 — wire into `init`.** Replace the warn-only block (`init.ts:77-84`) with calls to both helpers; `drwn write` also calls them on first vendored write (so existing projects gain them without re-init). Header note at `init.ts:2` updated (it currently promises *not* to mutate gitignore — that promise is retired, deliberately).

**Step 4 — commit gate:** `bun test && npx tsc --noEmit`.

**Acceptance:** `drwn init` produces both files; a Windows-config checkout of `vendor/` is byte-exact.

---

### Phase 3: Surface taxonomy + ownership-from-lock (invariant B — resolves F3)

**Files:**
- Create: `cli/core/surface-kind.ts` (classify a `ManagedPath` as `projection` | `merge`)
- Modify: `cli/core/sync.ts:255-318,349-355` (derive owned server set from the effective lock, not only prior `fieldHashes`)
- Modify: `cli/core/sync.ts:380` (`syncRepository` threads `state.activeServers`/`cardServerDefinitions` into the merge)
- Test: `test/core-surface-kind.test.ts`, `test/core-mcp-ownership-from-lock.test.ts`

**Step 1 — classifier (failing test — PD-1).** `surfaceKind(managedPath)` keys off the **write-record kind, not the filename**: `managed-directory` | `managed-content` → `projection`; `managed-fields` → `merge`. Test: `.claude/skills/x` (`managed-directory`) → projection; project `.mcp.json` and `.cursor/mcp.json` (whole-file `managed-content`, `sync.ts:300,368`) → **projection** (drwn owns the whole file); `.codex/config.toml` and machine `.claude.json` (`managed-fields`, `sync.ts:313,354`) → **merge**. This is the PD-1 correction of 97 §5 — the actual mixed-ownership surfaces are the `managed-fields` ones.

**Step 2 — ownership from lock (failing test — the F3 case-3 fix).** The set of drwn-owned MCP server names for a merge surface must be computed from the **effective resolved servers** (`EffectiveState.activeServers` + `cardServerDefinitions`), not only from `previousClaudeHashes`/`previousCodexNames`. Test: with an **empty write-record** (fresh checkout) and a card that declares server `context7`, `drwn write` still identifies `context7` as drwn-owned and correctly field-merges it into a `.codex/config.toml` that already contains a user server `mine` — preserving `mine`, updating `context7`. (Today, empty `fieldHashes` ⇒ ownership set empty ⇒ no-op; see `sync.ts:255-259`.)

**Step 3 — implement.** In the Codex and machine-Claude merge paths, compute `ownedNames = union(namesFromEffectiveServers, namesFromPriorFieldHashes)`. The prior hashes remain a signal for detecting *user* edits to a previously-drwn field; the effective lock is the source of truth for *what drwn owns now*.

**Step 4 — scope the determinism claim (doc + assertion).** Add a test asserting projection surfaces are byte-identical across two runs with different pre-existing merge-surface disk state (determinism holds for projections; merge surfaces differ by user content — the F3 spike case 2). No new code; a guard test that encodes the taxonomy.

**Step 5 — commit gate:** `bun test && npx tsc --noEmit`.

**Acceptance:** a teammate's fresh checkout field-merges drwn's servers into a committed `.codex/config.toml` without a local write-record, preserving their own servers.

---

### Phase 4: Mode resolution + machine-local overlay (invariants — resolves F4, F6)

**Files:**
- Create: `cli/core/config-local.ts` (read/write `config.local.json` + `card.lock.local`)
- Create: `cli/core/mode-resolution.ts` (`resolveMode(card, ctx)`)
- Modify: `cli/core/effective-state.ts:48,71-96` (merge overlay; attach per-card mode; local-wins-with-warning)
- Modify: `cli/core/types.ts:114-137` (`ProjectConfig` gains optional `materialization?: "vendored" | "linked"` — PD-3, **not** on `CardManifest`)
- Modify: `cli/core/project-writes.ts` (read/round-trip the new `materialization` field)
- Test: `test/core-config-local.test.ts`, `test/core-mode-resolution.test.ts`, `test/core-effective-state-overlay.test.ts`

> **Task-65 interlock (read before starting).** This phase ships the **library + resolution + tests** for the overlay and mode. The operator-facing commands that *drive* them — `drwn dev`, `card link`, `card unlink` — are **task 65 Phase 3**. Where the two plans overlap on `config.local.json`, this phase is the authority for the *overlay data model* (adds local activation + `card.lock.local`); if task 65 Phase 3 has already shipped a link-overrides-only `config.local.json`, extend it rather than replace. Acceptance criteria below that require a CLI verb (`drwn dev …`) are **checked after** task 65 Phase 3 lands; the programmatic criteria are checked here.

**Step 1 — overlay I/O (failing test).** `config.local.json` = `{ activate?: string[]; overrides?: Record<string,string> }`; `card.lock.local` uses the same schema/reader as `card.lock` (`cli/core/card-lock.ts`). Writing either ensures the `.gitignore` entries (Phase 2 helper). Test: writing an overlay activation never touches `config.json`/`card.lock`; both local files are gitignored.

**Step 2 — `resolveMode` total function (failing test — the F6 fix).** Precedence, highest wins (analysis 97 §8): (1) explicit invocation override (`dev` → linked; vendor override → vendored); (2) explicit project `materialization` — `"vendored"` wins unconditionally, `"linked"` links if source present else vendored+warn; (3) per-card auto — `CARDS_SOURCE_PATH` set **and** this card's source present ⇒ linked (only when no explicit setting); (4) default ⇒ vendored. Test the full table incl. `set-but-source-absent ⇒ vendored`, and `materialization:"vendored"` **not** overridden by `CARDS_SOURCE_PATH`.

**Step 3 — merge overlay in `buildEffectiveState`.** Inside the project branch (`effective-state.ts:71-96`), union committed `card.lock` with `card.lock.local` and committed activation with `config.local.json` activation; **local-wins with a loud warning** on conflict. Attach `mode` per card via `resolveMode`. Extend `EffectiveState` with `overlayCards: CardLockEntry[]` and a `mode` on each active card. Test: an overlay-activated card appears in `activeCards` with `mode` set and is flagged as overlay-origin.

**Step 4 — overlay content home (F4).** Mark overlay cards so Phase 5 materializes them **from `extracted/<treeSha>`**, never vendored (they must not enter `vendor/`). Test: the effective state marks overlay cards `vendorEligible: false`.

**Step 5 — commit gate:** `bun test && npx tsc --noEmit`. `check-no-local-paths` stays green (overrides never enter committed files).

**Acceptance (programmatic, checked here):** `resolveMode` returns `vendored` for an explicit `materialization:"vendored"` project even with `CARDS_SOURCE_PATH` set and source present; `set-but-source-absent ⇒ vendored`; `buildEffectiveState` surfaces an overlay-activated card with `vendorEligible:false`, leaving `config.json`/`card.lock` untouched.
**Acceptance (CLI, deferred to task-65 Phase 3):** `drwn dev @scope/x` live-links without a committed-lane change (`git status` clean). Do not gate this phase's completion on it.

---

### Phase 5: `drwn write` becomes the total reconcile (invariant C — the integration point)

**Files:**
- Modify: `cli/core/sync.ts:380` (`syncRepository` orchestration)
- Modify: `cli/core/mind-generator/sync-mind.ts:55-71,176-199` (replace `ensureDirSymlink` with vendor-reflink placement)
- Modify: `cli/core/materialize.ts` (skills read from `vendor/<sha>` instead of `extracted/<sha>` for vendored cards)
- Modify: `cli/commands/write.ts:104-116` (print resolved mode per card)
- Test: `test/core-reconcile.test.ts`, `test/core-write-offline.test.ts`, `test/core-write-idempotent.test.ts`, `test/commands-write-mode-readout.test.ts`

**Step 1 — desired-set + add/repair (failing test).** `syncRepository` computes `DESIRED_VENDOR = { treeSha | card ∈ committed lane ∧ mode==vendored }` (overlay + linked excluded, Phase 4). For each, `ensureVendorTree` (Phase 1) using the card's manifest (Phase 0). Test: a fresh project with one vendored card ends with `vendor/@scope/name/<sha>/` present and verifying.

**Step 2 — prune (failing test).** After add, `pruneVendorTrees(vendorRoot, DESIRED_VENDOR, …)` removes stale clean trees, preserves drifted ones. Test: removing a card then `drwn write` deletes its vendor tree; a hand-edited stale tree is preserved+reported.

**Step 3 — content source routing (failing test).** Materialization reads bytes by mode: `vendored` → `vendor/<sha>/`; `linked` → live `CARDS_SOURCE_PATH` tree; `overlay` → `extracted/<sha>/`. Skills (`materialize.ts`) and mind content (`sync-mind.ts`) both route through this. Test: a vendored card's skill materializes from `vendor/`; an overlay card's from `extracted/` with **no** `vendor/` entry created.

**Step 4 — de-symlink the mind layer (failing test — PD-4).** Replace `ensureDirSymlink` (`sync-mind.ts:55-71,176-199`) with reflink placement (Phase 1 `populateFile`) of the belief/memory/skill subtrees from `vendor/<sha>/…` (vendored) or `extracted/<sha>/…` (overlay) into `generated/minds/<card>/…`; rebuild the composed `generated/mind/` mount from those real files. Drop the `generated-symlink` write-record kind for **new** writes (keep the reader for Phase 8 migration). Per PD-4, `generated/` remains a **projection surface tree** (gitignored, regenerated) — it is not committed and gains no committable content; only its store-symlinks are removed. Test: no symlink is created in a project write; the generated mind bundle is real files; a second-machine checkout with an empty store reconstructs `generated/` offline from `vendor/`.

**Step 5 — offline + idempotent + crash-safe (failing tests).** (a) Offline: commit `config.json`+`card.lock`+`vendor/`, wipe the store, `drwn write` succeeds with no network. (b) Idempotent: two consecutive `drwn write` runs produce identical trees + a no-op second diff. (c) Crash-safe: corrupt one file in a `vendor/<sha>` then `drwn write` repairs it (Phase 1 `ensureVendorTree`).

**Step 6 — mode readout.** `drwn write`/`status` print `@scope/x@2.1 → vendored` / `@you/y → linked from <dir>` per card (agent-operator principle). Test: output contains the per-card mode + reason.

**Step 7 — drift signpost names the vendor edit point (failing test — 97 §6 step 7).** Today `verifyManagedPaths` (`sync.ts:195-240`) throws on a hand-edited projection surface. Extend the refusal message to name the correct upstream edit point: for a **vendored** card, `edit vendor/@scope/name/<sha>/… then drwn write` (and, when task-65 provenance `upstream` is present on the card, prefer `git+…#skills/<name>`); for a **linked** card, the live source path. Test: editing a materialized `.claude/skills/x/SKILL.md` then `drwn write` is refused with a message containing the `vendor/@scope/name/<sha>/` path (not just the local surface path), edit preserved.

**Step 8 — commit gate:** `bun test` (ubuntu+windows) `&& npx tsc --noEmit`.

**Acceptance:** analysis 97 §16 criteria 1, 2, 4, 7, and the projection-drift-signpost criterion pass end-to-end.

---

### Phase 6: Store concurrency + GC roots (Q2 hardening + Q3)

**Files:**
- Modify: `cli/core/card-store.ts:467-487` (`ensureExtracted` Windows rename spelling)
- Modify: `cli/core/card-store.ts` (narrow per-card fetch lock + backoff around `git.fetch`/clone)
- Modify: `cli/commands/store/gc.ts:22-27` (roots-based prune of `extracted/` + stale temp)
- Create: `cli/core/store-gc.ts` (`computeGcRoots`, `planGc`)
- Test: `test/core-ensure-extracted-concurrency.test.ts`, `test/core-store-gc-roots.test.ts`, `test/commands-store-gc.test.ts`

**Step 1 — rename-success spelling (failing test).** `ensureExtracted`'s rename-onto-existing success rule must treat POSIX `EEXIST`/`ENOTEMPTY` **and Windows `EPERM`/`ENOTEMPTY`** as "another writer finished" → return the existing dir. Test: simulate the errno; assert success. (Store-local temp is already correct — `${extractedDir}.tmp.<rand>` is on the store filesystem.)

**Step 2 — concurrent extract (failing test).** Two concurrent `ensureExtracted` for the same treeSha both resolve to the same dir with no corruption. Test: `Promise.all` of two extractions; assert identical content + one surviving dir.

**Step 3 — narrow fetch lock.** Wrap `git.fetch`/clone-into-bare in bounded retry+backoff on git ref-lock contention; different cards proceed in parallel; **no store-global lock**. Test: two fetches of different cards run concurrently; a simulated lock error retries then succeeds.

**Step 4 — GC roots (failing test — PD-5).** `computeGcRoots(agentsDir, { projectRoots })` = union of: every discovered project's `card.lock` pinned treeShas + every committed `vendor/**/<sha>` tree + local source treeShas + a recency retention window from `store.json`. **Project discovery (PD-5):** `projectRoots` comes from the opt-in machine index `~/.agents/drwn/projects.json` (the same index task 65 Phase 6 registers on `init`/first write); the **current** project is always included; a **missing index degrades to current-project-only** — never a machine-wide filesystem scan. `planGc` returns `{ prune: string[]; keep: string[] }` over `extracted/` and stale `*.tmp.*`. Test: a sha referenced by a committed vendor tree is **never** in `prune`; with no `projects.json`, roots = current project only and unknown-project shas are still not pruned unless outside the retention window.

**Step 5 — wire `store gc`.** `drwn store gc [--dry-run(default)] [--prune]`: dry-run prints the plan; `--prune` deletes `extracted/` entries + stale temp not in roots (bare repos still get `git gc`). Test: dry-run never deletes; `--prune` removes only unreferenced shas.

**Step 6 — commit gate:** `bun test` (ubuntu+windows) `&& npx tsc --noEmit`.

**Acceptance:** analysis 97 §16 criteria 3 (concurrency) + 8 (gc roots) pass.

---

### Phase 7: Distribution — `card fork`, requirement-3 honesty, hook-consent surfacing (invariant D)

**Files:**
- Create: `cli/commands/card/fork.ts` (register in `cli/index.ts`)
- Modify: `cli/commands/card/update.ts`, `cli/commands/card/outdated.ts` (operate against vendored pins; re-vendor on update)
- Modify: `cli/core/card-install.ts` / write entry (first-write hook-consent loud notice)
- Test: `test/commands-card-fork.test.ts`, `test/core-update-revendor.test.ts`, `test/core-hook-consent-notice.test.ts`

> **Task-65 interlock.** `card update` and `card outdated` **exist today** (`cli/commands/card/{update,outdated}.ts`) and are in scope here — this phase only makes them re-vendor/report correctly against the `treeSha` pins. The porcelain **`drwn up`** (whole-project outdated→update→write) does **not** exist and remains **task 65 Phase 2**; task 67 does not create it. When `up` later lands, it inherits the reconcile behavior for free (it calls `write`).

**Step 1 — `drwn card fork` (failing test).** `card fork @team/y [--scope @you] [--into <org-monorepo>]`: clone the source into a scope you own (or the org monorepo referenced by `CARDS_SOURCE_PATH`), rewrite `card.json` name to the new scope, leave provenance to the source's own git remote. Test: fork produces an editable source under the new scope; original untouched.

**Step 2 — `card update` re-vendors (failing test).** `card update` re-resolves pins → refreshes `card.lock` (with the new `treeSha`, PD-2) → Phase 5's reconcile on the next `write` re-vendors the new treeSha and prunes the old. Test: a project pinned below latest, after `card update` + `drwn write`, has the new `vendor/<newSha>` and no `vendor/<oldSha>`. Assert `card outdated --fetch` reports correctly against a vendored pin. (`drwn up` is task 65 — not exercised here.)

**Step 3 — hook-consent notice (failing test — review low finding).** On the first `drwn write` on a machine where `card.lock` carries `hookConsent` (`card-lock.ts:33-36`) but no local acknowledgment exists, print **"hooks present, consented by `<consentedAt/range>` on another machine"** loudly. Test: a cloned project with a consented hook surfaces the notice on first local write.

**Step 4 — requirement-3 scope note (doc).** Confirm in the command help + `docs-astro` that V1 notifies version-up only; distributable deprecation/successor is V2 (catalog-reflected). No code beyond help text.

**Step 5 — commit gate:** `bun test` `&& npx tsc --noEmit`.

**Acceptance:** `drwn card fork --help` present and functional; `card update` + `write` re-vendors and prunes; hook-consent notice surfaces on cross-machine checkout.

---

### Phase 8: Migration runbook + committed-surfaces mode (resolves F7)

**Files:**
- Create: `cli/core/migrate-vendor.ts` (`migrateSymlinkLayerToVendor`)
- Modify: `cli/commands/write.ts` or a `store migrate` subpath (invoke migration on detect)
- Modify: `cli/core/config-local.ts` / project config (`committedSurfaces: boolean` opt-in)
- Create: `.ai/analyses/` short migration note (operator runbook)
- Test: `test/core-migrate-vendor.test.ts`, `test/core-committed-surfaces.test.ts`

**Step 1 — detect + migrate (failing test).** `migrateSymlinkLayerToVendor(projectRoot)`: using the existing write-record, find `generated-symlink` entries (`write-record.ts`), re-vendor each pinned sha (Phase 1) and replace symlinks with reflinked content; shrink the write-record from the current 5-kind schema to the disposable managed-path list (a real from-schema step, reusing analysis 82's `diffWriteRecord` routing). Test: a project seeded with the legacy symlink layer migrates to `vendor/` with no symlinks and a shrunk record.

**Step 2 — surface reclassification (failing test).** On migration, classify existing committed surfaces (Phase 3 `surfaceKind`): projection surfaces are added to `.gitignore` (announced, one-time), merge surfaces stay committed. Test: a committed `.claude/skills/x` is gitignored post-migration; a committed `.codex/config.toml` is retained.

**Step 3 — committed-surfaces mode (failing test).** `committedSurfaces: true` in project config makes projection surfaces committed too (larger diffs, zero-tooling consumption for drwn-less teammates) — the non-default escape hatch. Test: with the flag, projection surfaces are **not** gitignored and are written as committed content.

**Step 4 — runbook doc.** A short `.ai/analyses/NN_vendored-migration-runbook.md`: publish→re-vendor→announce-gitignore steps; when to use committed-surfaces mode; explicit statement that pure drwn-less consumption without the flag is out of scope.

**Step 5 — commit gate:** `bun test` (ubuntu+windows) `&& npx tsc --noEmit && verify:release`.

**Acceptance:** a legacy generated-symlink project migrates automatically; committed-surfaces mode serves drwn-less teammates.

---

## Cross-cutting acceptance gates (every phase)

- `bun test` green on ubuntu-latest AND windows-latest.
- `npx tsc --noEmit` clean.
- `verify:release` passes (includes hardcoded-path scan / `check-no-local-paths`).
- **No new symlinks in any committed path** (analysis 82 + 96 D3 invariant); the mind layer's store-symlinks are removed, not relocated.
- **No shared writable inode between `vendor/` and the store** (reflink or copy only).
- Every user-facing refusal/warning names the next correct command (agent-operator principle, 94 §1).

## Risks & mitigations

- **Reflink unsupported on the target FS (Windows/NTFS, some Linux).** Mitigation: the `populateFile` fallback chain (Phase 1); CI exercises the copy path on windows-latest; disk-economy is a non-correctness property (review low nit — vendored content is durable regardless).
- **`git.ts` lacks `hashObject`/`mkTree`.** Not needed for vendor (filesystem reflink) — only for `refs/meta/cards`, which stays deferred (task 65 Phase 5 / V2). No blocker here.
- **Interaction with task 65 Phase 3 `config.local.json`.** Resolved by the Phase 4 interlock note: Phase 4 owns the overlay *data model*; if task 65 Phase 3 shipped a link-only `config.local.json`, extend it. CLI-verb acceptance (`drwn dev`/`link`) is deferred to task 65, not blocking task 67.
- **Store read-only chmod vs existing writers.** Resolved in Phase 1 Step 3b: only regular *files* go `0o444`; directories stay writable so `.integrity` sidecars and GC deletion keep working.
- **`treeSha` lock-schema bump (v4→v5).** A tolerant v4 reader backfills `treeSha` on load and persists on next write (PD-2); no forced re-lock. Guard with the `test/core-card-lock.test.ts` v4-back-compat case.
- **Vendor churn in PR diffs.** Mitigated by `linguist-generated=true` (Phase 2) and readable `vendor/@scope/name/<shortSha>/` paths (Phase 1).
- **Migration of live projects mid-flight.** Phase 8 reuses proven `diffWriteRecord` routing (analysis 82) and is gated behind detection; committed-surfaces mode is the escape hatch for mixed teams.

## Out of scope (tracked elsewhere)

- Distributable deprecation / successor notification (`refs/meta/cards` union-merge) — V2 / task 65 Phase 5; catalog-reflected deprecation is the named closing move.
- Explicit worktree management UX + worktree-aware GC roots — V2 (§13 of analysis 97). The per-branch divergence *property* works in V1 (committed branch content).
- Many-parallel-worktree concurrency stress hardening — V2.
- Push/session-hook version-up nudges — V2.
- Catalog schema v2 (channels, per-version integrity) — Stage C.
- Card signing / scope-ownership trust — trust roadmap (94 §3.5, 96 G6).
- Porcelain `use`/`up`/`release`, `card meta`, `projects`, defaults-retirement — task 65 (this plan only ensures they operate against `vendor/`).
