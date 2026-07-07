# ABOUTME: Unified, strictly-sequential implementation plan that delivers the analysis 97/98 target architecture end to end — merging the materialization substrate (task 67) and the Stage-B verbs/provenance/metadata (task 65) into one linear phase order with a single 97/98-V1 acceptance gate followed by a post-V1 hardening tail.
# ABOUTME: Supersedes tasks 65 and 67. Substrate-first ordering (vendor + integrity + reconcile) then the operator verbs (source sync, dev/link, use/up/release), with every prior "whoever ships first" hedge collapsed into a definite dependency.

# Task 68: drwn Card Model — Unified Sequential Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan phase-by-phase, in order.

**Status**: Implementation complete (phases 1–18); **repair in progress** per `.ai/tasks/68_review01_task68_implementation_alignment_review.md` and `.ai/tasks/68_review01_re_repair-strategies.md` (R0 doc ratification → R1–R5 code). Supersedes tasks 65 and 67.
**Created**: 2026-07-05
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 18 sequential phases (shipped) + 5 repair phases (R0–R5). Phases 1–13 deliver the analysis 97/98 **V1 acceptance gate**; phases 14–18 are post-V1 hardening. Repair R1–R3 is core substrate work (not a small patch).
**Dependencies**: Analysis **97 rev 4** (design of record — decision ledger §12, boundary contracts §5a incl. §5a·5 vendor-manifest sidecars), 97_review01 + review02 (findings resolved), 98 (operator mental model, target-scope). Stage A (deprecation reader/writer) already shipped in the working tree.
**References**: [.ai/analyses/97_worktree-vendored-card-architecture.md, .ai/tasks/68_review01_task68_implementation_alignment_review.md, .ai/tasks/68_review01_re_repair-strategies.md, .ai/analyses/97_review01_vendored-architecture-faults-and-amendments.md, .ai/analyses/98_target-tooling-mental-model-and-usage-guide.html, .ai/analyses/94_harness-tooling-critical-assessment.md, .ai/analyses/82_drwn-portable-multi-surface-write-path-target-architecture.md, .ai/tasks/65_drwn-card-model-stage-b-implementation-plan.md (superseded), .ai/tasks/67_vendored-card-materialization-implementation-plan.md (superseded), cli/core/card-store.ts, cli/core/card-lock.ts, cli/core/card-install.ts, cli/core/card-project.ts, cli/core/materialize.ts, cli/core/sync.ts, cli/core/mcp.ts, cli/core/skills.ts, cli/core/mind-generator/sync-mind.ts, cli/core/write-record.ts, cli/core/effective-state.ts, cli/core/store-paths.ts, cli/core/git.ts, cli/core/project.ts, cli/core/card-manifest.ts, cli/core/types.ts, cli/commands/write.ts, cli/commands/init.ts, cli/commands/store/gc.ts, cli/index.ts]

---

## 0. How to read and execute this plan

This is the **single linear path** to the analysis 97/98 target architecture. It merges two prior plans:

- **Task 67** (materialization substrate — vendored trees, integrity manifest, reflink population, the total `drwn write` reconcile, mode resolution + overlay data model, GC, `card fork`, migration).
- **Task 65** (Stage-B verbs — upstream provenance + `card source sync`, porcelain `use`/`up`/`release`, `dev`/`link` CLI, distributable metadata, defaults retirement, trust hardening).

**Execution rule:** do the phases **in numeric order**. Each is independently shippable/reviewable and gated by `bun test` + `npx tsc --noEmit`. The **97/98 V1 acceptance gate** (§"V1 acceptance gate") sits after Phase 13 — at that point the architecture in 97/98 is fully realized and demonstrable. Phases 14–18 harden quality and trust; they do not gate 97/98.

**Why substrate-first (the ordering rationale):** the Stage-B porcelain (`use`/`up`/`write`) must be built on the *vendored* write path, not the soon-deleted symlink path — building verbs first would mean building them twice. The few reverse dependencies all degrade gracefully, so they are collapsed to definite one-directional dependencies:

- The overlay **data model** (`config.local.json` + `card.lock.local`) is built in **Phase 7**; the overlay **CLI verbs** (`dev`/`link`) consume it in **Phase 8**.
- The drift **signpost** ships in **Phase 9** already enriched with `upstream` provenance, because provenance (**Phase 5**) precedes it.
- GC (**Phase 11**) ships current-project-scoped; the machine-wide `projects.json` index that widens it lands in the hardening tail (**Phase 16**), and GC degrades safely without it.

## 1. What the current code already gives us (leverage, don't rebuild)

Verified by survey of the CLI:

| Already true | Where | Consequence |
|---|---|---|
| Skill materialization is **copy-based** (`cpSync` → `materializeDir`), not store-symlinked | `cli/core/materialize.ts:41`, `cli/core/skills.ts:392` | The de-symlink work is **narrow** — only the mind layer symlinks the store. |
| Store symlinks exist **only** in the mind generated layer | `cli/core/mind-generator/sync-mind.ts:55-71,176-199` (`ensureDirSymlink`) | Phase 9 replaces these with reflinked vendor content; skills untouched. |
| `computeCardIntegrity` is a **per-file, mode-aware** hash (raw bytes + exec-bit, sorted, canonical JSON → `sha256-…`) | `cli/core/card-store.ts:343-357` | The normalization-tolerant manifest is an **extension** reused as `card.lock.integrity`. |
| `ensureExtracted` is **atomic** (store-local temp + `rename`, EEXIST-tolerant) | `cli/core/card-store.ts:467-487` | Store concurrency is mostly done; Phase 11 adds only the Windows rename spelling + a narrow fetch lock. |
| Lock has `integrity` + `hookConsent`; extraction keyed by git **treeSha** | `cli/core/card-lock.ts:26,33-36`, `store-paths.ts:91-94` | Manifest derives from `integrity`; treeSha becomes the vendor address (PD-2). |
| `EffectiveState` carries the resolved server set (`activeServers`, `cardServerDefinitions`) | `cli/core/effective-state.ts:29-46` | Ownership-from-lock (Phase 6) threads an existing value. |
| `managed-fields` write-record entries with per-server `fieldHashes` | `cli/core/write-record.ts:29`, `sync.ts:255-318,349-355` | Merge surfaces already field-merge; the fix is to derive ownership from the lock. |
| `card update`, `card outdated`, `card clone`, `card apply`, `card deprecate`, `store gc/verify` **exist** | `cli/commands/card/*`, `cli/commands/store/*` | Phases enrich these; they aren't greenfield. |
| `use`, `up`, `dev`, `release`, `card link/unlink`, `card fork`, `card source sync`, `card meta`, `projects` are **absent** | — | Built in the phases below. |

