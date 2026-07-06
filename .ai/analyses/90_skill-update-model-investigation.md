# ABOUTME: Investigation of how skill content flows from canonical source to materialized agent files, why updating card-bundled skills is error-prone, and candidate data models.
# ABOUTME: Recommends upstream provenance as data, a dev-mode card link override, a release pipeline command, drift-as-signpost messaging, and scope/catalog hardening — while keeping the immutable store.

# Analysis 90 — Skill Update Model: Investigation and Target Options

**Date**: 2026-07-02
**Author**: Claude + Remy
**Status**: Open questions 1–4 decided with Remy (2026-07-02); deprecation fix Stage A implemented (working tree, uncommitted)
**References**: [analyses/92_mind-card-lifecycle-storage-and-update-model.md (operational model; code-verified storage homes and transitions), analyses/89_darwinian-operator-card-migration-design.md, analyses/82_drwn-portable-multi-surface-write-path-target-architecture.md, analyses/68_drwn-meta-skill-distribution-options.md]

## Problem

Updating a skill that ships inside a card requires knowing which of many
physical copies is upstream, and the data model does not say. Measured on this
machine, `apply-mind-card/SKILL.md` exists in 10+ places:

1. Canonical repo tree — `darwinian-minds-skills/skills/<name>/` (the only
   intended edit point)
2. Repo-internal card copy — `cards/operator/skills/<name>/` (via the
   repo-local `npm run sync:cards`)
3. Card source — `~/.agents/drwn/sources/@darwinian/operator/skills/<name>/`
   (populated today by manual `cp -R`)
4. Published store — bare git repo + `~/.agents/drwn/extracted/<sha>/` (one
   per published version; content-addressed, immutable)
5. Library bundle copy — `~/.agents/drwn/skills/darwinian-minds-skills/0.4.0/`
6. Curated publication layer — `~/.agents/skills/<name>/` (machine defaults)
7. Per-project materialized copies — `.claude/skills/`, `.codex/skills/`
   (plain file copies; the generated layer under `.agents/drwn/generated/`
   symlinks into `extracted/`, but the agent-facing layer is copies)
8. The same again in every other drwn project (ai-narratives, etc.)

Only the copy pipeline's conventions (a per-repo `card-map.mjs`, README
instructions, skill docs) encode which copy feeds which. The problem is also
**cross-repo**, not just repo-internal: `@remyjkim/knowledge-docs` bundles
skills whose canonical home is `darwinian-minds/skills/shared/` (analysis 92
Appendix B) — so any upstream mechanism must express refs across repository
boundaries. Consequences observed first-hand during the operator migration
(analysis 89):

- The mcp-headers improvements were stranded across three diverged copies
  (stale checkout, standalone library package, canonical repo) with no
  recorded pointer identifying upstream; reconciliation required manual
  three-way diffing.
- Repo → card-source transfer is a manual `cp -R`; nothing validates the
  copy is fresh at publish time.
- A two-line doc fix after publish forced a full version bump (1.0.0 → 1.0.1)
  plus re-copy, re-publish, re-update, re-write.
- The same skills flow through two parallel channels with different update
  semantics: cards (publish/pin) and library bundle + defaults (`--replace`).

## What prior analyses already decided (and should stand)

- **Copy-based materialization at agent surfaces** (analysis 82): agent-facing
  files are plain copies tracked by `contentHash` in the write-record, because
  the harness depends only on OS-uniform primitives (no symlinks/exec bits) —
  required for Windows and Cowork. The known, accepted cost: edits are not
  live; you re-run `drwn write`.
- **Immutable, content-addressed published store** (git-backed cards +
  `extracted/<sha>`): gives reproducibility (card.lock), team distribution,
  and integrity. This matches nix/OCI/npm-registry practice and is the right
  consumption model.
- **Library is an iteration aid; cards are the final home** for shared skills
  (analysis 68).

Analysis 92 additionally verified against CLI source (`effective-state.ts`,
`card-lock.ts`, `sync.ts`, `store-paths.ts`) that:

- A card occupies **four storage homes** (source / immutable local store /
  git remote / catalog) plus two runtime steps (apply → materialize), and
  **nothing propagates automatically** — every transition is one explicit,
  forward-only command.
- Card sources created by `drwn card new` are themselves git repos; sources
  staged by hand-copy (as done in the operator migration) lack `.git` and are
  out-of-spec for push/remote workflows even though doctor accepts them.
