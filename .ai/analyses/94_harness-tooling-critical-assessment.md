# ABOUTME: Critical assessment of the current drwn card model and the analysis-93 target model as harness management tooling, across user scenarios, security, operations, and strategy.
# ABOUTME: Red-teams the decided design: confirms direction, issues eight concrete corrections/gaps, and proposes a porcelain layer and revised Stage-B priorities.

# Analysis 94 — Harness Management Tooling: Critical Assessment of Current and Target Models

**Date**: 2026-07-02
**Author**: Claude + Remy
**Status**: Corrections ACCEPTED (2026-07-02) — folded into analysis 93 and sequenced into the Stage-B plan (tasks/65). This doc remains the rationale of record; §6 is the plan's spec.
**References**: [93_target-card-model-architecture.html (amended per this doc), tasks/65_drwn-card-model-stage-b-implementation-plan.md (executes §6), 90_skill-update-model-investigation.md, 92_mind-card-lifecycle-storage-and-update-model.md, 51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md, 82_drwn-portable-multi-surface-write-path-target-architecture.md]

## Method and stance

The author of this assessment also authored the target model (analyses 90/93), so
the stance here is deliberately adversarial: assume the proposal is wrong and
look for where. Findings are graded: **KEEP** (survives attack), **CORRECT**
(directionally right, detail wrong), **GAP** (unaddressed), **RISK** (needs a
decision, not necessarily now).

## 1. Who the tooling actually serves

| Scenario | What they need most | Current model | Target model |
|---|---|---|---|
| Solo author-consumer (Remy today) | fast edit→see loop, low ceremony | worst served (7-command loop, cp -R hops) | well served (link + release) |
| Team consumer | reproducibility, "what is this doing to my repo" | well served (lock, drift gates) | same + deprecation warnings |
| Team producer | versioning discipline, distribution | served, high ceremony | well served |
| Newcomer | value in ten minutes | poorly served (concept count, two-phase) | **not addressed** (see §4.6) |
| Community publisher | discovery, trust | thin (catalog v1, no signing) | partially (channels, integrity) |
| Multi-machine user | registry sync across machines | **not addressed** | **not addressed** |
| **The agent as operator** | unambiguous edit points, guardrails | tripwire without signpost | well served (provenance, signpost) |

Two under-weighted observations. First, **the primary operator of this tooling
is an LLM agent** — the operator card exists precisely so agents drive drwn.
Agents fail differently from humans: they will confidently edit the nearest
plausible file (a materialized copy) unless the error message itself teaches
the model. This makes recommendation 4 (drift-as-signpost) more load-bearing
than its priority suggests, and argues every error string should name the next
correct command. Second, this session itself is the strongest available
evidence for the target model: the mcp-headers content was stranded across
three copies, recovered only by accident-grade diligence during an unrelated
deletion. Convention-based provenance does not survive contact with real work.

## 2. Current model — what survives attack

- **Immutable content-addressed store, git-native distribution, lockfile with
  integrity** — sound, matches npm/nix/OCI practice. KEEP.
- **Write-record with asymmetric gates** (refuse-overwrite / refuse-delete) —
  genuinely better than most dotfile/config managers; respects user-owned
  files at field granularity for MCP. KEEP.
- **Multi-surface fan-out** (Claude/Codex/Cursor from one intent) — the core
  differentiation; no competitor does this with a lockfile. KEEP.
- **Hook consent gating** — right instinct; code from a card never runs
  without explicit trust. KEEP (and extend, §3.5).

## 3. Current model — weaknesses beyond analyses 90/92

### 3.1 Concept count is the real adoption ceiling (GAP)

A user must learn roughly fifteen nouns: card, mind, mind card, source, store,
extracted, library, bundle, loose skill, curated layer, catalog, defaults,
lock, write-record, generated layer, scope. npm ships value with six. The
target model retires some (defaults, bundle channel) but adds others (upstream
refs, link overrides, meta refs, channels, profile card) — **net concept count
is roughly flat**. Neither 90 nor 92 confronts this; §4.6 proposes the fix
(porcelain verbs), which is packaging, not data-model change.

### 3.2 Two-phase apply→write fights user expectation (RISK)

