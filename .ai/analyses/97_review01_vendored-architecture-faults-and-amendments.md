# ABOUTME: Review of analysis 97 (worktree-vendored card architecture) and its companion 98 — verifies the design's stated guarantees against the codebase and known filesystem/git semantics.
# ABOUTME: Confirms the direction; grades findings BLOCKING / MEDIUM / LOW with evidence; ends with the amendment checklist required before 97 is implemented from.

# Analysis 97-review01 — Vendored Architecture: Faults and Required Amendments

**Date**: 2026-07-05
**Author**: Claude + Remy
**Status**: Review of record for analysis 97. Direction CONFIRMED; three blocking faults, one unspecified mechanism, four medium and five low findings. §6 is the amendment checklist.
**Reviews**: [97_worktree-vendored-card-architecture.md, 98_target-tooling-mental-model-and-usage-guide.html]
**References**: [96_target-card-model-architecture-critical-assessment.md-era findings (D1/D2/D3/G1/G2/G3/G8), 94_harness-tooling-critical-assessment.md, 93_target-card-model-architecture.html, 82_drwn-portable-multi-surface-write-path-target-architecture.md, tasks/65_drwn-card-model-stage-b-implementation-plan.md, cli/core/write-record.ts, cli/core/sync.ts, cli/core/card-lock.ts, cli/core/materialize.ts]

---

## 1. Method and stance

Analysis 97 presents itself as "written to be implemented from directly." This review holds
it to that bar on three grounds:

1. **Stated guarantees vs mechanism.** Where 97 promises a property (integrity, determinism,
   offline reconstruction, no leakage), does the specified mechanism actually deliver it —
   including on Windows, under git's own behavior, and under concurrent/hostile edits?
2. **The codebase.** Where the design touches existing machinery (managed-fields MCP merge,
   write-record, lock schema), do its claims survive contact with the code as it exists?
   File:line evidence given.
3. **Internal and cross-document consistency.** Do 97's sections agree with each other and
   with 98 (the operator guide)?

Findings are graded **BLOCKING** (a stated guarantee is invalid as specified; must be amended
before implementation), **MEDIUM** (spec gap or inconsistency that will surface during
implementation or rollout), **LOW** (nits and hardening notes).

## 2. What survives review — the direction is confirmed

The load-bearing move — **materialize from a committed, vendored copy populated from the
store, instead of linking into the store** — is the right resolution of the three
requirements, and the review found no fault with the requirements analysis itself (§1),
the three-tier decomposition (§3), the committed-lane/overlay split (§3, §7), or the
store-concurrency model (§8, modulo two low nits). Specifically, 97 genuinely retires
prior red-team findings rather than merely claiming to:

| Prior finding | How 97 resolves it | Verdict |
|---|---|---|
| 96 D3 — generated layer symlinks into the store, forbidden by the design's own invariants | Vendoring removes symlinks from every committed path by construction | resolved |
| 96 G2 — profile/personal cards have no team-compatible activation channel | `config.local.json` becomes a real **local activation** channel with `card.lock.local` pins (§7) | resolved (one gap — F4) |
| 96 G8 — store growth with no GC design; lock paths point into `extracted/` | Vendored content makes the store a **cache**; V1 GC roots defined; pruned shas re-populate (§9) | resolved in design |
| 96 G3 (half) — publish history lives in a machine-local, unsynced source `.git` | Org card-sources monorepo makes publish history shared and durable (§9) | resolved |
| 96 D1 (vendored path) — integrity recorded, never verified | `hash(vendor/<sha>) === <sha>` is a real verify step (§5.5); §13 honestly scopes what it does *not* prove | resolved for this path — but see F2, which breaks the check as specified |

Also right: the honest carry-forward of open risks (§13), the ratified-decision ledger with
per-decision sources (§10), the V1/V2 split that keeps the divergence *property* in V1 while
deferring worktree *tooling* (§11), and the concrete file-level delta versus task 65 (§12).
This is the most implementable design doc in the series. The faults below are amendments to
it, not arguments against it.