- The store already keeps **partial provenance at the card level**:
  `url-card-map.json` maps git URLs to cards. The upstream field proposed
  below is the same idea pushed one level down, to skills — incremental, not
  novel, for the data model.
- The write pipeline enforces asymmetric drift gates (refuse-overwrite,
  refuse-delete) via managed-path content hashes — the machinery
  recommendation 4 builds on already exists.

The investigation conclusion is that these decisions are sound. The gap is not
the number of copies — every mature ecosystem materializes copies — it is
threefold: (a) upstream pointers are convention, not data; (b) there is no
sanctioned fast path from "edit canonical" to "see it live in a project"
short of the full publish ceremony; and (c) even the sanctioned ceremony is
seven manual commands per update (sync → bump → doctor → publish → validate →
push → catalog), with no orchestration (analysis 92, open question 3).

## Prior art scan

| Ecosystem | Consumption model | Dev-mode escape hatch |
| --- | --- | --- |
| npm/yarn/pnpm | registry + lockfile | `npm link`, `file:` deps, `workspace:*`, overrides |
| cargo | registry + lockfile | path deps, `[patch]` section |
| go | module proxy + go.sum | `replace` directive |
| nix | content-addressed immutable store | `nix develop`, flake path inputs |
| Docker/OCI | content-addressed layers | bind mounts during dev |
| Claude Code plugins | git-ref marketplace, no lockfile | local plugin dirs |

The universal pattern: **immutable pins for consumers, declared path overrides
for developers, both recorded in project metadata**. drwn has the first half
(`card.lock`, `file:` refs exist but replace the pin rather than overlaying
it) and lacks the second half as a first-class concept. Structurally, drwn is
already a decentralized git-native registry — source repo → bare-repo store →
remote → index — so the missing pieces are exactly the ones mature ecosystems
grew after their registry core: dev links, release orchestration, and
provenance metadata.

## Recommended target model (in priority order)

### 1. Make upstream provenance first-class data

Card source manifests gain per-skill (later per-MCP/hook) upstream metadata:

```json
"skills": {
  "include": ["apply-mind-card"],
  "upstream": { "apply-mind-card": "git+https://github.com/remyjkim/darwinian-minds-skills.git#skills/apply-mind-card" }
}
```

The canonical ref form is a git URL + subpath, because the frozen-snapshot
relationship is cross-repo in practice (knowledge-docs ← darwinian-minds);
bare local paths are a dev-only convenience that `card publish` must reject
or rewrite (consistent with the existing check-no-local-paths CI rule). Then:

- `drwn card source sync [--check]` replaces every repo's private
  `sync-card-skills.mjs` — the card map becomes manifest data the CLI owns.
- `drwn card source doctor` fails on stale copies at publish time.
- Provenance chains end-to-end: materialized copy → (write-record) →
  card@version → (lock/manifest) → card source → (upstream field) → canonical
  repo path. `inspect-minds --why <skill>` can finally answer "where do I
  edit this?" from any layer.
- As a second phase, the pure-ceremony copy hops collapse: with upstream as
  data, the repo-internal `cards/<card>/skills/` duplication becomes
  unnecessary (publish resolves skills from the canonical tree), and the
  manual repo → `~/.agents/drwn/sources` copy becomes
  `drwn card source add file:<dir>` — which also fixes the sources-without-
  `.git` spec gap that hand-copying creates today.

### 2. Dev-mode card link (path override)

`drwn card link file:<card-source-dir>` in a project: records an override in
`config.json` (never in `card.lock` — the lock keeps the last published pin),
`drwn write` re-copies from the live tree, `drwn status`/`inspect-minds`
flag the card loudly as dev-linked, and `drwn card unlink` restores the pin.
Optionally `drwn write --watch` for a live edit loop. This is `npm link` /
cargo path-deps / go `replace` for cards — the ceremony-free path today's
workflow lacks. Materialization stays copy-based (portability preserved).

**Decided**: the primitive is per-card, with a bulk convenience form
(`card link --all-from <dir>` or a central overrides block) for monorepos
that source several cards from one working tree.

### 3. `drwn card release` — orchestrate the publish pipeline

The sanctioned update loop is seven commands (analysis 92: sync → version
bump → doctor → publish → validate → push → catalog publish `--replace`).
A single `drwn card release <name> [--bump patch|minor|major]` should chain
them with one confirmation gate and stop cleanly at the first failure. This
attacks the pain producers hit on *every* update, which is why it ranks ahead
of deeper structural work: `card link` (item 2) removes ceremony from the dev
loop; `release` removes it from the publish loop.

