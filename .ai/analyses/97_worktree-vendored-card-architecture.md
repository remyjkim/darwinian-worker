# ABOUTME: Handoff-ready target architecture for the drwn card model — home-managed sources, an immutable content-addressed machine store, and per-project committed, vendored materialization (CoW-cloned from the store, never a shared inode) that diverges cleanly per git branch/worktree.
# ABOUTME: Rebuilt around four spike-validated invariants (vendor integrity, surface taxonomy, crash-recoverable reconcile, honest requirement-3 scope) plus the rev-3 boundary contracts (§5a: immutable vendor, file:-origin rule, lock-backfill location, crash-recoverable wording) and rev-4 vendor-manifest sidecars (§5a·5); supersedes the store-symlink materialization of analyses 90–96 and resolves every finding in 97_review01 + review02.

# Analysis 97 — Worktree-Vendored Card Architecture (Target Design, rev 4)

**Date**: 2026-07-05 (rev 4: committed `vendor-manifests/` sidecars for stale-tree prune + GC — ratified in task 68 review01 reply; rev 3: boundary contracts ratified after review02; rev 2: post-review, spike-validated)
**Author**: Claude + Remy
**Status**: Target architecture — **stable design of record** for the materialization substrate. Rev 4 adds committed per-tree manifest sidecars (§5a·5) so stale vendor prune and store GC have authoritative metadata after a lock entry disappears. Rev 3 adds the §5a boundary contracts resolving review02 (vendor immutability, project `.mcp.json` as projection, legacy-lock backfill location, `file:` origins, crash-recoverable wording); rev 2 resolved `97_review01` and is grounded in an executable spike (Appendix B). Supersedes the store-symlink generated layer in analysis 93 §3/§5; amends the Stage-B plan (tasks/65) and drives the execution plan (tasks/68).
**References**: [97_review01_vendored-architecture-faults-and-amendments.md (all findings resolved here), tasks/68_review01_task68_implementation_alignment_review.md, tasks/68_review01_re_repair-strategies.md, 93_target-card-model-architecture.html (materialization tier superseded), 94_harness-tooling-critical-assessment.md, 95_card-model-mental-model.html, 96_target-card-model-architecture-critical-assessment.html (D1/D3/G1/G2/G8), 90_skill-update-model-investigation.md, 92_mind-card-lifecycle-storage-and-update-model.md, 82_drwn-portable-multi-surface-write-path-target-architecture.md, 52_drwn-target-architecture-post-wave-1.md, 44_drwn-git-storage-backend-options.md, tasks/65_drwn-card-model-stage-b-implementation-plan.md, cli/core/effective-state.ts, cli/core/sync.ts, cli/core/materialize.ts, cli/core/card-lock.ts, cli/core/card-store.ts, cli/core/store-paths.ts, cli/core/write-record.ts, cli/core/card-manifest.ts, cli/core/project.ts, cli/core/git.ts, cli/commands/write.ts]

---

## 0. How to read this document

This is the **design of record** for how drwn cards are stored, resolved, and written into a project. It is written to be implemented from directly. It keeps the parts of analyses 90–96 that survive (immutable content-addressed store, provenance-as-data, porcelain, two planes) and **replaces one load-bearing mechanism**: materialization no longer symlinks into the machine store — it **vendors content into the project as committable, self-contained files, populated by a copy-on-write clone of the store (never a shared inode)**.

Rev 2 reorganizes the design around **four invariants** (§3). Each was the root of a cluster of review findings; each is validated by an executable spike whose binary results are in **Appendix B**. The rest of the document derives the mechanism from those invariants:

- §1 requirements · §2 the load-bearing move · **§3 the four invariants**
- §4 tiers · §5 surface taxonomy (invariant B) · §6 the `drwn write` reconcile (invariant C) · §7 the integrity model (invariant A)
- §8 mode resolution · §9 overlay + write-record · §10 store concurrency · §11 distribution + requirement-3 scope (invariant D)
- §12 ledger · §13 V1/V2 · §14 delta vs task 65 + migration · §15 open risks · §16 acceptance · Appendix A touch-points · Appendix B spike evidence

---

## 1. What this architecture must support (the three requirements)

1. **Home-managed sources, project-committed materialization.** Each card's *source* is managed centrally in the home store. When materialized, its content lands in the project's `.agents/drwn/` subtree in a form that **can be committed as part of the project repo** — self-contained, machine-independent, with no dependency on the author's machine store.
2. **Divergent materialization per branch / worktree.** A repo tracks which cards it wants; a user creating git worktrees (or switching branches) can materialize **different versions or composition sets** of cards per worktree.
3. **Git as remote storage for sources, with an update-notification path.** Card sources live behind git remotes. Consumers need a way to be notified they can version-up (a newer version exists) or edit an existing source (become a contributor).

## 2. The load-bearing move: materialize from a vendored copy, not from the store

Today (analysis 92, 93 §3.1 Fig 2b) the generated layer **symlinks** `<project>/.agents/drwn/generated/…` into the machine store. That is incompatible with requirement 1: **a symlink into `~/.agents/drwn/` cannot be committed** — a teammate or second machine has no such path, and the checkout is broken on arrival (96 D3).

The resolution:

> **Materialization vendors the pinned content into the project as real files, and consults the store only to *populate* that vendored copy. Once vendored, the project subtree is self-contained: the store, the network, and the author's machine are all irrelevant to a consumer who checks out the branch.**