## 2. Pre-flight ratified decisions (PD-1..8 — resolve code-vs-97 forks before coding)

**PD-1 — Surface kind follows the write-record *kind*, not the filename (refines 97 §5).** Project `.mcp.json` and `.cursor/mcp.json` are written **whole-file** (`managed-content`; `sync.ts:298-301,363-368`) — drwn owns the entire file. The genuine **merge** surfaces (mixed ownership, `managed-fields`) are **machine `~/.claude.json`** (`sync.ts:305-318`), **`.codex/config.toml`** (`sync.ts:350-355`), and **`.claude/settings.json`** hooks. Therefore: `managed-content` + `managed-directory` ⇒ **projection** (deterministic, gitignored); `managed-fields` ⇒ **merge** (committed, field-merged). The F3 user-server-preservation concern is addressed for the actual merge surfaces (Phase 6); project `.mcp.json` was never a merge target.

**PD-2 — `card.lock` gains an explicit `treeSha` (the vendor address; fills a 97 §12 gap).** Add `treeSha: string` to newly written `CardLockEntry` records (lockfileVersion 4→5). **`treeSha` is required to *write* a v5 lock, optional on *load* of v2–v4** (`treeSha?: string` at the legacy read boundary). Backfill happens in a store-aware layer that has `agentsDir`/bare-repo context — `resolveProjectCards` / `card update` / `write` / migration via `getCommitTree` — **not** in `loadCardLock(projectRoot)` (`card-lock.ts:77` has no such context, per review02 finding 2). Legacy backfill is **pin-preserving**: derive the tree from each existing lock entry's `git.commit`, never by re-resolving a semver/range request. The vendor directory is *derived* (`vendor/@scope/name/<shortSha>/`), not stored. Lands in **Phase 3 Step 0**.

**PD-3 — Project materialization mode lives on `ProjectConfig`, not the card manifest.** Add `materialization?: "vendored" | "linked"` to `ProjectConfig` (`types.ts:114-137`), written via `project-writes.ts` — not `CardManifest`.

**PD-4 — The `generated/` layer is retained for mind *composition*; only its store-symlinks are removed. The locked-vs-active split is preserved (review02 decision 7).** Per-card `generated/minds/<card>/…` is emitted for every **locked** card; composed `generated/mind/…` (+ `generated/minds.json`) is emitted from the **active** stack — both are projection output (gitignored, regenerated). Overlay cards enter both sets like any other card (locked → `minds/`, active → `mind/`) but source from `extracted/<sha>/…`. Only the per-entry **store symlinks** inside `generated/minds/<card>/…` change: they become reflinked content from the resolved vendor tree (`vendor/@scope/name/<shortSha>/…`) for vendored cards or `extracted/<sha>/…` for overlay cards.

**PD-5 — GC project discovery = an opt-in machine index, current project always a root.** `computeGcRoots` reads `~/.agents/drwn/projects.json` (Phase 16); until it exists, roots = current project + committed vendor + local sources + retention. Missing index degrades to current-project-only; GC stays dry-run by default.

**PD-6 — `vendor/` is an immutable committed cache, not an edit point (review02 finding 1; mirrors 97 §5a·1).** A *pinned* vendor tree that fails its manifest is **repaired from the store** (overwritten), never accepted as an edit. Every drift signpost points to the **source** edit path — the card's `upstream` ref when known, else `drwn card fork` → edit → publish → update. There is **no** "edit `vendor/` then `drwn write`" flow. (Editable vendor patches are a separate, out-of-scope feature needing re-lock/re-manifest semantics.)

**PD-7 — `file:` origins are never vendored into the committed lane (review02 finding 5; mirrors 97 §5a·2).** `file:` resolution yields no git tree SHA (`card-store.ts:844`), so it cannot produce a machine-independent `treeSha`. A `file:` card is **linked/overlay/dev-only**: it is excluded from `DESIRED_VENDOR` (Phase 9) and already barred from `config.json`/`card.lock` by `check-no-local-paths` (Phase 8). To vendor it, publish/import it into the git-backed store first (it then locks as a `git`/`store` origin with a real `treeSha`).

**PD-8 — replacement is crash-recoverable, not atomically crash-safe (review02 finding 4; mirrors 97 §5a·4).** `ensureVendorTree` builds the complete temp tree **before** removing the live tree, then does a short `rm`→`rename` swap. A crash in that window leaves the tree missing, which the next `drwn write` rebuilds deterministically. The claim is **"converges after crash,"** not "atomic replace." Wording is scrubbed accordingly (invariant C, Phase 3 Step 4, Phase 9).

**PD-9 — committed vendor-manifest sidecars (task 68 review01 reply; mirrors 97 §5a·5).** Each populated vendor tree has a committed sidecar at `.agents/drwn/vendor-manifests/@scope/name/<shortSha>.json` recording `{ card, treeSha, integrity, manifest }`. Sidecars live outside the vendored content root. **Current-tree verification** uses `card.lock.integrity` digest-compare against live `vendor/` bytes (offline, no store). Sidecars enable stale-tree prune (after lock entry gone) and store GC short-SHA→full-SHA resolution. Missing/invalid sidecars **preserve** stale trees (never delete). Verified current trees **backfill missing sidecars offline**. Lands in repair R1 (`cli/core/vendor-manifest.ts`).

## 3. Combined ratified decisions (from 97 §12 + §5a + task 65 recap)