## 3. Blocking faults

### F1 — Hardlinks let a vendor edit silently poison the machine store <span>BLOCKING</span>

97 §2: *"Hardlinks are safe here for the same reason pnpm's are: the store is
content-addressed and never mutated in place."*

The analogy does not transfer, for two reasons:

- **pnpm hardlinks into gitignored tooling scratch** (`node_modules`) that users rarely edit
  — and even there, in-place edits corrupt the pnpm store; this is a documented failure mode
  that pnpm mitigated with `pnpm store status` verification and, where the filesystem allows,
  **copy-on-write reflinks instead of hardlinks**. 97 hardlinks into `vendor/`, a directory
  that lives inside a repository where humans and agents edit files daily. The exposure is
  strictly larger than pnpm's, and pnpm's already proved real.
- **The drift gates do not cover `vendor/`.** 97 §5.5's refuse-and-signpost protects the
  *agent surfaces*; nothing refuses an in-place edit to `vendor/<sha>/…`. An `echo >>`, a
  `sed -i`, or an agent Edit that writes through the inode mutates
  `~/.agents/drwn/extracted/<sha>/` simultaneously — corrupting every project and worktree
  on the machine that links the same sha.

Worse, the detection step cannot repair what it detects. If `hash(vendor/<sha>) !== <sha>`,
the natural repair is "re-vendor from the store" — but the store copy is **the same inode**,
so the repair re-vendors the corruption. The integrity check as designed can detect the
poisoning only if it *also* re-verifies `extracted/<sha>` against the bare repo, which §5
does not specify.

**Amendment (cheap, known):** the population mechanism must be, in order:
1. **Reflink / clone-file first** — APFS `clonefile` (macOS: every target machine today),
   btrfs/XFS reflink on Linux; exposed in Node/Bun as `fs.copyFile` with
   `COPYFILE_FICLONE`. Same near-zero disk cost as hardlinks, **no shared inode**, so a
   vendor edit can never touch the store.
2. **Hardlink fallback only with store files read-only** (`chmod a-w` at extraction time),
   so an in-place write fails loudly instead of succeeding silently.
3. **Plain copy** on filesystems with neither (Windows/NTFS default path).

97 §2/§5/§10-D2 should stop saying "hardlink" as the mechanism and say
"CoW-clone; hardlink+read-only fallback; copy fallback." Repair on integrity failure must
re-verify the store side (recompute `extracted/<sha>` or re-extract from the bare repo)
before re-vendoring.

### F2 — Git itself breaks `hash(vendor/<treeSha>/) === treeSha` on other checkouts <span>BLOCKING</span>

The vendored bytes round-trip through the **project's** git, whose configuration drwn does
not control. Two concrete breakers:

- **EOL normalization.** With `core.autocrlf=true` (the common Windows default) or a
  project `.gitattributes` with `* text=auto`, every text file in `vendor/` checks out with
  CRLF. The recomputed tree hash no longer equals the pinned `<treeSha>`, so **every Windows
  teammate gets a false integrity failure on first `drwn write`** — on exactly the flow
  (§14 criterion 1: fresh checkout, empty store, offline write) the design showcases.
- **Mode bits.** Git tree SHAs encode file modes (100644/100755). Exec-bit fidelity on
  Windows checkouts and across `core.fileMode=false` repos will produce hash mismatches for
  any card shipping executable files.

97 never mentions `.gitattributes`. **Amendment:** `init`/first vendored write must
materialize a `.gitattributes` covering `vendor/**` with at minimum `-text` (byte-exact
checkout) — and while writing it, add `linguist-generated=true` so vendor churn collapses in
GitHub PR review (also addresses the review-noise concern in §5-F5 below). The §5.5 hash
routine must additionally define its mode handling (either normalize modes before hashing or
document `core.fileMode` expectations), and the §14 Windows acceptance criterion should
explicitly include an `autocrlf=true` checkout.