This is the pnpm relationship, adapted — with one correction the spike forced (Appendix B, F1): the vendored copy is populated by a **copy-on-write clone (reflink)**, not a hardlink. A hardlink shares the inode with the store; an in-place edit to `vendor/` — an `echo >>`, a `sed -i`, an agent Edit — would write straight through to `~/.agents/drwn/extracted/<sha>/` and corrupt every project on the machine (measured: `STORE POISONED`). A reflink is a distinct, independently-writable inode with the same near-zero disk cost on CoW filesystems (measured: `store intact`). Hardlink survives only as a **read-only** fallback where reflink is unavailable, and plain copy as the universal fallback.

## 3. The four invariants

Rev 2 is organized so that every review finding is a consequence of one of these four commitments. Fixing the invariant fixes the whole cluster — this is what stops the paper-patch/re-review loop.

| # | Invariant | Resolves | Validated by |
|---|-----------|----------|--------------|
| **A** | **Vendor is an independent, normalization-stable, content-addressed artifact.** Populated by reflink→copy (never a shared writable inode); its integrity anchor is a **normalization-tolerant content manifest** derived from `card.lock.integrity`, *not* the git tree SHA; a committed `.gitattributes` keeps checkouts byte-exact. | F1, F2, gap "one integrity notion", low-nit (inode decay) | Appendix B §F1, §F2, §IR |
| **B** | **Materialized outputs are classified on two axes — ownership × distribution — and those axes decide gitignore/merge/vendor behavior.** There is no single "surface" rule. Merge surfaces are committed and field-merged; ownership is recomputed from the effective lock, never read from a machine-local record. | F3, F4, F7 | Appendix B §F3 |
| **C** | **`drwn write` is a total, crash-recoverable, idempotent reconcile:** desired set (effective lock) vs current set → add (build-temp-then-swap, verify-and-repair) + prune (drift-gated) + surface regen. Converges from any partial state ("converges after crash," not atomic replace — §5a·4). | F5, F6, gap "atomicity" | Appendix B §IR |
| **D** | **Requirement 3 is scoped to what V1's channels can carry.** Pull-based version-up ships in V1; distributable deprecation/successor notification does **not**, and the doc says so and names the closing move. | F8 | (scope, not mechanism) |

## 4. The three tiers (plus the machine-local overlay)

```
AUTHOR / COLLABORATION LANE                       CONSUMPTION LANE  (per project, per branch/worktree)
──────────────────────────                        ────────────────────────────────────────────────────
CARDS_SOURCE_PATH → org card-sources MONOREPO      <project>/.agents/drwn/
  many sources as subdirs, addressed via             config.json              ← intent   (COMMITTED, per-branch)
  git+URL#subpath ; its own git + remote             card.lock                ← pins+integ(COMMITTED, per-branch)
        │ edit → publish (commit + tag) → push       vendor/@scope/name/<sha>/← content  (COMMITTED, reflink-from-store)
        │                                            vendor-manifests/@scope/name/<sha>.json ← prune/GC metadata (COMMITTED)
        │                                            .gitattributes           ← vendor/** -text (COMMITTED)
        ▼                                            config.local.json        ← local activation + dev links (gitignored)
  ~/.agents/drwn/                                    card.lock.local          ← local pins (gitignored)
    cards/@scope/name.git   (bare, immutable)  ──────────┘ reflink (copy-fallback)
    extracted/<treeSha>/    (content-addressed)      .claude/skills/ .cursor/ .mcp.json … ← PROJECTION surfaces (GITIGNORED, regenerated)
    sources/@scope/name/    (editable drafts)        ~/.claude.json .codex/config.toml .claude/settings.json ← MERGE surfaces (field-merged)
    catalogs/ · catalogs.json · store.json
```

| Tier | On disk | Git boundary | Mutability | Serves |
|------|---------|--------------|------------|--------|
| **Source** | `~/.agents/drwn/sources/@scope/name/`, or a cloned org monorepo referenced by `CARDS_SOURCE_PATH` | its own repo + remote | editable | Requirement 3 (authoring + distribution) |
| **Store** | `~/.agents/drwn/cards/*.git` + `extracted/<treeSha>/` | machine-global, immutable | never | Requirement 2 (every version on hand, zero cross-worktree contention) |
| **Vendor (activation)** | `<project>/.agents/drwn/{config.json, card.lock, vendor/@scope/name/<sha>/, vendor-manifests/@scope/name/<shortSha>.json, .gitattributes}` | **committed branch content** | per-branch | Requirements 1 + 2 |
| **Local overlay** | `<project>/.agents/drwn/{config.local.json, card.lock.local}` | gitignored | machine-local | personal cards + dev links without leaking to the team |
| **Agent surfaces** | projection: `.claude/skills/`, `.cursor/…`, project `.mcp.json`, `.cursor/mcp.json`; merge: machine `~/.claude.json`, `.codex/config.toml`, `.claude/settings.json` (hooks) | projection gitignored; **merge committed** (§5) | derived | what the agent tools actually read |

Two rules make the tiers coherent:

- **The committed lane is always deterministic and mode-independent.** `config.json` + `card.lock` + `vendor/…` fully determine a project's harness on any machine, offline. Linking/dev-mode is a machine-local *overlay* that changes what materializes locally but **never** mutates the committed lane.
- **Availability ≠ activation.** The store holds what is *available*; the committed activation lane decides what is *used*. No command silently crosses that line (analysis 95).