| # | Decision | Phase |
|---|----------|-------|
| A | Vendor is independent, normalization-stable, content-addressed; **reflink → read-only-hardlink → copy**; integrity anchor = normalization-tolerant manifest derived from `card.lock.integrity`; committed `.gitattributes vendor/** -text linguist-generated`; **committed `vendor-manifests/` sidecars** (PD-9) | 1,3,4, repair R1 |
| B | **Surface taxonomy**: projection (gitignored, deterministic) vs merge (committed, field-merged); owned-field set derived from the effective lock | 6 |
| C | `drwn write` is a **total, crash-recoverable, idempotent reconcile** (build-temp-then-swap add, drift-gated prune, overlay branch); "converges after crash," not atomic replace (PD-8); determinism scoped to projection surfaces | 9 |
| D | Requirement 3 partially served in V1 (pull-based version-up ships; distributable deprecation is post-V1, catalog-reflected) | 12,15 |
| E | Upstream ref `git+URL#subpath[@rev]`; `card source sync` is the only sync mechanism | 5 |
| F | Porcelain `use`/`up`/`release` over existing plumbing | 10 |
| G | Machine-local overlay (`config.local.json` + `card.lock.local`), local-wins-with-warning; `dev`/`link` are the verbs | 7,8 |
| H | Duplicate-skill: deterministic later-apply-wins + warning + `exclude` | 14 |
| I | `refs/meta/cards` union-merged, never force-pushed; successor same-scope-only auto-suggest | 15 |
| J | Machine defaults retire → profile card + bulk `projects` ops | 16 |

## 4. Success Criteria (the 97/98 V1 acceptance gate — checkable after Phase 13)

- [ ] A consumed card materializes into `.agents/drwn/vendor/@scope/name/<sha>/` with **no store symlink**; a second machine with an **empty store** checks out the branch and `drwn write` reconstructs projection surfaces **offline**.
- [ ] A **vendor edit cannot mutate the store** (reflink), or fails loudly (read-only-hardlink fallback).
- [ ] A fresh checkout with **`core.autocrlf=true`** verifies against the manifest — no false integrity failure.
- [ ] `drwn write` **prunes** a vendor tree when its card is removed/updated, **preserves+reports** a drifted one; a second run is a **no-op**; it **converges from a partial vendor tree**.
- [ ] A **merge surface** keeps a user-owned server across `drwn write`, and drwn identifies its own servers **on a fresh checkout with no write-record**.
- [ ] An explicit `materialization: "vendored"` is **not** overridden by `CARDS_SOURCE_PATH`; `set-but-source-absent ⇒ vendored`.
- [ ] A **personal card** activated via the overlay materializes **from the store** and leaves **zero trace** in `vendor/`.
- [ ] `drwn store gc --dry-run` reports roots correctly and never proposes pruning a referenced `<treeSha>`.
- [ ] `drwn card source sync --check` reports in-sync against a real upstream; `drwn use`, `drwn up`, `drwn release`, `drwn dev` exist and drive the vendored path.
- [ ] Editing a materialized projection surface then `drwn write` is **refused with a source signpost** (`git+…#skills/<name>` when upstream is known, else `drwn card fork` → edit → publish → update — never "edit vendor", PD-6), edit preserved.
- [ ] `bun test` green on ubuntu + windows; `npx tsc --noEmit` clean; `verify:release` passes.

---

# PART I — 97/98 V1 (Phases 1–13)

### Phase 1: Normalization-tolerant content manifest (invariant A — integrity anchor)

**Files:** Create `cli/core/content-manifest.ts`; Modify `cli/core/card-store.ts:343-357`; Test `test/core-content-manifest.test.ts`.

1. **Failing test.** `computeContentManifest(dir)` → `{ files: {path, exec, hash}[] }` sorted by `path`, `hash = sha256(normalizeEOL(bytes))` (CRLF→LF for UTF-8 text; raw bytes for binary). `verifyManifest(dir, manifest)` → `{ ok, mismatches[] }`. Test: LF file and its CRLF copy produce the **same** manifest; a binary flip mismatches; an exec-bit change is detected.
2. **Implement** reusing the `walkVersionTree` shape (`card-store.ts:313-341`; skip `.git`/`.integrity`; exec = `(mode & 0o111)!==0`); serialize `sha256-<hex over canonical JSON>` identically to today.
3. **Delegate** `computeCardIntegrity` to it. Keep `test/core-card-integrity-content.test.ts`, `test/core-card-publish-mind-content.test.ts`, `test/commands-store-migrate-to-git.test.ts`, `test/core-card-install*` green.
4. **Back-compat (day-one migration decision).** Digest is **identical for LF text and for binary**; differs only for CRLF-shipping text (rare, already fragile). Rule: **no re-lock/re-publish**; add a test asserting byte-identical digest for an LF fixture vs a pre-recorded value.
5. **Commit gate:** `bun test && npx tsc --noEmit`.

**Acceptance:** the F2 CRLF round-trip verifies; existing LF locks recompute byte-identically.

---

### Phase 2: Stage-A debt + upstream-ref parser (task-65 foundations)

**Files:** Modify `cli/core/card-store.ts` (batch deprecation reader); Create `cli/core/git-ref.ts`; Test `test/core-git-ref.test.ts`, `test/core-card-deprecate.test.ts`.