### F3 — The determinism guarantee contradicts the managed-fields merge; both are claimed <span>BLOCKING</span>

97 §5: *"same committed lane + same generated writers ⇒ byte-identical agent surfaces on any
machine, offline. That is what lets surfaces be gitignored without losing reproducibility."*
And §5.4 lists "MCP merges" among the generated outputs, with surfaces "gitignored by
default."

Verified against the code: the MCP-bearing surfaces are **mixed-ownership merge targets,
not projections**. The write path tracks them as `managed-fields` entries with per-server
field hashes — `.claude.json` per-server hashes (`cli/core/sync.ts:108, 257–265`),
`.codex/config.toml` field hashes (`sync.ts:146, 200, 354`), the record kind itself
(`cli/core/write-record.ts:29`). This design exists precisely so drwn owns only *its*
servers and **preserves user-owned entries in the same file** — the field-granular respect
analysis 94 §2 graded KEEP.

A file that merges user content cannot be a gitignored, regenerable projection:

- Regenerate it purely from vendor ⇒ the user's own MCP servers are dropped on every write.
- Merge with the existing file on disk ⇒ output depends on machine-local state ⇒ **not**
  byte-identical, **not** deterministic, and gitignoring it loses the user's committed
  entries for teammates (today a project's `.mcp.json` is typically committed *with* both
  user and managed servers).

**Amendment:** split the surface set explicitly in §5:

- **Projection surfaces** (whole-file / whole-directory: skill dirs, generated configs drwn
  wholly owns) — deterministic, gitignored, covered by the §5 guarantee.
- **Merge surfaces** (`.mcp.json`, `.claude.json`, `.codex/config.toml` — anything
  `managed-fields`) — keep their current committed-and-field-merged treatment; drwn-managed
  fields are deterministic *per field*, the file is not, and it is **not** gitignored.

The determinism sentence then holds, scoped to projection surfaces. 98 §8's table needs the
same split (it currently lists `.claude/ · .cursor/ · .codex/` wholesale as "no
(regenerated)").

### F4 — Local-overlay cards have no defined home for their content <span>BLOCKING (unspecified mechanism)</span>

§7 defines the overlay's **intent** (`config.local.json`) and **pins** (`card.lock.local`),
and §3's table says the overlay serves "personal cards … without leaking to the team." But
a locally-activated card resolving in vendored mode has nowhere to put its bytes:

- Vendoring into `<project>/.agents/drwn/vendor/` puts personal content into the
  **committed lane** — the exact leak the overlay exists to prevent.
- Per-sha `.gitignore` entries inside an otherwise-committed `vendor/` are fragile
  (one missed entry = a leaked personal card in a PR).

The coherent resolution is that **overlay cards materialize directly from the store**
(`extracted/<sha>/`), machine-local by definition — they don't need the offline/committable
property, since they exist only on this machine. But that breaks §5's uniform
"surfaces generate from vendor" and must be a stated rule, not an inference. **Amendment:**
add to §7: overlay-activated cards skip the vendor step and materialize from
`extracted/<treeSha>` (store-resident content is their availability requirement); the §5
algorithm's step 3 gains an overlay branch; 98 §4's state table gains the distinction.

## 4. Medium findings

### F5 — The §5 algorithm only ever adds vendor trees; nothing prunes stale ones <span>MEDIUM</span>

Step 3 ensures `vendor/<treeSha>/` **exists**; no step removes `vendor/<oldSha>/` on
update or card removal. 98 scenario E promises "add-tree / remove-tree" diffs, but the
design-of-record's algorithm, as written, accumulates every historical version in the
committed working tree forever. **Amendment:** add step 3b — delete vendor trees not
referenced by the effective lock (committed lock only; overlay never vendors per F4) —
and state its drift-safety rule (a to-be-deleted tree that fails its hash check is
preserved-and-reported, mirroring refuse-delete).

### F6 — Mode-resolution precedence: internally inconsistent, and implicit outranks explicit <span>MEDIUM</span>

Three tellings of Q1 disagree:

- 97 §6 body, level 4: "`CARDS_SOURCE_PATH` unset ⇒ vendored… No per-card magic when there
  is nothing to key presence off" — says nothing about set-but-source-absent.
- 97 §10 ledger row 4: "unconfigured per-project default (`CARDS_SOURCE_PATH` set ⇒
  linked, unset ⇒ vendored)".