*Vendor path shape (resolved LOW):* `vendor/@scope/name/<shortSha>/` — readable in PR diffs (a version bump reads as a directory rename), while `card.lock` records the full `treeSha` as the integrity key. Cross-card dedup is negligible for card-sized content, so readability wins.

## 5. Surface taxonomy (invariant B)

The single biggest rev-2 correction: **not all materialized outputs are the same kind of thing.** The spike (Appendix B §F3) confirmed that the *field-merged* config surfaces — the machine `~/.claude.json`, `.codex/config.toml`, and `.claude/settings.json` hooks — are *mixed-ownership merge targets*, not projections: regenerating one purely from the pinned cards **drops the user's own entries**, and merging with what's on disk is **not byte-identical across machines**. So a single "generate, gitignore it" rule is wrong for *those*. (The project-local MCP files — `.mcp.json`, `.cursor/mcp.json` — are a different case: drwn owns them **whole-file** and they are deterministic projections, per PD-1 and `cli/core/sync.ts:296`; do not confuse them with the machine-level `~/.claude.json` merge surface.) Classify every output on two axes:

| | **drwn-owned (whole file/dir)** | **mixed / user-owned (fields)** |
|---|---|---|
| **Committed** | rare (only if a team opts into committed-surfaces mode, §14) | **Merge surfaces** — machine `~/.claude.json`, `.codex/config.toml`, `.claude/settings.json` (hooks). drwn owns only *its* fields; user entries preserved. Committed/machine, field-merged, **not gitignored**. |
| **Machine-local** | **Projection surfaces** — `.claude/skills/<name>/`, `.cursor/…`, and the **whole-file configs drwn owns outright: project `.mcp.json`, `.cursor/mcp.json`**. Deterministic, gitignored, regenerated offline. | overlay-card projection surfaces (personal, machine-local by construction) |

**Consequences that must be implemented as stated:**

1. **The determinism guarantee is scoped to projection surfaces only.** "Same committed lane + same writers ⇒ byte-identical output, offline" holds for projection surfaces (whole-file/dir ownership). Merge surfaces are deterministic *per drwn-owned field*, not as a whole file.
2. **Merge surfaces stay committed and field-merged** using the existing `managed-fields` machinery (`cli/core/sync.ts:108,146,200,257–265,354`; `write-record.ts:29`) — the field-granular respect that analysis 94 §2 graded KEEP.
3. **Ownership is recomputed from the effective lock, not read from a machine-local write-record.** The spike (Appendix B §F3, case 3) showed that on a *fresh checkout* the write-record has no field hashes, so drift/cleanup on a committed merge surface would silently no-op. Fix: the set of drwn-owned server/field names is **derived from the resolved cards' declared MCP/config entries at write time**. The write-record remains an optional machine-local optimization for detecting *user* edits, never the source of truth for what drwn owns.

## 5a. Boundary contracts (rev 3 — resolves review02)

The big architecture (source / store / vendor / local-overlay; reflink-first; normalized integrity + `.gitattributes`; explicit-over-auto modes) is stable. The parts a review can still read two ways are the *boundary contracts* — vendor mutability, project MCP ownership, legacy-lock migration, and `file:` origins. Ratifying them here makes 97 the stable design-of-record:

1. **`vendor/` is an immutable committed cache, not an edit point.** A *pinned* tree that fails its manifest is **repaired from the store** (overwritten), never treated as an accepted edit. Drift signposts — for a hand-edited projection surface *and* for an unexpectedly-edited vendor tree — point to the **source** edit path: the card's `upstream` ref when known, else "fork → edit source → publish → update." There is **no** "edit `vendor/` then `drwn write`" flow anywhere in this design. (Editable vendor patches would be a separate feature requiring re-lock/re-manifest semantics — explicitly out of scope.)
2. **`file:` card origins are never vendored into the committed lane.** `file:` resolution yields no git tree SHA (`cli/core/card-store.ts:844`), so it cannot produce the machine-independent `treeSha` a committed vendor tree requires. A `file:` card is **linked / overlay / dev-only**; to vendor it, publish or import it into the git-backed store first (it then locks as a `git`/`store` origin with a real `treeSha`).
3. **`treeSha` is required to *write* a v5 lock, optional on *load* of v2–v4.** Backfill happens in a layer that has store context — `resolveCard` / `update` / `write` / migration with `agentsDir` — **not** in `loadCardLock(projectRoot)`, which has no bare-repo context (`cli/core/card-lock.ts:77`). Legacy entries load with `treeSha?: string` and are backfilled on the next resolve/update.
4. **Replacement is crash-recoverable, not atomically crash-safe.** The temp tree is built in full *before* the live tree is removed, so a crash during population never touches the live tree. The residual `rm`→`rename` window is small; a crash inside it leaves the tree missing, which the next `drwn write` rebuilds deterministically. We claim **"converges after crash,"** not "atomic replace."
5. **Committed vendor-manifest sidecars (rev 4).** Each populated vendor tree has a committed sidecar at `vendor-manifests/@scope/name/<shortSha>.json` recording `{ card, treeSha, integrity, manifest }`. Sidecars live **outside** the vendored content root (never inside `vendor/…` where materializers would read them). **Current-tree verification** uses `card.lock.integrity` digest-compare against live `vendor/` bytes — no sidecar required. Sidecars exist so **stale** trees (after card removal/update, when no lock entry remains) can still be pruned safely and so store GC can resolve short SHA → full `treeSha`. Rules: (a) missing or self-inconsistent sidecars ⇒ **preserve** the tree + warn — never delete; (b) self-consistency requires `treeSha.slice(0,12) === <shortSha>`, `integrity === manifestIntegrityDigest(manifest)`, and sidecar `card`/path matches the vendor tree; (c) a verified current vendor tree with a missing sidecar **backfills the sidecar offline**; (d) sidecar deleted when its tree is pruned.