1. **Failing test — ref parser.** `parseUpstreamRef("git+https://h/r.git#skills/x@v1.2.0")` → `{ gitUrl, subpath:"skills/x", rev:"v1.2.0" }`; no `@rev` → `rev:null`; bare local path → throws `UPSTREAM_LOCAL_PATH_REJECTED`.
2. **Implement** `parseUpstreamRef`/`formatUpstreamRef`, reusing git-URL parsing from `parseCardSpec` (don't duplicate).
3. **Batch the Stage-A deprecation reader** (94 §3.6): replace the per-version `git config` loop in `listCards` with a single `git config --get-regexp '^drwn\.deprecated\.'`. Add a test asserting one git invocation for N versions.
4. **Commit gate:** `bun test test/core-git-ref.test.ts test/core-card-deprecate.test.ts && npx tsc --noEmit`.

---

### Phase 3: Vendor population primitive + lock `treeSha` (invariant A — mechanism)

**Files:** Create `cli/core/vendor.ts`; Modify `cli/core/store-paths.ts`, `cli/core/card-lock.ts:15-46`, `cli/core/card-project.ts:34-57`, `cli/core/card-store.ts:669-697` and `:467-487`; Test `test/core-vendor.test.ts`, `test/core-card-lock.test.ts`.

0. **Lock schema carries `treeSha` (failing test — PD-2).** Add `treeSha?: string` to the shared `CardLockEntry` type while legacy readers exist; `writeCardLock` writes `lockfileVersion:5` and rejects any committed git/store card missing `treeSha`. `lockfileVersion` union becomes `2|3|4|5`; new writes default 5. **`loadCardLock` does not backfill** (no `agentsDir`/bare-repo context, `card-lock.ts:77`): v2–v4 entries expose `treeSha?: string`. Create a store-aware `backfillLockTreeShas(agentsDir, cards)` helper used by `resolveProjectCards`, `card update`, `write`/effective-state build, and migration before any v5 write. It computes each missing tree from that lock entry's existing `git.commit` via `getCommitTree` and persists on the next lock write; it must never re-resolve the original semver/range request. If a committed-lane card lacks both `treeSha` and a usable git commit, fail with a command signpost (`card update`/reapply) instead of inventing a new pin. `resolveRepoVersion` already computes `treeSha` (`card-store.ts:678`) — thread it onto `ResolvedCard`; `file:` origins intentionally leave it undefined. Add tests: a v4 lock loads with `treeSha` undefined and is backfilled by `backfillLockTreeShas`; a semver range whose latest moved still backfills to the locked commit's tree, not the latest version. **First because Phase 9 keys `DESIRED_VENDOR` on `(name, treeSha)`.**
1. **Path helpers (failing test).** `resolveProjectVendorRoot` → `<root>/.agents/drwn/vendor`; `resolveProjectVendorTree(root, name, treeSha)` → `…/vendor/@scope/name/<shortSha>/` (12-char; lock keeps full treeSha as address key).
2. **`populateFile` (failing test — F1 spike).** Order: `copyFileSync(src,dst,COPYFILE_FICLONE)` (reflink) → on `ENOTSUP`/`EXDEV`/`EINVAL`, hardlink **only if source is read-only** → else plain copy. Test (POSIX): after reflink, editing `dst` leaves `src` unchanged + distinct inodes; read-only-hardlink edit → `EACCES`; copy always independent.
3. **Implement `populateFile`**; record the chosen mechanism for `--verbose`.
3b. **Store read-only chmod (failing test — completes F1).** `ensureExtracted` chmods **regular files only** to `0o444` after the rename (dirs stay `0o755` so `.integrity` sidecars + GC deletion keep working). Test: a hardlinked read-only store file refuses in-place write (`EACCES`); GC can still `rm -rf`.
4. **`ensureVendorTree` crash-recoverable (failing test — IR spike; PD-8).** If `verifyManifest(vendorDir).ok` → no-op; else populate the **complete** tree into sibling `vendor/.tmp-<sha>-<pid>` **first**, then `rm -rf vendorDir; renameSync(tmp, vendorDir)` (short replace window), then verify-or-throw. A pinned tree that fails verify is repaired from the store (overwritten) — vendor is not an edit point (PD-6). Test: a half-written tree converges on rerun; second call is a no-op. The claim is "converges after crash," not atomic replace.
5. **`pruneVendorTrees` drift-gated (failing test).** Delete a stale tree **iff** `verifyManifest` passes; else preserve + report. Test both.
6. **Commit gate:** `bun test test/core-vendor.test.ts test/core-card-lock.test.ts && npx tsc --noEmit`.

**Acceptance:** F1/IR spike behaviors are regression tests.

---

### Phase 4: `.gitattributes` + `init` gitignore authoring (invariant A hygiene)

**Files:** Create `cli/core/git-hygiene.ts`; Modify `cli/commands/init.ts:77-84`, `cli/core/project.ts`; Test `test/core-git-hygiene.test.ts`, `test/commands-init-hygiene.test.ts`.

1. **`ensureGitignoreEntries` (failing test).** Idempotently append under a `# drwn` block: `config.local.json`, `card.lock.local`, `write-record.json`, projection surface dirs (`.claude/skills/`, `.cursor/`). Second call adds nothing; user lines untouched.
2. **`ensureVendorGitattributes` (failing test).** Write/merge `.agents/drwn/.gitattributes` with `vendor/** -text linguist-generated`. Test: commit an LF `vendor/` tree, clone with `core.autocrlf=true`, working bytes unchanged.
3. **Wire into `init`** (replace the warn-only block); `drwn write` also calls both on first vendored write. Update the `init.ts:2` header note (it no longer promises not to mutate gitignore).
4. **Commit gate:** `bun test && npx tsc --noEmit`.

---

### Phase 5: Upstream provenance + `card source sync` (invariant E)

**Files:** Modify `cli/core/card-manifest.ts` (validate `skills.upstream`), `cli/commands/card/source/doctor.ts`, `cli/core/card-store.ts` (publish rejects local-path upstream); Create `cli/core/card-source-sync.ts`, `cli/commands/card/source/sync.ts`; Test `test/core-card-source-sync.test.ts`, `test/commands-card-source-sync.test.ts`.

1. **Manifest validation (failing test).** Extend the skills selection with `upstream?: Record<string,string>`; each value parses via `parseUpstreamRef` (Phase 2); each key must be in `include`. Reject a local-path value and an upstream key not in `include`.
2. **Implement validation** in the existing selection-validation path.
3. **`syncCardSource(agentsDir, cardName, {check})` (failing test).** For each `upstream`, resolve the git ref (clone/fetch into cache), extract the subpath at `@rev`/default branch, compare (`check`) or copy into `skills/<name>/`. Returns `{ synced[], stale[], moved[] }`. Test fresh+stale+moved.
4. **Implement**, delegating extraction to existing store git helpers; no bespoke script.
5. **Command + doctor wiring.** `drwn card source sync <card> [--check] [--json]`; `doctor` reports `stale`/`moved` as warnings.
6. **Publish guard.** `publishCard` rejects a manifest whose `upstream` contains a local path.
7. **Commit gate + acceptance:** `drwn card source sync @darwinian/operator --check --json` reports in-sync against real upstream.

---

### Phase 6: Surface taxonomy + ownership-from-lock (invariant B — resolves F3)

**Files:** Create `cli/core/surface-kind.ts`; Modify `cli/core/sync.ts:255-318,349-355` and `:380`; Test `test/core-surface-kind.test.ts`, `test/core-mcp-ownership-from-lock.test.ts`.

1. **Classifier (failing test — PD-1).** `surfaceKind` keys off the write-record kind: `managed-directory`|`managed-content` → projection; `managed-fields` → merge. Test: `.claude/skills/x` → projection; project `.mcp.json`/`.cursor/mcp.json` (`sync.ts:300,368`) → projection; `.codex/config.toml`/machine `.claude.json` (`sync.ts:313,354`) → merge.
2. **Ownership from lock (failing test — F3 case-3).** Owned server names for a merge surface come from `EffectiveState.activeServers` + `cardServerDefinitions`, not only prior `fieldHashes`. Test: with an **empty write-record** and a card declaring `context7`, `drwn write` field-merges `context7` into a `.codex/config.toml` already holding user server `mine` — preserving `mine`, updating `context7`.
3. **Implement:** `ownedNames = union(fromEffectiveServers, fromPriorFieldHashes)`; prior hashes stay a signal for detecting *user* edits.
4. **Scope the determinism claim (guard test).** Projection surfaces byte-identical across two runs with different pre-existing merge-surface disk state.
5. **Commit gate:** `bun test && npx tsc --noEmit`.

**Acceptance:** a fresh checkout field-merges drwn's servers into a committed `.codex/config.toml` with no local write-record, preserving user servers.

---

### Phase 7: Mode resolution + machine-local overlay data model (resolves F4, F6)

**Files:** Create `cli/core/config-local.ts`, `cli/core/mode-resolution.ts`; Modify `cli/core/effective-state.ts:48,71-96`, `cli/core/types.ts:114-137` (PD-3), `cli/core/project-writes.ts`; Test `test/core-config-local.test.ts`, `test/core-mode-resolution.test.ts`, `test/core-effective-state-overlay.test.ts`.

1. **Overlay I/O (failing test).** `config.local.json` = `{ activate?: string[]; overrides?: Record<string,string> }`; `card.lock.local` uses the `card.lock` reader. Writing either ensures the gitignore entries (Phase 4). Never touches `config.json`/`card.lock`.
2. **`resolveMode` (failing test — F6).** Precedence: (1) explicit invocation override; (2) explicit project `materialization` — `"vendored"` wins unconditionally, `"linked"` links if source present else vendored+warn; (3) per-card auto (`CARDS_SOURCE_PATH` set **and** source present, only when no explicit setting); (4) default ⇒ vendored. Test the full table incl. set-but-absent ⇒ vendored, and `"vendored"` not overridden by `CARDS_SOURCE_PATH`.
3. **Merge overlay in `buildEffectiveState`.** Union committed + local (activation and lock); **local-wins-with-warning**; attach per-card `mode`; extend `EffectiveState` with `overlayCards` + `vendorEligible`.
4. **Overlay content home (F4).** Mark overlay cards `vendorEligible:false` so Phase 9 materializes them from `extracted/<sha>`, never `vendor/`.
5. **Commit gate:** `bun test && npx tsc --noEmit`; `check-no-local-paths` stays green.

**Acceptance (programmatic):** explicit `materialization:"vendored"` resolves vendored even with `CARDS_SOURCE_PATH` set; overlay card is `vendorEligible:false` and leaves the committed lane untouched.

---

### Phase 8: `card link`/`unlink` + `dev` (overlay verbs; invariant G)

**Files:** Create `cli/commands/card/link.ts`, `cli/commands/card/unlink.ts`, `cli/commands/dev.ts`, `cli/core/write-watch.ts` (register commands in `cli/index.ts`); Modify `cli/commands/write.ts`, `cli/commands/card/status.ts`; Test `test/commands-card-link.test.ts`, `test/commands-dev.test.ts`, `test/commands-write-watch.test.ts`.

> Consumes the Phase 7 overlay data model; adds only the CLI surface.

1. **`card link`/`unlink` (failing test).** `drwn card link @scope/name file:<dir>` (per-card) + `--all-from <dir>` (bulk); `drwn card unlink [@scope/name|--all]`. Writes overrides only into `config.local.json`; `git status` shows no committed change.
2. **`write --watch` (failing test).** Add `--watch` to `drwn write` as a local dev loop: run one immediate write, then debounce and rerun when `config.json`, `config.local.json`, `card.lock`, `card.lock.local`, or linked source roots change. Do **not** watch `vendor/` or generated projection outputs, to avoid self-trigger loops. `--watch` is incompatible with `--dry-run` and `--json`, and keeps the existing `--target`/`--mcp-only`/`--skills-only` filters. Tests assert the flag exists, performs an initial write, reacts to a linked source edit, and ignores a generated-output change.
3. **`drwn dev` (failing test).** `drwn dev <card> [<dir>]` = link + `write --watch`; `drwn dev --off` = unlink + one-shot write. Ctrl-C exits watch mode without removing the link; `dev --off` is the explicit cleanup command.
4. **`status` readout.** `drwn status`/`card status` print `dev-linked (override → <dir>)` loudly.
5. **CI assertion.** `config.json`/`card.lock` never contain `file:` overrides (`check-no-local-paths`).
6. **Commit gate + acceptance:** link an operator source dir, edit a skill, `drwn write --watch` rematerializes it; `drwn dev --off` restores a one-shot vendored write; `git status` clean.

---

### Phase 9: `drwn write` becomes the total reconcile (invariant C — integration point)

**Files:** Modify `cli/core/sync.ts:380`, `cli/core/mind-generator/sync-mind.ts:55-71,176-199`, `cli/core/materialize.ts`, `cli/commands/write.ts:104-116`; Test `test/core-reconcile.test.ts`, `test/core-write-offline.test.ts`, `test/core-write-idempotent.test.ts`, `test/commands-write-mode-readout.test.ts`.

1. **Desired-set + add/repair (failing test).** `DESIRED_VENDOR = { (name, treeSha) | committed-lane card ∧ mode==vendored }`, keyed by the resolved vendor tree path rather than bare SHA (overlay + linked excluded; a `file:`-origin card has no `treeSha` and is excluded, PD-7). For each, `ensureVendorTree` (Phase 3) using the manifest (Phase 1).
2. **Prune (failing test).** `pruneVendorTrees` after add; stale clean removed via sidecar manifest (PD-9), drifted/missing/invalid sidecar preserved+reported — never delete without a valid sidecar.
3. **Single content-root abstraction (failing test — review02 finding 6).** Introduce **one** `resolveCardContentRoot(card, state)` helper as the sole place mode→content-root mapping lives, so skill routing (`card-skill-resolver.ts:36`) and mind routing (`sync-mind.ts:176`) cannot drift: `vendored` → `resolveProjectVendorTree(projectRoot, card.name, card.treeSha)`; `linked` → live `CARDS_SOURCE_PATH` source; `overlay` → `extracted/<sha>/`. Both skills and mind content route through it; test each mode resolves the expected root and that both callers use the helper.
4. **De-symlink the mind layer (failing test — PD-4).** Replace `ensureDirSymlink` with reflink placement (via `resolveCardContentRoot`) into per-card `generated/minds/<card>/…` for every locked card; rebuild composed `generated/mind/…` from the active stack (locked-vs-active split preserved). Drop `generated-symlink` for new writes (keep reader for Phase 18). No symlink created; second-machine empty-store checkout reconstructs `generated/` offline.
5. **Offline + idempotent + crash-recoverable (failing tests).** (a) wipe store, offline `drwn write` succeeds; (b) two runs identical + no-op second diff; (c) corrupt a file under `resolveProjectVendorTree(...)` → repaired from store (converges); (d) interrupt mid-populate → next run converges.
6. **Mode readout.** `drwn write`/`status` print per-card mode + reason.
7. **Drift signpost (failing test — 97 §6 step 7; PD-6).** Extend `verifyManagedPaths` (`sync.ts:195-240`) refusal to name the **source** edit point — vendor is an immutable cache, never an edit target: when the card's `upstream` (Phase 5) is present → `git+…#skills/<name>`; else → `drwn card fork` → edit → publish → update; linked → the live source path. Edit preserved. Test asserts the message never tells the user to edit `vendor/`.
8. **Commit gate:** `bun test` (ubuntu+windows) `&& npx tsc --noEmit`.

**Acceptance:** 97 §16 criteria 1, 2, 4, 7 + the drift signpost pass end-to-end.

---

### Phase 10: Porcelain `use`/`up`/`release` (invariant F)

**Files:** Create `cli/commands/use.ts`, `cli/commands/up.ts`, `cli/commands/card/release.ts`, `cli/core/release-pipeline.ts` (register in `cli/index.ts`); Test `test/commands-use.test.ts`, `test/commands-up.test.ts`, `test/core-release-pipeline.test.ts`.

> Built on the vendored `write` from Phase 9.

1. **`drwn use <ref>` (failing test).** clone-if-absent → `card apply` → `drwn write` (vendors). Idempotent; `--dry-run` previews. Thin orchestrator over existing functions.
2. **Implement `use`.**
3. **`drwn up` (failing test).** `outdated --fetch` → `update` (within ranges) → `write`, across the whole card set; re-vendors new treeShas + prunes old (Phase 9). Nothing-to-do is a clean no-op.
4. **Implement `up`.**
5. **`runRelease` (failing test).** sync `--check` → propose bump from `card diff` → set version → doctor → publish → validate → push (heads+tags) → catalog auto-replace. Resumable; a doctor failure stops before publish.
6. **Implement** `drwn card release <card> [--bump …] [--yes]`.
7. **Commit gate + acceptance:** `use`/`up`/`release --help` present; release dry-run on operator proposes a bump.

---

### Phase 11: Store concurrency + GC roots (Q2 + Q3)

**Files:** Modify `cli/core/card-store.ts:467-487` and fetch/clone paths, `cli/commands/store/gc.ts:22-27`; Create `cli/core/store-gc.ts`; Test `test/core-ensure-extracted-concurrency.test.ts`, `test/core-store-gc-roots.test.ts`, `test/commands-store-gc.test.ts`.

1. **Rename-success spelling (failing test).** Treat POSIX `EEXIST`/`ENOTEMPTY` **and Windows `EPERM`/`ENOTEMPTY`** as "another writer finished" → return existing dir.
2. **Concurrent extract (failing test).** `Promise.all` of two extractions → identical content, one surviving dir.
3. **Narrow fetch lock.** Bounded retry+backoff on git ref-lock; different cards parallel; **no global lock**.
4. **GC roots (failing test — PD-5, PD-9).** `computeGcRoots` = current project's pinned treeShas + committed vendor sidecar `treeSha`s (full 40-char) + local sources + retention window; `projectRoots` from `~/.agents/drwn/projects.json` when present (Phase 16), else current-project-only. Short-SHA vendor dirs without resolvable sidecar/lock mapping warn and do not protect arbitrary extractions. `planGc` → `{ prune[], keep[] }` over `extracted/` + stale `*.tmp.*`. A committed-vendor sha is never pruned.
5. **Wire `store gc`.** `[--dry-run(default)] [--prune]`; bare repos still get `git gc`.
6. **Commit gate:** `bun test` (ubuntu+windows) `&& npx tsc --noEmit`.

**Acceptance:** 97 §16 criteria 3 + 8 pass.

---

### Phase 12: `card fork` + requirement-3 honesty + hook-consent + `card update` re-vendor (invariant D)

**Files:** Create `cli/commands/card/fork.ts` (register in `cli/index.ts`); Modify `cli/commands/card/update.ts`, `cli/commands/card/outdated.ts`, `cli/core/card-install.ts`/write entry; Test `test/commands-card-fork.test.ts`, `test/core-update-revendor.test.ts`, `test/core-hook-consent-notice.test.ts`.

1. **`drwn card fork` (failing test).** `card fork @team/y [--scope @you] [--into <org-monorepo>]`: clone source into your scope / org monorepo, rewrite `card.json` name; original untouched.
2. **`card update` re-vendors (failing test).** re-resolve pins → refresh `card.lock` (new `treeSha`, PD-2) → next `write` re-vendors new + prunes old. `card outdated --fetch` reports correctly against a vendored pin. (`drwn up` already wired in Phase 10.)
3. **Hook-consent notice (failing test).** First `drwn write` on a machine where `card.lock` has `hookConsent` but no local ack (keyed by project + card + `treeSha` + hook-policy digest + consent range) prints **"hooks present, consented by `<lock entry>` on another machine"** once; `drwn card trust --hooks` records ack at consent time.
4. **Requirement-3 scope note (doc).** Command help + `docs-astro`: V1 notifies version-up only; distributable deprecation is post-V1 (Phase 15 / catalog-reflected).
5. **Commit gate + acceptance:** `card fork --help` works; `card update`+`write` re-vendors/prunes; hook-consent notice surfaces on cross-machine checkout.

---

### Phase 13: Migration runbook + committed-surfaces mode (resolves F7)

**Files:** Create `cli/core/migrate-vendor.ts`, `.ai/analyses/NN_vendored-migration-runbook.md`; Modify `cli/commands/write.ts`/`store migrate` subpath, `cli/core/config-local.ts`/project config; Test `test/core-migrate-vendor.test.ts`, `test/core-committed-surfaces.test.ts`.

1. **Detect + migrate (failing test).** `migrateSymlinkLayerToVendor(projectRoot)`: find `generated-symlink` write-record entries, re-vendor each pinned sha (Phase 3), replace symlinks with reflinked content; shrink the write-record to the disposable managed-path list (reuse analysis 82 `diffWriteRecord` routing).
2. **Surface reclassification (failing test).** Projection surfaces → gitignored (announced); merge surfaces stay committed.
3. **Committed-surfaces mode (failing test).** `committedSurfaces:true` in committed `config.json` omits these **projection** paths from the drwn gitignore block: `.claude/skills/`, `.codex/skills/`, `.cursor/`, project `.mcp.json`, `.cursor/mcp.json`. Merge surfaces (`.codex/config.toml`, `.claude/settings.json` hooks, machine `~/.claude.json`) stay field-merged and committed regardless. Local overlay files and `generated/` remain gitignored unconditionally.
4. **Runbook doc.** publish→re-vendor→announce-gitignore; when to use committed-surfaces; pure drwn-less consumption without the flag is out of scope.
5. **Commit gate:** `bun test` (ubuntu+windows) `&& npx tsc --noEmit && verify:release`.

---

## ✅ 97/98 V1 ACCEPTANCE GATE

After Phase 13 **and repair R1–R5**, run the full §4 checklist. Initial implementation (phases 1–18) is shipped but review01 found substrate gaps — repair is required before claiming this gate (see `.ai/tasks/68_review01_re_repair-strategies.md`). When green, the analysis 97/98 target architecture is realized: home-managed sources, committed vendored materialization diverging per branch/worktree, reflink-safe store, normalization-tolerant integrity, the total reconcile, the surface taxonomy, mode resolution + overlay, pull-based updates, `card fork`, and the migration path. **This is the shippable V1.**

---

# PART III — Post-implementation repair (review01 → R0–R5)

**Trigger**: `.ai/tasks/68_review01_task68_implementation_alignment_review.md` — implementation compiles and tests pass but does not yet satisfy 97/98 V1 substrate (store-backed vendor copy vs committed-vendor offline architecture).

**Strategy doc**: `.ai/tasks/68_review01_re_repair-strategies.md` (mentor-amended 2026-07-06).

| Phase | Scope | Exit |
|-------|-------|------|
| **R0** | Ratify PD-9 / sidecar semantics in 97 rev 4, 98, task 68 | Docs grep-clean for `vendor-manifests` contract |
| **R1** | F1, F2, F7 — lock/vendor authority, sidecars, idempotency | `core-write-offline`, `core-reconcile`, `core-write-idempotent` |
| **R2** | F3 — single content-root routing | Skills/hooks from vendor with store deleted |
| **R3** | F4, F5 — per-card source presence + local lock lane | Overlay acceptance criteria |
| **R4** | F6, F11, F12 — watch, status, hook-consent ack | Porcelain + observability tests |
| **R5** | F8, F9, F10 + porcelain test debt | Full §4 checklist + `verify:release` |

**Execution rule:** R0 before any R1 code. R1→R3 sequential (core substrate — substantial diffs); R4/R5 parallelizable after R3.

---

# PART II — Post-V1 hardening (Phases 14–18)

### Phase 14: Duplicate-skill conflict rule (invariant H)

**Files:** Modify `cli/core/sync.ts`/`cli/core/skills.ts`, `cli/core/types.ts` (`skills.exclude` reuse); Test `test/core-skill-conflict.test.ts`.

1. **Failing test.** Two applied cards bundling `apply-mind-card`: keep the later-applied copy, warn naming both cards + skill, honor `skills.exclude` to drop one deterministically.
2. **Implement** deterministic precedence in skill-selection assembly (order by apply order); warn via `SyncResult.warnings`.
3. **No silent loss** — a dropped duplicate is always reported.
4. **Commit gate:** `bun test`.

---

### Phase 15: Distributable metadata (`refs/meta/cards`) + migration (invariant I)

**Files:** Create `cli/core/card-meta.ts`, `cli/commands/card/meta.ts`; Modify `cli/core/card-store.ts` (`deprecateCardVersion` writes meta ref; migrate git-config markers), `cli/commands/card/push.ts` + fetch/clone refspecs, `cli/core/card-project.ts` (successor trust-scoping), `cli/core/git.ts` (add `hashObject`/`mkTree` wrappers — absent today); Test `test/core-card-meta.test.ts`, `test/core-card-meta-merge.test.ts`, `test/commands-card-meta.test.ts`.

1. **Meta read/write via worktree-less ref (failing test).** `metadata.json` blob under `refs/meta/cards` via `hash-object`/`mktree`/`commit-tree`/`update-ref`. `readCardMeta`/`writeCardMeta` round-trip.
2. **Implement `card-meta.ts`** (add the missing git plumbing wrappers).
3. **Union-merge (failing test — invariant I).** fetch-ref → union-merge (deprecations keyed by version; last-write-wins within a key) → update-ref. Never force-clobber.
4. **Repoint `deprecateCardVersion`** to write the meta ref AND migrate Stage-A `drwn.deprecated.*` config markers; `getCardDeprecation` reads meta first, config fallback.
5. **Distribution.** `card push` adds `refs/meta/*`; clone/fetch add `+refs/meta/*` (tolerant of absence).
6. **`card meta show` + successor trust-scoping.** Same-scope auto-suggest; cross-scope gated behind `--accept-successor`/catalog corroboration.
7. **Commit gate:** `bun test` (ubuntu+windows).

---

### Phase 16: Retire defaults → profile card + `projects` index (invariant J; widens Phase 11 GC)

**Files:** Create `cli/commands/projects.ts`, `cli/core/project-registry.ts`; Modify `cli/commands/card/new.ts` (`--from-defaults`); Test `test/commands-projects.test.ts`, `test/commands-card-new-from-defaults.test.ts`.

1. **`card new --from-defaults` (failing test).** Capture the machine default skill set into a profile card source (`@handle/everyday`) with `upstream` refs where derivable.
2. **Implement**, reusing `machine.json` reader + `card new` + `add-skill`.
3. **`project-registry` + `projects` (failing test).** `~/.agents/drwn/projects.json` index (opt-in registered on `init`/`use`); `drwn projects update --all` runs `up` in each. **This is the index Phase 11's GC reads** (PD-5) — once present, GC roots widen to all registered projects.
4. **Implement** the registry + command.
5. **Migration note (doc).** publish profile card → `use` per project → remove `library defaults`. No auto-remove.
6. **Commit gate:** `bun test`.

---

### Phase 17: `--scope machine` gate (drift signpost already shipped in Phase 9)

**Files:** Modify `cli/core/effective-state.ts` (require explicit machine scope), `cli/commands/write.ts` (`--scope` flag + confirmation); Test `test/core-scope-gate.test.ts`.

> The upstream drift signpost landed in Phase 9 Step 7; this phase adds only the machine-scope guard.

1. **Scope gate (failing test — 94 §5).** Machine-scope `drwn write` (no project config above cwd) requires `--scope machine` or interactive confirmation; a bare `drwn write` in a non-project dir errors with guidance instead of writing `~/.claude`.
2. **Implement** the gate in the write entrypoint; project-scope unchanged.
3. **Commit gate:** `bun test` (ubuntu+windows).

---

### Phase 18: Trust-hardening — apply-time content summaries

**Files:** Modify `cli/commands/card/apply.ts`; Create `.ai/analyses/` roadmap note; Test `test/commands-card-apply-summary.test.ts`.

1. **Content summary (failing test).** On first `apply` (and `update`): skills added/changed (name + one-line), MCP servers (header-secret note), hooks (consent). Reuse `card diff` for the update case.
2. **Implement.**
3. **Roadmap doc** (not code): instruction-trust threat (94 §3.5), path to card signing, trigger ("before any default-registered community catalog grows beyond curated membership").
4. **Commit gate:** `bun test` + `verify:release`.

---

## Cross-cutting acceptance gates (every phase)

- `bun test` green on ubuntu-latest AND windows-latest.
- `npx tsc --noEmit` clean.
- `verify:release` passes (includes hardcoded-path scan / `check-no-local-paths`).
- **No new symlinks in any committed path** (analysis 82 + 96 D3); the mind layer's store-symlinks are removed, not relocated.
- **No shared writable inode between `vendor/` and the store** (reflink or copy only).
- Every user-facing refusal/warning names the next correct command (agent-operator principle, 94 §1).

## Risks & mitigations

- **Reflink unsupported (Windows/NTFS, some Linux).** `populateFile` fallback chain (Phase 3); CI exercises copy on windows-latest; disk-economy is a non-correctness property.
- **Store read-only chmod vs existing writers.** Only regular *files* go `0o444`; dirs stay writable so sidecars + GC work (Phase 3 Step 3b).
- **`treeSha` lock bump (v4→v5).** v2–v4 load with `treeSha` optional; a store-aware layer (`backfillLockTreeShas` via `resolveProjectCards`/`update`/`write`) backfills from the existing lock entry's `git.commit` and persists on next write (PD-2), **not** the reader; no forced re-lock and no semver/range re-resolve.
- **`git.ts` lacks `hashObject`/`mkTree`.** Only needed for `refs/meta/cards` (Phase 15), which adds the wrappers; the V1 vendored path uses filesystem reflink and needs none.
- **Migration of live projects mid-flight.** Phase 13 reuses `diffWriteRecord` routing (analysis 82), gated behind detection; committed-surfaces mode is the escape hatch.

## Out of scope (tracked elsewhere / V2)

- Distributable deprecation *notification* to vendored consumers — catalog-reflected deprecation is the closing move (post-Phase 15); union-merge lands in Phase 15 but reach-everyone is catalog v2 (Stage C).
- Explicit worktree management UX + worktree-aware GC roots — V2 (the divergence *property* works in V1 via committed branch content).
- Many-parallel-worktree stress hardening; push/session-hook update nudges — V2.
- Catalog schema v2 (channels, per-version integrity) — Stage C.
- Card signing / scope-ownership trust — trust roadmap (94 §3.5, 96 G6; Phase 18 documents the trigger).

## Provenance

This plan merges and supersedes:
- **Task 67** — vendored card materialization (substrate). Its 9 phases became Phases 1, 3, 4, 6, 7, 9, 11, 12, 13 here, carrying all amendments (PD-1..8: surface taxonomy, lock `treeSha` + backfill location, store chmod, generated-layer fate + locked/active split, drift signpost to source, GC discovery, vendor immutability, `file:`-origin rule, crash-recoverable replacement).
- **Task 65** — Stage-B card model (verbs/provenance/metadata). Its phases became Phases 2, 5, 8, 10, 14, 15, 16, 17, 18 here, re-sequenced so verbs build on the vendored substrate and hardening trails the V1 gate.