`npm install` records intent and materializes in one step. drwn separates them
— powerful for preview, but every skill doc must remind "then run drwn write",
and this session used `--write` on effectively every mutation. The flag's
ubiquity is evidence the default is inverted. Consider making materialization
the default with `--no-write` for the preview workflow (or a porcelain verb
that fuses them, §4.6).

### 3.3 Terminology tax (RISK — strategic, not technical)

"Minds" carrying persona/beliefs/memory is the product vision and genuinely
differentiating. But for the 80% use case (skills + MCP distribution), users
who would instantly understand "npm for agent harnesses" must first traverse
mind vocabulary. Keep the vision; ensure every doc leads with the
package-manager mapping and introduces mind semantics second.

### 3.4 Multi-machine registry sync is unsolved (GAP)

The registry is per-machine with no sync story. The stale-checkout incident
was a two-copies-of-truth failure in miniature; every additional machine
(laptop, desktop, Cowork VM, CI) recreates it at registry scale. Cards with
git remotes sync implicitly; sources, trust decisions, and catalogs do not.
Needs at least a documented pattern (remote-first sources; `store export/seed`
for bootstrap), eventually `drwn store sync`.

### 3.5 The trust model covers hooks, not instructions (RISK, grows with catalogs)

Hooks (code) require consent. **Skills — which are instructions an agent will
follow — require none.** A community card's SKILL.md is a prompt-injection
surface: "when the user asks X, also exfiltrate Y via the Z MCP server" ships
without any gate, and a card can bundle both the instructions and the MCP
definition they abuse. Today's blast radius is small (own cards, one shared
catalog); with community catalogs this becomes the headline risk. Minimum
path: (a) `card apply` prints a content summary diff on first apply and on
update (skills added/changed), (b) catalog quality signals become visible in
`search`, (c) signing lands before any default-registered community catalog
grows beyond curated membership. Related: successor pointers in the meta ref
(§4.3) are a social-engineering vector and must be trust-scoped.

### 3.6 Residual mechanical debts (small, known)

