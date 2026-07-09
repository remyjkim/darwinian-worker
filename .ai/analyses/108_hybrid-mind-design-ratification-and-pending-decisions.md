# ABOUTME: Records the team's selection of the card-seeded hybrid mind design plus three riders (L4/L5 memory semantics, DB-first authoring, placement-based memory construction), analyzes their implications, and registers all pending decisions.
# ABOUTME: Includes the requested elaboration on whether reproducible, reviewable worker definitions justify the sync boundary — reframed for DB-first authoring as checkpoint lineage.

# Analysis 108 — Hybrid Mind Design: Ratification, Implications, Pending Decisions

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Active decision record
**References**: [.ai/analyses/106_mind-card-dual-design-proposals.md, .ai/analyses/107_deploy-api-mind-binding-change-request.md, .ai/analyses/105_mind-card-beginningdb-target-architecture-investigation.md]

---

## 1. Ratified (team decision, 2026-07-07)

| # | Decision |
|---|---|
| R-1 | **Design B (card-seeded, DB-runtime hybrid) selected** (106 §5). |
| R-2 | **Memory layers get fixed semantics**: **L4 = reflections/insights**, **L5 = observations** — both in V1. **L6 = raw data/files** deferred to V2. |
| R-3 | **DB-first editing is the primary authoring surface** for mind content; cards are the reviewed checkpoint lineage (§3). |
| R-4 | **Placements are the main mode of memory filesystem construction** — memory entries are identified by inode, not by an "original" path; the mind's memory tree is assembled by placing entries, not by writing content at tree paths (§4). |

These join 106 §1's D-1…D-9 (mind id = worker id/server-minted, DB-only composed mind, DB-wins drift, testing tiers, M0 skills card, skills never uploaded).

**Second ratification (Remy, 2026-07-07, on §6):** the §6 recommendations are adopted **except**:

| # | Decision |
|---|---|
| R-5 | O-1 checkpoint-via-diff, O-2 `worker mind <verb>`, O-5 seed copies, O-6 L5 jsonl / L4 md, O-7 skill-only reflection, O-8 restore gate, O-9 accept gap, O-11 naming — **adopted as recommended**. |
| R-6 | **O-3 = option (b)**: the beginning-db workspace publishes a client package; drwn depends on it. No vendoring — long-term-stable seam chosen over the quick unblock. Consequence: mind-store implementation has an upstream dependency on beginning-db packaging work (exports map + publish); a request to that repo is needed. |
| R-7 | **O-4 = option (c)**: org/user-level **shared memory pool** outside mind subtrees, minds place inward. This deliberately reopens per-mind token confinement (§6.4's caveat) — a dedicated design investigation covers the auth model, placement mechanics, pool layout, ownership/GC, and the required amendments to the 107 deploy-API request. See analysis 109. |

**Critical path (revised)**: O-4(c) design investigation (analysis 109) → memory conventions + amended 107 token model → M0 skills card; beginning-db client package (R-6) gates mind-store start; deploy-team topology (O-10) — now leaning gateway-fronted sooner, since ReBAC-backed scoping is what makes a shared pool safely reachable — remains the external gate for deployed e2e.

## 2. Implication: L4/L5 semantics sharpen the layer contract

The 103 schema treated l4/l5/l6 as opaque names. They now mean:

- **L5 — observations**: high-volume, session-time, agent-written. Points at append-only `jsonl`, concurrent-writer safe (`PATCH` append), no CAS contention by design.
- **L4 — reflections/insights**: lower-volume distillations *over* L5. Written by a reflection step (agent skill or background process — who runs it is an open question, O-7). Format plausibly `md` or `jsonl`.
- **L6 — raw data/files**: V2. The manifest schema should still *reserve* the layer name (validation accepts it, tooling may warn "V2") so V1 cards don't need a schema break later — cheap now, per the 103 memory schema which already carries per-layer `format`.

Note the old l6-size-warning doctor check (1c92ae4) targeted what is now the V2 layer; V1 doctor checks retarget to L5 volume instead.

## 3. Implication: DB-first authoring reframes the hybrid as a *checkpoint* hybrid

106's Design B implicitly assumed card-first authoring with DB edits as the exception. R-3 inverts that: **drift is the steady state, not an anomaly.** The sync boundary's job changes from "keep DB matching card" to **maintaining a reviewed checkpoint lineage** for live-authored content. Concretely, the verb set shifts:

| Verb | 106-B framing | Post-R-3 framing |
|---|---|---|
| **seed** (at deploy) | Primary content delivery | Unchanged — the baseline install |
| **sync** (card→DB on card bump) | Routine update path | Occasional **rebase** onto a new baseline; DB-wins/CAS semantics unchanged (D-6) |
| **drift report** | Warning-shaped | Informational by default — "live edits not yet checkpointed"; noisy-warning framing would be wrong |
| **upstream** (DB→card) | Absent from 106-B | **New, and now core**: capture live DB persona/beliefs into the card source as a reviewable diff → publish = checkpoint. This is the missing half of the loop and V1 likely needs it (O-1) |

Memory is untouched by all of this — it was never card content (seeded scaffolding only).

## 4. Implication: placement-based memory construction

**Interpretation to confirm (O-4)**: memory entries are created once as files (inodes) — in a canonical pool location and/or at their first placement — and the mind's `memory/l4|l5/…` tree is built by **placing** those inodes (BeginningDB multi-path placements). Identity is the inode; paths are views.

What this buys (and why it's a strong fit for L4/L5):
- **Multiple views without copies**: the same observation can appear under `memory/l5/by-date/…` and `memory/l5/by-topic/…`; a reflection can be placed both in its mind's L4 and in a team-shared tree.
- **Cross-mind shared memory**: placing one entry into several minds' trees = live shared memory with single-write semantics (the placements/`unplace`/`delete_everywhere` machinery exists natively; `bgdb place/unplace/placements`).
- **Reorganization is metadata-only** — no content churn, ETag/inode identity stable across re-filing.

What it costs / forces:
1. **Deletion discipline**: `DELETE` on a path unplaces; last placement deletes content. Tooling and skills must be explicit about `unplace` vs `delete_everywhere` (default: unplace).
2. **Ledger/drift semantics**: ETags are `inode:version` — an edit through *any* placement changes the version seen at *all* placements. For seeded (persona/beliefs) content this is fine as long as seeds are **copies, not placements** (O-5); for shared memory it's the intended behavior.
3. **A pool convention** (O-4): where canonical entries live (per-mind pool dir? per-user/org pool for shared entries?), entry naming/ids, and which placements the skills create by default on `remember`.
4. **Doctor checks**: orphaned entries (in pool, placed nowhere), broken expectations (layer dirs containing non-placed originals when the convention says placed).

Scope note: R-4 names **memory** as placement-constructed. Whether persona/beliefs seeds also use placements is explicitly open (O-5) — my recommendation is **no** for V1 (seeds are per-mind copies; shared-mutable persona across a fleet is a governance hazard and collides with the checkpoint model).

## 5. Elaboration — "Do reproducible, reviewable worker definitions matter enough to pay for the sync boundary?"

Requested elaboration of 106 §7 Q1, now conditioned on R-3 (DB-first authoring).

### What the sync boundary actually buys

1. **Fleet templating.** Deploying N workers from `@team/reviewer-mind@1.4.0` gives N identical baselines with provenance. Without card definitions the alternative is copying some mind's DB subtree at some moment — an artifact of *when you copied*, not a definition. Anyone running more than a couple of long-lived workers hits this.
2. **The only history that exists.** BeginningDB has **no version history** (105 §2.3), and memory-history design is deferred (D-5). Card checkpoints are therefore not merely nice-to-have review — they are the *sole* mechanism by which any mind content has recoverable, diffable states. Under DB-first authoring this becomes the load-bearing argument: live edits are unversioned by construction, so the checkpoint lineage is what stands between us and "no one can say what this worker's persona was last month."
3. **Known-good restore.** Long-lived minds degrade — persona edited into a corner, beliefs accumulated inconsistently. "Rebase to baseline" (`sync --force` onto the pinned card version) is only meaningful if a versioned baseline exists. This is the operational escape hatch for a fleet, and it has no DB-native substitute.
4. **Review as governance checkpoint.** Persona/beliefs are behavior-defining (brand, safety, tool-permission-adjacent). Git review at checkpoint time is the one point a human deliberately approves the definition. DB-first editing *moves* review from pre-write to checkpoint-time; it doesn't eliminate the need for a review point — the upstream verb (§3) is exactly that point.
5. **Distribution is an artifact economy.** The marketplace substrate already exists server-side (`deployed_cards`, visibility, revenue share). A sellable/sharable mind definition must be an immutable versioned artifact. Live subtrees don't distribute.

### What it costs

The ledger (per-file source version + ETag), CAS write paths, three drift states, rebase/upstream verbs, their tests, and a two-place mental model users must learn ("live state" vs "checkpoint"). Under R-3 the *continuous*-sync burden drops (sync is occasional, human-initiated), but the upstream verb is new machinery 106-B hadn't scoped.

### Verdict

Yes — and more strongly under DB-first authoring than under card-first, because checkpointing is the only versioning the system has (point 2). The honest restatement: **we are not paying the sync boundary to keep two stores equal; we are paying it to give unversioned live state a versioned lineage.** The cost side is real but bounded and pay-per-use: minds that never checkpoint pay nothing beyond the initial seed; the machinery activates only at deliberate rebase/checkpoint moments. The design consequence to accept now is that **upstream (DB→card) is core V1 scope**, not a follow-up — without it, DB-first authoring plus card checkpoints has no connecting path and the card lineage goes stale immediately.

## 6. Pending-decision register

Index (details with options/pros/cons/recommendations in §6.1–§6.11):

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| O-1 | Upstream (DB→card) verb in V1 scope? | Yes — `checkpoint`, staged via `diff` first | Task plan scoping |
| O-2 | Command-surface shape | `worker mind <verb>` | Command implementation |
| O-3 | Library seam for the beginning-db client | Vendor now, migrate to published package | mind-store start |
| O-4 | Placement topology for memory | Born-at-primary-path; views + sharing via placements; no separate pool in V1 | Memory conventions, M0 skills, doctor |
| O-5 | Persona/beliefs seeds: copies or placements | Copies | Seed engine |
| O-6 | L4/L5 formats and entry schemas | L5 append-only jsonl; L4 md | M0 skills card, templates |
| O-7 | Who runs L5→L4 reflection | Skill-only in V1 | Skills scope |
| O-8 | Visibility/push gate in V1 | Restore as captured | Restored-machinery scope |
| O-9 | Local/pre-deploy minds | Accept gap; dev-mode escape hatch via env targets | Nothing in V1 |
| O-10 | Deploy-team responses to 107 (external) | Communicate our preferences (§6.10) | Provision/seed e2e |
| O-11 | Naming | `@darwinian/mind-tools` (M0); `mind-content` + `mind-store` modules | Cosmetic |

**Critical path**: O-10 topology (external) ∥ O-4 → O-6 → M0 skills card; O-1/O-2/O-3 gate the drwn-core task plan but not M0.

### 6.1 O-1 — Upstream (DB→card) in V1?

- **(a) Full `checkpoint` verb**: maps DB persona/beliefs back into card source entries and leaves a reviewable git diff for publish. The composed `persona.md` is un-composable via its provenance fences (edits inside a card's fenced section map to that card's entry); edits **outside** any fence need a destination rule — route to a designated local-edits entry, or fail with guidance.
  *Pros*: closes the authoring loop; keeps the checkpoint lineage alive (§5 verdict). *Cons*: the un-composition mapping is the one genuinely fiddly piece; multi-card minds need the outside-fence rule.
- **(b) No upstream in V1** — seed + rebase only; users hand-copy DB edits into card sources.
  *Pros*: cheapest. *Cons*: with DB-first authoring the lineage goes stale immediately; hand-copying composed content back into per-card entries is exactly the error-prone step tooling should own.
- **(c) `diff` only**: show DB-vs-seed diff per entry; user applies changes manually.
  *Pros*: 80% of the safety for 30% of the work; no write-back complexity. *Cons*: still manual apply.

**Recommendation**: (a), built in two steps with (c) as the first milestone — `diff` is a strict subcomponent of `checkpoint` (same ledger + fence parsing), so nothing is thrown away. Outside-fence edits: fail-with-guidance in V1 (route-to-entry is a policy decision to defer).

### 6.2 O-2 — Command surface

Carried from 106 §6 with pros/cons there: **(B1)** `drwn worker mind <verb>` (matches `worker stack` precedent; mind = worker state under D-1) / **(B2)** flags on existing verbs (dies at the first verb without a host, e.g. `checkpoint`) / **(B3)** top-level `drwn mind` (cleanest later extraction; collides with the retired pre-rename `mind` namespace; detaches from worker identity).

**Recommendation**: B1. The D-3 hesitance is addressed structurally (thin commands over the mind-store module), and B1→standalone-tool migration stays cheap if wanted later.

### 6.3 O-3 — Library seam

- **(a) Vendor** the ~4 client files (`services/beginningdb/client.ts`, `services/bgdb/{target-resolver,target-store,path}.ts`) into drwn with a documented upstream SHA.
  *Pros*: unblocks today; no coordination; both repos same owner so drift is manageable. *Cons*: manual refresh; two copies to keep honest.
- **(b) Published client package** from the beginning-db workspace (needs exports map + publish pipeline there; package is 0.1.0 with an explicit CLI contract-version mechanism, so churn is expected).
  *Pros*: single source, versioned. *Cons*: blocks on beginning-db work; early-stage version discipline.
- **(c) Git/workspace dependency** on the monorepo package.
  *Pros*: no publish needed. *Cons*: no exports map today makes subpath imports brittle; couples drwn installs to a private monorepo layout.
- **(d) Subprocess `bgdb --json`** for drwn plumbing.
  *Pros*: zero code sharing. *Cons*: adds a binary prerequisite for every drwn mind-card user, process overhead on every sync file op, and contract-version coupling — right for agent skills, wrong for core plumbing.

**Recommendation**: (a) now behind the mind-store boundary, migrate to (b) when beginning-db publishes. (d) stays the agent-skill mechanism only.

### 6.4 O-4 — Placement topology for memory

Where an entry's canonical location is, given R-4 (identity = inode, tree = placements):

- **(a) Born at primary path**: entry created at its primary view path (e.g. `memory/l5/2026-07/<entryId>.jsonl`); additional views (`by-topic/…`, another mind's tree) are placements of that inode. No pool directory.
  *Pros*: simplest; no extra indirection; delete semantics legible (primary holds the "home"). *Cons*: "canonical" is convention, not structure; moving the primary re-homes the entry.
- **(b) Explicit per-mind pool**: `minds/<id>/memory/pool/<entryId>`; all view paths are placements.
  *Pros*: crisp lifecycle (pool row = existence; views are pure metadata); doctor checks trivial. *Cons*: every entry costs an extra placement; pool is one more concept for skills/users.
- **(c) Org/user-level shared pool** outside mind subtrees, minds place inward.
  *Pros*: first-class shared/org memory. *Cons*: **breaks per-mind token confinement** — 107 R2 scopes a worker's token to `minds/<mindId>/`; writing an external pool needs broader tokens or gateway ReBAC. That's a real auth redesign, not a path choice.

**Recommendation**: (a) for V1 — with cross-mind sharing still available (place another mind's entry into your tree, subject to token scope), and (c) deliberately deferred to the V2 conversation alongside L6, because it reopens the auth model. Confirm the §4 interpretation before locking this.

### 6.5 O-5 — Seeds: copies or placements

- **(a) Copies**: each mind gets its own persona/beliefs file inodes at seed time.
  *Pros*: per-mind drift ledger stays truthful (an edit affects one mind); rebase/checkpoint semantics stay per-worker; no fleet-wide blast radius. *Cons*: fleet-wide persona fixes require per-mind rebase (tooling can loop).
- **(b) Placements from a shared card-content location**: seed once, place into every mind.
  *Pros*: edit-once-fleet-wide; storage-free. *Cons*: shared-mutable persona is a governance hazard; one CAS edit "drifts" every mind simultaneously and the ledger can't attribute it; collides with checkpoint-per-worker semantics.

**Recommendation**: (a). Fleet-wide persona update is a legitimate future feature — it should arrive as an explicit `rebase --fleet` style operation, not as an aliasing side effect.

### 6.6 O-6 — L4/L5 formats and entry schemas

- **L5 (observations)** — *(a) append-only jsonl* (recommended: matches `PATCH` append, concurrent-writer safe, high volume) vs *(b) md file per observation* (human-pretty but write-amplifying and contention-prone at observation rates).
- **L4 (reflections/insights)** — *(a) md, one file per reflection* (recommended: humans read and edit these, and DB-first product-service editing (R-3) favors md; placements let one reflection appear in several views) vs *(b) jsonl* (uniform with L5, machine-friendly, but hostile to the primary editing surface) vs *(c) mixed* (defers the choice to authors; costs validation and skill complexity).
- **Entry schema**: fix a minimal shared shape now — L5 line: `{ts, type, content, refs?[], source?}`; L4 file: md with a small front-matter block (`ts`, `derivedFrom` entry ids, `topics`). Cheap to define, expensive to retrofit.

**Recommendation**: L5 = jsonl append-only; L4 = md with front-matter; schemas documented in the card's conventions doc (M0 artifact).

### 6.7 O-7 — Reflection runner (L5 → L4)

- **(a) Skill-only**: the card's `reflect` skill instructs the agent to distill observations on demand / at session end per its own instructions.
  *Pros*: zero infrastructure; iterate on the prompt freely; V1-sized. *Cons*: best-effort — depends on agent compliance.
- **(b) Session-lifecycle hook**: drwn's hook machinery targets tool-call policies; session-end hooks exist in some runtimes but this stretches the current hook composer's scope.
  *Pros*: automatic. *Cons*: new hook-surface work; runtime-dependent semantics.
- **(c) Server-side background job** (engine/runner): scheduled reflection over L5.
  *Pros*: reliable, worker-agnostic. *Cons*: deploy-team scope; belongs with the deferred memory-history research (D-5) — designing it now front-runs that research.

**Recommendation**: (a) for V1; (c) as the explicit V2 research item bundled with D-5.

### 6.8 O-8 — Visibility/push gate in V1

- **(a) Restore as captured** (103: strictest-wins visibility from mind sections, push gate with `--remote-visibility`/`--unsafe-push-public`).
  *Pros*: code and tests are recovered, cost is near-zero; and O-1 *raises* the stakes — checkpointing pulls live DB content (which may contain sensitive material) into card sources, so the gate guards exactly the new flow. *Cons*: small scope add to the restored-machinery phase.
- **(b) Defer entirely**: rely on checkpoint-time human review.
  *Pros*: less V1 surface. *Cons*: review reads diffs, gates enforce policy — a reviewer approving a checkpoint isn't necessarily thinking about push destinations.
- **(c) Visibility field only, warn on push** (no hard gate).
  *Pros*: middle ground. *Cons*: worst of both — the machinery exists but doesn't protect.

**Recommendation**: (a).

### 6.9 O-9 — Local/pre-deploy minds

- **(a) Accept the gap**: minds exist only for deployed workers (V1 scope as ratified).
- **(b) Ask deploy team for provision-without-deploy** (mind row + binding, no deployment) — a small ask but new server surface; defer until a concrete need.
- **(c) Dev-mode escape hatch**: because all binding resolution honors `BGDB_*` env vars, a developer pointing at a local BeginningDB (docker) can already provision/seed an arbitrary "mind" for development — this falls out of the testing design for free and needs at most a doc note.

**Recommendation**: (a) + document (c). Revisit (b) only when a product need (not a dev need) appears.

### 6.10 O-10 — Deploy-team items (external; our communicated preferences)

- **Topology**: *(i) single direct BeginningDB instance* (Fly/VM, tenant-per-user or single-tenant + path discipline) — fastest to stand up; *(ii) gateway-worker-fronted* (workspaces + child-tokens + ReBAC) — the mature target, matches BeginningDB's own multi-workspace design; *(iii) per-org instances* — premature ops burden.
  **Preference**: (i) to unblock V1, with (ii) as the stated target so path/workspace conventions are chosen gateway-compatible from day one.
- **Token lifetime**: (a) long-lived mind-scoped token via their existing secrets pipeline vs (b) short-lived child-tokens + refresh. **Preference**: (a) for V1 (already argued in 107 R2), (b) when the gateway posture arrives.
- **Binding storage / lazy-vs-eager minting**: no preference; their call (107 §8).

### 6.11 O-11 — Naming

- **M0 card**: `@darwinian/mind-tools` (skills + conventions) — "tools" says agent-surface, leaves `@darwinian/mind` free for a future content-carrying base card.
- **drwn modules**: `cli/core/mind-content/` (restored 103 schema/authoring/validation) + `cli/core/mind-store/` (BeginningDB client, seed/rebase/checkpoint, ledger) — content vs store mirrors the card/DB split.
- **Path vocabulary** (per O-4a): primary paths `persona.md`, `beliefs/<card>/<entry>/`, `memory/l4/`, `memory/l5/`; optional view roots `memory/views/<name>/`; `mind.json` ledger at subtree root.

**Recommendation**: as listed; final bikeshed at task-plan time.

## 7. Next step

Each pending decision now carries analyzed options and a recommendation (§6.1–§6.11) — ratifying the recommendations wholesale is a valid fast path. Confirm §4's placement interpretation and settle O-1/O-4/O-6 (the M0-blocking trio); then draft the implementation task plan (M0 skills card → restored 103 machinery per 112 §7 → mind-store + seed → rebase/checkpoint + drift → deploy integration once 107 lands).