**Decided direction for the two-channels split**: the target model is
**global registry, per-project activation** — the machine store
(sources / published store / library / catalogs) is the single machine-wide
registry of what is *available*; whether a card is applied, written, and used
is decided per project via `card apply` + `drwn write`. Machine defaults, the
one channel that activates machine-wide, are retired rather than elaborated:
personal staples move into a **profile card** (e.g. `@remyjkim/everyday`)
applied per project, with `bootstrap-project` suggesting it on init. The
double-update problem disappears by construction — one activation channel
means no parallel copy to keep in sync. (This supersedes the earlier
"defaults consume cards" idea; a machine-card design was also considered and
set aside as investing in machine-wide activation, the opposite of the
decided principle.)

### 4. Turn drift detection into a signpost

Materialized skill copies get a generated header line ("managed by drwn —
edit <upstream>, then `drwn write`"), and drift errors name the upstream edit
point instead of only refusing. The asymmetric refuse-overwrite /
refuse-delete gates and managed-path content hashes already exist (analysis
92); this adds provenance (item 1) to their messages.

### 5. Safety hardening: explicit scope and catalog integrity

Two exposures analysis 92 surfaced, cheap to close alongside the above:

- **Scope is implicit.** `writeScope = projectRoot ? "project" : "machine"`
  (`effective-state.ts`) — machine-wide writes to `~/.claude`/`~/.codex`
  trigger by the *absence* of a project config above cwd. Add an explicit
  `--scope machine` requirement or a confirmation gate before machine-scope
  materialization.
- **Catalog entries are bare pointers** (URL + tag) with no integrity
  guarantee; they break silently if the repo goes private or a tag is
  deleted. `card.lock` already records `integrity` hashes — catalog entries
  should carry the same, and `drwn search`/`clone` should verify on fetch.

## Explicitly rejected options

- **Symlink-back / live-link materialization**: contradicts analysis 82's
  portability constraints (Windows, Cowork), breaks content-hash drift
  detection, and makes team-shared cards machine-path-dependent. The repo
  even CI-fails on embedded local paths.
- **Mutable published versions** ("just fix 1.0.0 in place"): destroys
  reproducibility and team trust in pins; version ceremony is the cost of
  integrity — item 2 removes the ceremony from the dev loop instead.
- **One-copy world** (edit the store/extracted content directly): the store
  is a distribution cache, not a workspace; same reasoning nix uses for its
  read-only store.

## Question resolutions (decided with Remy, 2026-07-02)

1. **`card link` granularity — DECIDED: per-card primitive plus bulk
   convenience.** Per-card matches every prior-art analog and mixed-source
   projects (darwinian-cards runs operator + fal from different repos); a
   `--all-from <dir>` form covers monorepos.
2. **Machine defaults — DECIDED: global registry, per-project activation
   (refined option D).** The machine store stays the single registry of
   available cards/sources; activation is per-project only. Existing machine
   defaults migrate to a personal **profile card** applied per project. See
   recommendation 3 for the full statement.
3. **Catalog entries — DECIDED: single entry per card with a version list /
   stability channels (`latest`/`stable`/`experimental`), landing at the next
   catalog schema bump.** Aligns with the existing `stability` field in
   `card.json` and is the natural home for per-version integrity hashes
   (recommendation 5). Until the schema bump, releases auto-`--replace` the
   prior entry; git tags keep older versions installable.
4. **Deprecation fix placement — DECIDED and Stage A implemented** (in
   `cli/core/card-store.ts`, `cli/commands/card/list.ts`,
   `cli/commands/card/show.ts`, `test/core-card-deprecate.test.ts`;
   uncommitted): staged.
   Stage A hotfix now (digit-safe config key via a single `deprecationKey()`
   helper following the `bumpOverrideConfigKey` precedent, plus a reader in
   `card list`/`show` and tests — deprecation is currently write-only and
   nothing surfaces it); Stage B moves storage to a distributable
   `refs/meta/*` mutable-metadata ref in the model release (git config never
   travels — push sends only `refs/heads/main` + tags); Stage C reflects
   deprecation in catalog entries at schema v2. The bug: deprecation writes
   git config key `drwn.deprecated.<version>`, invalid for every semver
   version because the final key segment starts with a digit.

(Previously open here, now settled: upstream refs must be git URLs in
published cards — the cross-repo evidence and the check-no-local-paths rule
both demand it; local paths remain a dev-only convenience that publish
rejects or rewrites.)