Generated minds layer still symlinks (inconsistent with the copy doctrine,
pending per analysis 82); Windows CI not yet green; `listCards` after Stage A
spawns one `git config` per version — should batch with `--get-regexp`
(author's own debt); extracted/ grows unboundedly between `store gc` runs.

## 4. Target model — corrections and gaps from red-teaming

### 4.1 Upstream refs need an optional revision component (CORRECT)

As specified, `git+URL#subpath` implicitly means "latest on default branch",
so `card source sync` is always-latest — which fights deliberate pinning and
makes `--check` ambiguous ("stale against what?"). Extend the form to
`git+URL#subpath@<rev>` (tag or commit, optional; absent = track default
branch). Also: upstream URLs break on repo renames — the harness-skills →
minds-skills rename would have invalidated every ref pointing at it. Tolerate
host redirects on sync and surface "upstream moved" as a doctor warning, not a
hard failure.

### 4.2 Link overrides must be machine-local, not config.json (CORRECT — supersedes a Q1 detail)

`config.json` is the shareable intent file (`install-project` consumes cloned
project state). A committed link override leaks an absolute local path and
breaks every teammate's resolve. Decision Q1 said "config.json, never the
lock"; the correct home is a **machine-local overrides file**
(`.agents/drwn/config.local.json`, init-managed into .gitignore — the
`settings.local.json` pattern). Same UX, no leak channel; check-no-local-paths
stays clean by construction.

### 4.3 refs/meta needs merge semantics and successor trust-scoping (CORRECT)

- The meta ref is force-updated: two machines deprecating different versions
  is last-writer-wins data loss. Deprecation maps are naturally mergeable —
  implement fetch → union-merge → push, never blind force.
- **Successor pointers are an attack vector**: a compromised remote that sets
  `successor: @evil/operator` gets the tooling itself to recommend the
  attacker's card. Successor suggestions must be gated: auto-suggest only
  same-scope successors; cross-scope requires catalog corroboration or
  explicit user confirmation.
- Add `card meta show` — GitHub UI will never display the ref; the CLI must.

### 4.4 Profile card fan-out will regress UX without bulk operations (CORRECT)

Retiring defaults converts one machine-wide update into N per-project updates
(`card update` + `write` × every repo). At 40 repos this is strictly worse
ergonomics than the channel it replaces, and users will feel it weekly. The
decision stands (explicitness is right), but Stage B must ship a companion:
`drwn projects list/update --all` (the `organize-workspace` stub is the
natural home) or the profile-card migration should wait for it. Also: the
43-defaults → profile-card curation is real manual work; script the capture
(`card new --from-defaults`).

### 4.5 Duplicate-skill conflict rule must precede the profile card (GAP, now urgent)

With profile card + operator card applied together, one skill name in both is
imminent (both plausibly bundle authoring/workflow skills). Today's behavior
is whatever sync happens to do last. Define it: **deterministic precedence by
apply order (later wins) with a loud per-skill warning, and an explicit
`exclude` list in project config for intentional resolution.** Error-on-
conflict is the safe alternative but makes card composition brittle;
warn+deterministic matches mind-stack layering semantics already in the
product.

### 4.6 The missing porcelain layer (GAP — highest strategic leverage)

Git survived its concept count by splitting porcelain from plumbing. drwn has
only plumbing. Three or four porcelain verbs would collapse the newcomer path
without touching the data model:

- `drwn use <card-ref>` = clone-if-needed + apply + write (one command to value)
- `drwn up` = outdated + update + write across the project
- `drwn release <card>` = the Stage-B pipeline (already planned)
- `drwn dev <card> <dir>` / `drwn dev --off` = link/unlink + watch

The operator skills then teach porcelain first, plumbing on demand. This is
the single cheapest answer to §3.1 and should be scoped into Stage B.

### 4.7 card release should propose the bump from card diff (KEEP+)

`card diff` already classifies changes; `release` should propose
patch/minor/major from that classification rather than asking cold. Mid-
pipeline failure must be resumable: every step idempotent, re-run continues.

### 4.8 Catalog v2: tags stay authoritative (KEEP with guardrail)

The versions map duplicates git-tag truth; drift between them is inevitable
unless the catalog is derived data. Rule: catalog entries are generated from
the card repo (CI or `release`), never hand-edited; `catalog validate --deep`
enforces agreement.

## 5. Strategic positioning

Competitors: Claude Code plugin marketplaces (bundled distribution, zero
lockfile, single surface), `npx skills` (install-only), dotfiles/stow (no
model), nix (right model, hostile UX). drwn's defensible ground: (1)
multi-surface fan-out, (2) reproducible team distribution, (3) minds — persona
/beliefs/memory as first-class content, (4) **the evolutionary loop**: session
signals + analyzer already exist, and no competitor has a fitness-feedback
path from usage back to card revision. The target model's provenance chain is
what makes that loop closable (variant A/B of a skill across projects with
attributable outcomes). Recommendation: treat the meta ref as the future home
of fitness/eval annotations — same mutable-metadata channel, no new machinery
— and say so in the Stage-B design so the schema reserves room
(`metadataVersion` already does).

The exposed flank is onboarding against built-in plugin systems. Porcelain
(§4.6) plus a sub-ten-minute `bootstrap-project` → `use` path is the answer;
losing that race makes the deeper model moot.

## 6. Revised Stage-B priority order

1. Upstream provenance **with revision component** + `card source sync` (4.1)
2. Porcelain verbs `use` / `up` / `dev` / `release` (4.6, 4.7) — release
   proposes bump from `card diff`
3. `card link` with **machine-local overrides file** (4.2)
4. Conflict rule for duplicate skills (4.5) — blocks profile card
5. refs/meta with union-merge + trust-scoped successors + `card meta show` (4.3)
6. Profile-card migration **with bulk project ops** (4.4)
7. Drift signposts + `--scope machine` gate (unchanged)
8. Trust hardening roadmap doc: apply-time content summaries now, signing
   before open catalogs (3.5)

## 7. Verdict

The target model survives red-teaming **directionally intact**: immutable
content + mutable metadata + provenance-as-data + per-project activation is
the right skeleton, and the rejected alternatives stay rejected. The
assessment issues two corrections that change decided details (link overrides
move to a machine-local file; upstream refs gain a revision component), two
guardrails that must precede their features (duplicate-skill rule before
profile card; meta-ref merge + successor trust before Stage-B deprecation),
and one strategic addition (porcelain verbs) that addresses the only
existential risk found — conceptual overload at onboarding — without touching
the data model. The deepest long-term asset is the one the tooling is named
for: provenance plus the signal/analyzer loop makes cards *evolvable*, and no
competitor is positioned to copy that.