- 98 §3 decision tree: same as the ledger — "set → linked".

"Set ⇒ linked" at level 4 is incoherent: a card whose source is present under the path was
already caught by level 2; a card whose source is **absent** has nothing to link from — the
resolution would fail. The body text's rule is the only coherent one; the ledger and 98 must
be corrected to it.

Separately, level 2 (per-card **auto**, keyed off `CARDS_SOURCE_PATH` presence) outranks
level 3 (the **explicit, committed** `materialization: "vendored"` project setting).
Automatic behavior overriding deliberate committed configuration inverts the
explicit-over-implicit norm: a project that demands vendored determinism gets silently
linked on any author's machine. Mode printing (§6/98 §3 callout) softens the surprise but
does not justify the order. **Amendment:** either swap levels 2 and 3, or record the
rationale for auto-over-setting as a ratified decision with its own ledger row.

### F7 — No migration path for live projects; the gitignored-surfaces flip is unexamined for drwn-less teammates <span>MEDIUM</span>

§12 is a delta versus task 65 (a plan), not versus **existing projects**: nothing covers
converting a live project off the generated-symlink layer, shrinking its write-record
(§7's "we are not bound to the current schema" needs a from-schema step), or the
team-visible change of gitignoring surfaces that may currently be committed. Analysis 82
proved the symlink→copy migration could be automatic via `diffWriteRecord` routing — the
vendored migration deserves the same treatment, stated.

And the flip has an adoption cost 97 doesn't weigh: once surfaces are gitignored, a
teammate **without drwn** checks out a repo whose card content sits in `vendor/` — a
directory no agent tool reads — where today a committed `.claude/` works with zero tooling.
For mixed teams that is a regression. **Amendment:** a migration runbook section (or a
pointer to a task-65 phase that owns it), plus either a named non-default
("committed-surfaces mode") or an explicit rejected-alternatives entry explaining why
drwn-less consumers are out of scope.

### F8 — V1 has no distributable deprecation channel, in tension with requirement 3 <span>MEDIUM</span>

§12 de-prioritizes `refs/meta/cards` ("teams consuming via the vendored repo never touch
the card remote"), and catalog v2 — the only reach-everyone channel — is Stage C. Net: in
V1, `drwn card outdated --fetch` can say *a newer tag exists* but cannot say *your pinned
version is deprecated / renamed to X*, because no channel carries that fact to consumers.
Requirement 3 is "consumers must be notified they can version-up **or edit**" — deprecation
and successor pointers are the substance of that notification for any card that stops
publishing (the harness-skills situation that motivated the whole deprecation design).
Deferring the union-merge machinery (96 G1) is fine; the doc should own explicitly that
requirement 3 is only *partially* served in V1, and catalog-reflected deprecation should be
named as the earliest closing move.

## 5. Low findings

- **`drwn card fork` exists only in 98.** 97 §9 describes fork-first as a practice
  ("clone its source into a scope you own"); Appendix A has no `fork.ts`. Either promote it
  to V1 tooling in 97, or 98's scenario F and command table must show the manual steps.
- **Extraction atomicity details (§8).** Temp-then-rename is atomic only when the temp dir
  is on the store's filesystem — "extract into a temp dir" must say *store-local* temp, not
  OS tmp. And Windows reports rename-onto-existing as `EPERM`/`ENOTEMPTY`, not `EEXIST`;
  the "EEXIST = success" rule needs the per-platform spelling.
- **Hardlink disk savings decay silently.** Every `git checkout` that rewrites vendor files
  creates new inodes, de-linking them from the store; a subsequent `drwn write` sees
  matching hashes and won't re-link. Correctness unaffected; the disk-economy claim is
  transient. (Moot for reflinks — one more reason for F1's amendment.)
- **`vendor/<treeSha>/` is opaque in review.** A PR shows content moving between two
  hash-named directories; `card.lock` is the only name↔sha map. Consider
  `vendor/@scope/name/<shortsha>/` (readable diffs, still content-addressed) and weigh
  against cross-card dedup, which is negligible for card-sized content anyway.
- **Consent-by-proxy is amplified by the headline flow.** `hookConsent` is a committed
  `card.lock` field (`cli/core/card-lock.ts:21–40`), so "git clone → offline `drwn write`"
  materializes hooks on a machine whose user never saw a consent prompt — one teammate's
  consent consents everyone. Pre-existing (not introduced by 97), but 97 makes the
  no-gate path the showcase (§14 criterion 1, 98 scenario B). At minimum, first write on a
  machine should surface "hooks present, consented by <lock entry>" loudly; a per-machine
  consent gate is the honest fix and belongs in the §13 risk list.

## 6. Amendment checklist

| # | Amendment | Where | Grade |
|---|-----------|-------|-------|
| 1 | Population mechanism: reflink-first (`COPYFILE_FICLONE`/clonefile), hardlink **+ read-only store files** fallback, copy fallback; integrity repair re-verifies the store side before re-vendoring | 97 §2, §5.3, §5.5, §10-D2 | BLOCKING |
| 2 | `init`/first write materializes `.gitattributes` (`vendor/** -text linguist-generated`); define mode-bit handling in the hash routine; add `autocrlf=true` checkout to §14 Windows criteria | 97 §5.5, §12 (init), §14 | BLOCKING |
| 3 | Split projection surfaces (gitignored, deterministic) from merge surfaces (`managed-fields`: `.mcp.json`, `.claude.json`, `.codex/config.toml` — committed, field-merged); scope the determinism guarantee to the former | 97 §5 · 98 §8 table | BLOCKING |
| 4 | Define overlay-card content home: materialize from `extracted/<sha>`, never vendored; overlay branch in §5 step 3 | 97 §5, §7 · 98 §4 | BLOCKING |
| 5 | Algorithm step 3b: prune vendor trees unreferenced by the effective committed lock, with a drift-safety rule | 97 §5 | MEDIUM |
| 6 | Fix level-4 rule in ledger + 98 tree to match §6 body ("set-but-absent ⇒ vendored"); swap or justify auto-link (level 2) vs project setting (level 3) | 97 §6, §10 · 98 §3 | MEDIUM |
| 7 | Migration runbook for live projects (symlink layer, write-record schema, surface gitignoring); name or reject a committed-surfaces mode for drwn-less teams | 97 new § / task 65 | MEDIUM |
| 8 | State that requirement 3 is partially served in V1 (no distributable deprecation until catalog reflection); name catalog-reflected deprecation as the closing move | 97 §12, §13 | MEDIUM |
| 9 | Resolve `card fork` (tool in 97 or manual steps in 98); store-local temp + Windows rename semantics in §8; vendor path naming decision; per-machine hook-consent surfacing added to §13 | 97 §8, §9, §13 · 98 §5F, §7 | LOW |

## 7. Verdict

Analysis 97 is the right architecture pointed at the right requirements, and it retires
more of the 96 red-team findings than any prior amendment. It is **concrete** — the ledger,
the V1/V2 split, and the code delta make it implementable-from. It is **not yet
non-faulty**: three of its stated guarantees (store safety under hardlinks, cross-platform
integrity verification, surface determinism) are invalid as specified, and one mechanism the
overlay depends on is unspecified. All four blocking amendments are paper-cheap — a
mechanism substitution, a `.gitattributes`, a scoping sentence, and a stated rule — and none
disturbs the tier model or the decision ledger's intent. Amend 97 (and sync 98's tree,
tables, and scenario F to it); then it earns "design of record."