## 6. The `drwn write` reconcile algorithm (invariant C)

`drwn write` runs per project (root resolved by `findProjectConfig`, `cli/core/project.ts`; in a worktree this resolves to the worktree root, so materialization is naturally worktree-local). It is a **total reconcile**, not an add-only pass, and is **idempotent from any partial state** — the spike (Appendix B §IR) proved the naive "populate if the directory exists" version leaves a half-written vendor tree unrepaired, so population must verify-and-repair.

```
drwn write:
  1. effective = buildEffectiveState(committed{config.json,card.lock} ⊎ overlay{config.local.json,card.lock.local})
                 # local-wins-with-warning on conflict (§9)
  2. for each card: mode = resolveMode(card)            # §8, printed with reason
  3. DESIRED_VENDOR = { (card.name, treeSha) | card is committed-lane AND mode==vendored }
     #  overlay cards and linked cards NEVER enter DESIRED_VENDOR (F4)

  4. ADD / REPAIR (crash-recoverable, idempotent — vendor is an immutable cache, §5a·1):
        for (name, sha) in DESIRED_VENDOR:
          tree = vendor/<card-name-path>/<shortSha>/
          if verifyManifest(tree) == OK: continue                  # lock.integrity digest-compare; no store access
          if verifyManifest(tree) == OK and sidecar missing: write sidecar offline from computed manifest
          ensureStore(sha)                                         # extract from bare repo if missing (§10)
          verifyStore(sha)                                         # re-verify store side BEFORE re-vendoring (F1 repair rule)
          tmp = vendor/.tmp-<sha>-<pid>; reflink-or-copy each file store→tmp   # build the COMPLETE tree first (§7)
          rm -rf tree; rename(tmp → tree)                          # short replace window; a crash here leaves the tree
                                                                   #   missing → next write rebuilds it (converges, §5a·4)
          if verifyManifest(tree) != OK: abort loudly
          write vendor-manifest sidecar for tree (self-consistency validated)
        # a pinned tree that fails verify is REPAIRED from the store (overwritten) — vendor is not an edit point

  5. PRUNE (drift-gated, defensive — uses sidecars for stale trees):
        for tree in existing vendor/ trees not in DESIRED_VENDOR paths:
          load sidecar at vendor-manifests/…/<shortSha>.json
          if sidecar missing or self-inconsistent: preserve + warn (never delete)
          else if verifyManifest(tree, sidecar.manifest) == OK: rm -rf tree + sidecar   # stale clean
          else: preserve + report anomaly                          # drifted immutable cache: never silently delete

  6. CONTENT SOURCE per card:
        vendored  → read bytes from vendor/<card-name-path>/<shortSha>/
        linked    → read live from CARDS_SOURCE_PATH source tree (do NOT touch committed lane or vendor/)
        overlay   → read from store extracted/<sha>/ (machine-local; never vendored — F4)

  7. GENERATE surfaces (cli/core/sync.ts):
        projection surfaces → regenerate wholesale, gitignored
        merge surfaces      → field-merge drwn-owned fields into the committed file;
                              owned-field set derived from the effective lock (§5.3), not the write-record
        hand-edited surface → refuse + signpost to the SOURCE edit path (upstream ref, or
                              fork→edit→publish→update); never "edit vendor" (§5a·1); edit preserved

  8. ensure .gitattributes covers vendor/** (§7); record disposable managed-path list for projection surfaces (§9)
```

Determinism guarantee (scoped): same committed lane + same writers ⇒ **byte-identical projection surfaces** on any machine, offline. Merge surfaces are deterministic per drwn-owned field. Reconcile is idempotent: a second immediate run is a pure no-op (spike §IR: `idempotent? true`).

## 7. The integrity model (invariant A)

The pin cannot be the raw git tree SHA of `vendor/`, because the vendored bytes round-trip through the **project's** git, whose config drwn does not control. The spike (Appendix B §F2) confirmed both breakers:

- **EOL normalization.** With `core.autocrlf=true` (common Windows default) or `* text=auto`, text files check out with CRLF. Recomputed tree SHA ≠ pinned SHA ⇒ **every Windows teammate gets a false integrity failure** on the showcase flow (fresh checkout, empty store, offline write). Measured: `MISMATCH`.
- **Mode bits.** Git tree SHAs encode file modes (100644/100755); exec-bit fidelity varies across `core.fileMode=false` and Windows checkouts.

**The integrity anchor is a normalization-tolerant content manifest**, not the git tree SHA:

- Per file: `sha256(normalizeEOL(bytes))` + an explicit mode policy (executable bit recorded as a boolean flag, not inferred from the filesystem). The manifest is computed at **publish time** over the extracted content and recorded so it is **consistent with `card.lock`'s existing `integrity` field** (`cli/core/card-lock.ts:26`) — one integrity notion, derived once, not two competing hashes.
- The spike (Appendix B §F2, §IR) showed this manifest **matches even after a CRLF checkout** where a git-tree-SHA comparison fails. Verification is a cheap recompute-and-compare done on write (closes 96 D1 for the vendored path).
- The store address stays `extracted/<treeSha>/` (git's own content-addressing for the *store*); the treeSha is recorded in `card.lock` for provenance but is **not** the post-checkout verifier.

**Belt-and-suspenders for clean checkouts and diffs:** `init`/first vendored write materializes a committed `.gitattributes` covering `vendor/**` with `-text` (byte-exact checkout — spike §F2 case (b): `MATCH`, no CRLF) and `linguist-generated=true` (collapses vendor churn in GitHub PR review, addressing the review-noise concern). The manifest is the *robust* anchor (works even if a consumer's git ignores attributes); `.gitattributes` is the *hygiene* layer.

**Repair rule (F1).** On `verifyManifest(resolveProjectVendorTree(name, treeSha)) != OK`, repair re-verifies the **store side** (`verifyStore(treeSha)`, re-extracting from the bare repo if the store is itself corrupt) *before* re-vendoring — otherwise, under the old hardlink design, repair would re-copy the corruption. With reflink population the store is a distinct inode, so a vendor edit cannot have touched it; the store re-verify is a cheap belt.

## 8. Decision Q1 — mode resolution (fixed precedence, F6)

`resolveMode(card)` is a single total function. Precedence, highest wins — corrected so **explicit committed configuration outranks per-card auto** (the old ordering let automatic linking silently override a project that deliberately demanded `vendored`):

1. **Explicit invocation override** — `drwn dev @scope/x` → `linked`; explicit vendor override → `vendored`. (`linked` requires the source present; if absent, fail loudly.)
2. **Explicit per-project committed setting** — `materialization: "vendored" | "linked"` in `config.json`. `"vendored"` wins unconditionally. `"linked"` links *if the source is present*, else falls back to `vendored` **with a warning** (set-but-absent ⇒ vendored).
3. **Per-card auto** — engages only when no explicit project setting: `CARDS_SOURCE_PATH` set **and** this card's source present under it ⇒ `linked`.
4. **Unconfigured default (per-project, uniform)** — otherwise `vendored`. (Consumer, or an author whose source for *this* card isn't checked out.)

Rationale for the swap (ratified, §12 row 4): explicit-over-implicit is a hard norm — a committed `materialization: "vendored"` is a deliberate determinism demand and must not be overridden by the mere presence of `CARDS_SOURCE_PATH` on some author's machine. Auto-linking still serves the author dev loop whenever no explicit setting is present. The invariant holds regardless: **linking never mutates the committed lane**, so two collaborators on one branch commit identical `vendor/`/lock state no matter who has which sources locally. `drwn write`/`status` print the resolved mode and reason per card.

## 9. Decision Q4 — machine-local overlay, and the write-record's residual role

Personal/local cards must never enter the shared lane. The overlay mirrors the committed lane one-to-one:

- `config.local.json` (gitignored) — local **intent**: local-only card activations + `dev`/link overrides (96 G2: a real local-activation channel, not merely link overrides).
- `card.lock.local` (gitignored) — local **pins**: same schema and resolver as `card.lock`.

`buildEffectiveState` merges committed + local; **conflict = local-wins with a loud warning**. Both files are ensured present in `.gitignore` by `init`/first write.

**Overlay-card content home (F4).** An overlay-activated card resolving in vendored mode has no committable home — putting its bytes in `vendor/` would leak personal content into the committed lane. Rule: **overlay cards materialize directly from the store** (`extracted/<treeSha>/`), machine-local by construction. They skip vendoring entirely (§6 step 6, `overlay` branch) — they don't need the offline/committable property because they exist only on this machine. This is why §6 step 3 excludes overlay cards from `DESIRED_VENDOR`.

**Write-record long-term shape.** With the content manifest doing integrity (§7) and the effective lock defining ownership (§5.3), the write-record is no longer the integrity ledger or the ownership source of truth. It shrinks to a **disposable, machine-local managed-path list** whose only jobs are (a) letting `drwn write` clean up projection surfaces it created and (b) detecting a hand-edited surface. We are not bound to the current `write-record.json` schema.

## 10. Decision Q2 — store concurrency under parallel writes

- **Extraction is idempotent and content-addressed.** Two processes extracting the same `<treeSha>` produce identical bytes; extract into a **store-local** temp dir (same filesystem as `extracted/`, so rename is atomic — not OS `/tmp`) then atomic-rename to `extracted/<treeSha>/`. A rename-onto-existing means "another writer finished it" → **treat as success**. Per-platform: POSIX reports `EEXIST`/`ENOTEMPTY`; **Windows reports `EPERM`/`ENOTEMPTY`** — the success rule must match all of these spellings.
- **Fetch into the bare repo is serialized narrowly** via git's native ref lock, wrapped with bounded retry + backoff on lock contention (or a narrow per-card lock). Different cards proceed in parallel.
- **No coarse store-global lock** — it would serialize every worktree's write.
- Crashed writers may leave store-local temp dirs; GC (§11) sweeps stale temp state.

## 11. Distribution — GC, org monorepo, fork-first, and honest requirement-3 scope (invariant D)

**GC (V1 scope).** V1 roots = discovered project `card.lock`s + every committed `vendor/<card-name-path>/<shortSha>/` tree's full `treeSha` (from sidecar when present, else lock when current) + local sources + a **retention window** for recently-used shas; dry-run default. Short-SHA vendor dirs without a resolvable sidecar/lock mapping produce a warning and do not protect arbitrary extractions. Vendored content is durable in-repo, so the store is a **cache** — a pruned sha re-populates from remote or from the committed vendor tree. **Worktree-aware GC roots (`git worktree list`) are V2** (§13).

**Org card-sources monorepo.** Teams maintain a shared **monorepo of card sources** — many sources as subdirectories, each addressed via `git+URL#subpath`. One clone (referenced by `CARDS_SOURCE_PATH`), one collaborative edit/publish place, decoupled from any project repo. Makes publish history shared and durable (closes 96 G3-half).

**Consumer → contributor: fork-first.** `drwn card fork @team/y` (promoted to **V1 tooling** — Appendix A) clones a source into a scope you own (or your org monorepo); edit and publish under that scope. Edit-in-place against the author's remote is allowed with write access, but fork-first is the default (safer lineage; no access assumption). Interacts with the scope-ownership/trust gap (§15, 96 G6).

**Update notification — pull-on-command (V1).** `drwn card outdated --fetch` pulls tags and compares to pins; `drwn up` automates outdated → update → write. Vendored consumers are insulated and only re-resolve on explicit `up`/`update`.

**Requirement 3 is only *partially* served in V1 (invariant D, F8).** Pull-based version-up ships in V1, but there is **no distributable deprecation/successor channel** in V1: `outdated --fetch` can say *a newer tag exists* but cannot say *your pinned version is deprecated / renamed to X*, because teams consuming via the vendored repo never touch the card remote, and catalog v2 (the reach-everyone channel) is Stage C. This is the substance of requirement 3's "or edit" clause for any card that stops publishing (the harness-skills deprecation that motivated the design). The doc owns this explicitly; **catalog-reflected deprecation is named as the earliest closing move**, and the `refs/meta/cards` union-merge machinery (96 G1) can follow.

## 12. Ratified decision ledger

| # | Decision | Source |
|---|----------|--------|
| 1 | Three tiers: home **sources** (org monorepo, subpath-addressed) → machine **store** (immutable, content-addressed) → per-project **committed activation** (`config.json` + `card.lock` + `vendor/@scope/name/<sha>/`) | §4 |
| 2 | Materialize **from vendor, not store**; vendor populated by **reflink (`COPYFILE_FICLONE`) → read-only-hardlink fallback → copy fallback**, **never a shared writable inode**; repair re-verifies the store side before re-vendoring | §2, §6, §7 |
| 3 | **Integrity anchor = normalization-tolerant content manifest** derived from `card.lock.integrity` (not the git tree SHA); committed `.gitattributes vendor/** -text linguist-generated` for byte-exact checkout + clean diffs; **committed `vendor-manifests/` sidecars** for stale-tree prune + GC (§5a·5) | §7, §5a·5 |
| 4 | **Surface taxonomy** (ownership × distribution): projection surfaces gitignored + deterministic; **merge surfaces committed + field-merged**, owned-field set **derived from the effective lock** (not the write-record) | §5 |
| 5 | `drwn write` is a **total, crash-recoverable, idempotent reconcile** (add via build-temp-then-swap+verify; drift-gated prune; overlay branch); "converges after crash," not atomic (§5a·4); determinism scoped to projection surfaces | §6 |
| 6 | Mode resolution precedence: explicit override → **explicit project setting** → per-card auto → default (`CARDS_SOURCE_PATH` unset ⇒ vendored); set-but-source-absent ⇒ vendored; linking never mutates the committed lane | §8 |
| 7 | Overlay cards materialize **from `extracted/<sha>`, never vendored**; overlay + linked excluded from `DESIRED_VENDOR` | §9 |
| 8 | Machine-local overlay: `config.local.json` + `card.lock.local`; **local-wins-with-warning**; write-record shrinks to a disposable managed-path list | §9 |
| 9 | Store concurrency: idempotent content-addressed extraction via **store-local** temp + atomic rename (`EEXIST`/`EPERM`/`ENOTEMPTY` = success) + git-lock retry/backoff; **no global lock** | §10 |
| 10 | V1 GC roots = project locks + committed vendor sidecar `treeSha`s + local sources + retention; store = cache; dry-run default | §11 |
| 11 | Distribution: shared **org monorepo**; **`drwn card fork` V1 tooling**; version-up = **pull-on-command**; **requirement 3 partially served in V1** (no distributable deprecation until catalog reflection — named closing move) | §11 |
| — | **Deferred to V2:** explicit worktree tooling, worktree-aware GC roots, many-parallel-worktree hardening, push/hook update nudges, `refs/meta/cards` union-merge | §13 |

## 13. V1 vs V2 scope

| Concern | V1 | V2 |
|---|:---:|:---:|
| Home/org monorepo sources + `CARDS_SOURCE_PATH` | ✅ | |
| Vendored, reflinked, committable materialization (Req 1) | ✅ | |
| Committed intent+lock diverging per branch (Req 2, inherent) | ✅ | |
| Git remote + fork-first + pull-based version-up (Req 3, partial) | ✅ | |
| Normalization-tolerant integrity manifest + `.gitattributes` | ✅ | |
| Surface taxonomy (projection vs merge) | ✅ | |
| Total crash-recoverable reconcile with prune (Q-C) | ✅ | converges after crash (§5a·4), not atomic replace |
| Mode resolution (Q1) + `card.lock.local` (Q4) + overlay-from-store | ✅ | |
| Idempotent/safe store writes (Q2) | ✅ | |
| Migration runbook for live projects (§14) | ✅ | |
| Distributable deprecation / successor notification (catalog reflection) | | ✅ |
| Explicit worktree management UX + worktree-aware GC roots | | ✅ |
| Many-parallel-worktree concurrency stress hardening | | ✅ |
| Push/session-hook version-up nudges | | ✅ |

## 14. Delta versus task 65 (Stage B) + migration runbook

**Survives, unchanged in intent:** upstream provenance in the manifest (`git+URL#subpath[@rev]`) + `drwn card source sync` (task 65 Phase 1, now doubly load-bearing for req 3); porcelain `use`/`up`/`release` (Phase 2, but `write` now vendors); duplicate-skill conflict rule (Phase 4, with the first-wins→later-wins inversion recorded, 96 D2).

**Changes:**
- **`drwn write` / materialization** (`cli/core/sync.ts`, `materialize.ts`, `effective-state.ts`): the §6 reconcile; **reflink-first population** into `vendor/@scope/name/<sha>/`; **remove the generated-layer symlink into `extracted/`** (96 D3); no symlink in any committed path.
- **Integrity** (`card-lock.ts`, new manifest module): compute the normalization-tolerant manifest at publish, record it consistent with `integrity`; verify on write.
- **Surface split** (`sync.ts`): projection vs merge (§5); derive owned-field set from the effective lock.
- **`config.local.json`** grows to local activation + links; add sibling **`card.lock.local`**; overlay cards materialize from store (§9).
- **Mode resolution** (`effective-state.ts`): the §8 precedence; thread per-card mode into writers.
- **`card.lock`** (`card-lock.ts`): reference `vendor/@scope/name/<sha>/` when vendored; record treeSha + manifest.
- **Manifest** (`card-manifest.ts`): `materialization: "vendored" | "linked"` project field.
- **`init`** (`cli/commands/init.ts`): **actually edit** `.gitignore` (add `config.local.json`, `card.lock.local`, projection surface dirs — 96 D4 noted init only warns today) and materialize `.gitattributes vendor/** -text linguist-generated`.
- **Store GC** (`cli/commands/store/gc.ts`): §11 roots; prune `extracted/` + stale store-local temp.
- **`drwn card fork`** (new `cli/commands/card/fork.ts`): V1 tooling.

**Migration runbook for live projects (F7).** §12-of-task-65 is a delta vs a *plan*; existing projects need a stated conversion path. Analysis 82 proved the symlink→copy migration can be automatic via `diffWriteRecord` routing; the vendored migration reuses it:
1. Detect the legacy generated-symlink layer via the existing write-record; re-vendor each pinned sha (reflink) and drop the symlinks.
2. Shrink the write-record from the current schema to the disposable managed-path list (a from-schema migration step, not a "we're not bound to it" hand-wave).
3. Add the gitignore/`.gitattributes` entries; **classify existing committed surfaces**: projection surfaces move to gitignored (one-time team-visible change, announced), merge surfaces stay committed.
4. **Drwn-less teammates:** once projection surfaces are gitignored, a teammate without drwn checks out a repo whose skill content sits in `vendor/` (which no agent tool reads) — a regression vs a committed `.claude/`. V1 offers an opt-in **committed-surfaces mode** (`committedSurfaces:true` in committed `config.json`) that omits these projection paths from the drwn gitignore block: `.claude/skills/`, `.codex/skills/`, `.cursor/`, project `.mcp.json`, `.cursor/mcp.json`. Merge surfaces (`.codex/config.toml`, `.claude/settings.json` hooks) remain field-merged and committed regardless. Non-default escape hatch for zero-tooling consumption; pure drwn-less consumption without that flag is explicitly out of scope.

**De-prioritized:** `refs/meta/cards` union-merge (task 65 Phase 5) — catalog reflection is the reach-everyone channel (§11, 96 G9); V1 keeps the Stage-A local-config deprecation marker + catalog reflection.

## 15. Open risks carried forward (out of this doc's scope)

- **Integrity beyond the vendored path (96 D1).** §7 verifies vendored content against the manifest. Clone-time / catalog-fed integrity from an independent channel still lands with catalog v2 (Stage C). No end-to-end tamper-evidence claim until then.
- **Scope ownership / signing (96 G6).** A scope is still an unbound string prefix. Fork-first + same-scope successor gating reduce friction but do not solve trust; signing is the honest fix and gates any open community catalog.
- **Per-machine hook consent (review low finding).** `hookConsent` is a committed `card.lock` field (`card-lock.ts:21–40`), so "git clone → offline `drwn write`" materializes hooks on a machine whose user never saw a prompt — one teammate's consent consents everyone. 97 makes this the showcase flow. Minimum V1 mitigation: first write on a machine surfaces **"hooks present, consented by `<lock entry>`"** loudly; a per-machine consent gate is the honest fix and belongs here.
- **Instruction trust (94 §3.5).** Skills are a prompt-injection surface with no consent gate; apply-time content summaries (task 65 Phase 8) are the near-term mitigation.
- **Multi-machine registry sync (94 §3.4).** The org monorepo covers *sources* but not trust/catalog state across machines.
- **Two-substrate question.** Whether "npm-for-harnesses" and "minds-as-cognitive-substrate" (analysis 62) stay one substrate is a strategic decision this doc does not settle; mind-content slots are Wave 3+ and additive to these tiers.

## 16. Success criteria (V1 acceptance)

- [ ] A consumed card materializes into `vendor/@scope/name/<sha>/` with **no symlink into the store**; the project checks out and `drwn write` reconstructs projection surfaces **offline** on a second machine with an empty store.
- [ ] **A vendor edit cannot mutate the store**: `echo >> vendor/…/x` then re-read `extracted/<sha>/x` shows the store unchanged (reflink), or the write fails loudly (read-only hardlink fallback).
- [ ] **Windows/`autocrlf=true` checkout passes integrity**: fresh checkout with `core.autocrlf=true` verifies against the normalization-tolerant manifest (no false failure).
- [ ] Two branches/worktrees pin and materialize **different versions/sets** with no store contention.
- [ ] `drwn write` **prunes** a vendor tree once its card is removed/updated, but **preserves+reports** a drifted one.
- [ ] A **merge surface** (`.codex/config.toml` / machine `~/.claude.json`) keeps a user-owned entry across `drwn write`, and drwn identifies its own entries **on a fresh checkout with no write-record**. A **projection surface** (project `.mcp.json`) is regenerated whole-file.
- [ ] `drwn dev @scope/x` (or auto-link) live-links **without** changing `config.json`/`card.lock`/`vendor/`; `git status` shows no committed-lane change; an explicit `materialization: "vendored"` is **not** overridden by `CARDS_SOURCE_PATH`.
- [ ] A **personal card** activated via the overlay materializes **from the store**, leaves **zero trace** in `vendor/` or the committed lane.
- [ ] Concurrent `drwn write` in two projects fetching the same missing card both succeed (idempotent extraction; store-local temp; no corruption).
- [ ] `drwn write` is **idempotent** (second immediate run is a no-op) and **converges from a partial vendor tree** (simulated crash mid-write).
- [ ] Editing a projection surface then `drwn write` is **refused with an upstream signpost**, edit preserved.
- [ ] `bun test` green on ubuntu + windows (copy fallback + `autocrlf=true` exercised on Windows).

---

## Appendix A — file/command touch-point index

| Area | Files |
|------|-------|
| Effective state + mode resolution | `cli/core/effective-state.ts`, `cli/core/project.ts` |
| Vendor population (reflink/copy) + surfaces | `cli/core/materialize.ts`, `cli/core/sync.ts`, `cli/core/store-paths.ts` |
| Integrity manifest | new manifest module + `cli/core/card-lock.ts` (consistent with `integrity`) |
| Locks + overlay | `cli/core/card-lock.ts`, new `card.lock.local` reader, `config.local.json` reader |
| Manifest / project config | `cli/core/card-manifest.ts` (`materialization` field) |
| Store fetch/extract concurrency | `cli/core/card-store.ts`, `cli/core/git.ts` |
| GC | `cli/commands/store/gc.ts` |
| Ignore + attributes management | `cli/commands/init.ts` (`.gitignore` + `.gitattributes`) |
| Write entrypoint + mode readout | `cli/commands/write.ts` |
| Distribution / notify / dev / fork | `cli/commands/card/{outdated,update,clone,fork,source/sync}.ts`, `cli/commands/{up,dev,use}.ts` |

## Appendix B — spike evidence (executable, results embedded)

A throwaway vertical slice (Bun 1.2.15 / git 2.39.5 / macOS-APFS) exercised the four contested mechanisms. Binary results, reproduced so rev 2 is grounded in measurement rather than argument:

**§F1 — population mechanism vs store poisoning**

| mechanism | shared inode | vendor edit result |
|---|---|---|
| hardlink | yes (`nlink=2`) | **STORE POISONED** |
| reflink (`COPYFILE_FICLONE`) | no | store intact |
| copy | no | store intact |
| hardlink + store `chmod a-w` | yes | **edit refused (EACCES)** — fails loudly |

→ reflink-first; read-only hardlink is a loud-failure fallback; copy is universal. (Invariant A, Decision 2.)

**§F2 — git normalization vs the integrity check**

| condition | git-tree-SHA equality | CRLF in checkout | norm-tolerant manifest |
|---|---|---|---|
| no `.gitattributes`, `autocrlf=true` | **MISMATCH** (false failure) | YES | **MATCH** |
| `vendor/** -text`, `autocrlf=true` | MATCH | no | MATCH |

→ anchor integrity on the normalization-tolerant manifest; add `.gitattributes` for byte-exact checkout + clean diffs. Mode bits recorded explicitly. (Invariant A, Decision 3.)

**§F3 — field-merged MCP/config surfaces are merge targets, not projections**

- Pure projection of mixed-ownership surfaces **drops the user's own MCP server/config field** (data loss if gitignored+regenerated). Project `.mcp.json` is excluded from this warning because drwn owns it whole-file.
- Field-merge on two machines with different pre-existing user servers is **not byte-identical** → not a deterministic projection.
- On a **fresh checkout** with no write-record, the owned-server set computed from the record is **empty** → drift/cleanup no-ops. Fix: derive ownership from the effective lock. (Invariant B, Decision 4.)

**§IR — integrity manifest + crash-recoverable reconcile**

- Naive "populate if dir exists" **left a half-written vendor tree unrepaired** (integrity FAIL) — the atomicity bug.
- temp-dir + atomic-rename + verify-and-repair **converges from the partial state**, prunes the stale tree, and is **idempotent on rerun** (`idempotent? true`).
- The normalization-tolerant manifest **still verifies after a CRLF munge** where git-tree-SHA equality would fail. (Invariants A + C, Decisions 3 + 5.)
