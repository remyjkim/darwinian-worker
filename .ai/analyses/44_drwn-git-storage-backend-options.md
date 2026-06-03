# Git-Based Storage Backend — Architecture Options Analysis

**Date**: 2026-05-29
**Author**: Claude + Remy
**Status**: Draft
**References**: [analyses/43_drwn-cli-target-architecture.md, analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, analyses/32_harness-cards-vs-flox-and-conda.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/13_library-defaults-config-target-architecture.md, analyses/37_harness-cards-registry-pinning-target-architecture.md, analyses/41_card-source-authoring-cli-target-architecture.md, https://github.com/dallay/agentsync, https://github.com/dallay/agents-skills]

---

## Executive Summary

The proposal: replace (or augment) the current card store layout — versioned-immutable directories at `~/.agents/drwn/cards/@scope/name/<version>/...` — with a **Git-based versioning system** where semver versions map to Git refs (tags and/or commits), and content is stored once in Git objects rather than copied per version. `drwn apply` would resolve a card+version to a specific Git node and materialize its content into downstream tools.

This document enumerates the architectural design space, evaluates five concrete candidate designs against the project's existing constraints (cards model, lockfile contract, materialization mechanisms), and recommends a path. The investigation includes a deep look at `dallay/agentsync`'s Git-based catalog model, which sits in adjacent design territory.

**Headline findings:**

- The cards model (per `29_*`) already gives drwn most of what Git would provide: immutability per version, lockfile pinning, content integrity. Git-as-storage is **not load-bearing** for cards' reproducibility story. Its real benefits are elsewhere: built-in `log`/`diff`/`blame` over card history, Git-native distribution (push/pull), unification of source + published store, and disk-level deduplication of unchanged content across versions.
- **Five design candidates** are viable; three are honest contenders. Design A (conservative per-card Git repos), Design B (submodule federation — closest to the user's stated vision), and Design E (cache-only, Git URLs as refs — `agentsync`-flavored) form the spectrum from minimal disruption to maximum distribution.
- **`agentsync`'s pattern is informative but shallow.** It treats the catalog repo as a flat HEAD-pull source — no per-skill versioning, no lockfile, no integrity beyond what GitHub's archive endpoint provides. drwn must keep semver + lockfile + integrity hash; Git is the *under-the-hood* mechanism, not a replacement for that contract.
- The **materialization layer is unchanged** under all candidates. Three mechanisms (symlinks, `_drwn` meta-block, generated-file-plus-symlink) remain. Git only changes where the *source* content lives; the downstream contract with Claude / Codex / Cursor doesn't move.
- **Recommendation:** start with **Design A (conservative per-card repos)** as a thin layer behind the current store API. It buys history/diff/log + a credible upgrade path to Design B without paying the submodule complexity tax up front. Design E is the right cheap alternative if history isn't valued and only distribution-via-Git matters. Design B remains a viable v3+ evolution once Design A's per-card repos are in place.

---

## 1. Context and Scope

### 1.1 What the proposal is

Remy's framing (from the conversation):

> "in the similar way that Git has commits, we would also have these semantic versionings, but under the hood, would keep track of all the files and store the file versions in a separate submodule Git repo. So whenever we do an apply operation, we will be able to track which specific node in the version system or versioning tree we want to recall and materialize."

Unpacked, this proposes:

- **Semver remains the user-facing concept.** `@me/foo@1.2.0` is what appears in `cards[]` and `card.lock`.
- **Git is the implementation.** Versions correspond to Git refs (tags or commits).
- **A submodule Git repo holds file versions.** This phrasing suggests:
  - A parent repo (or virtual structure) pins which version of each card is "active."
  - Card content lives in a submodule-like child repo.
- **Apply resolves to a Git node** and materializes its content into the downstream tools.

### 1.2 What this analysis covers

- Concrete designs that satisfy the proposal, with storage layouts, lockfile shapes, and command flow.
- Trade-offs in materialization mechanics, distribution, disk usage, complexity.
- Comparison to `agentsync`'s Git-based catalog model.
- A recommended path and honest critique of each candidate.

### 1.3 What this analysis does NOT cover

- A full implementation plan. That follows once a design is approved.
- A rewrite of the materialization layer. Per `32_*` §5, the three downstream mechanisms are forced by the consumer tools' read contracts; Git changes nothing there.
- Replacement of the cards model itself. Cards (multi-card composition, last-wins merge, lockfile, project overlay) remain. Only the *storage* of card content is in scope.

### 1.4 Constraints inherited from prior analyses

Any Git-based storage backend must preserve:

- **Multi-card composition** per project (`29_*` and `42_*` §3).
- **Lockfile-pinned reproducibility** — same lockfile + same store = byte-identical effective state.
- **Content integrity** — every materialized card carries a verifiable hash.
- **Materialization atomicity** — `drwn apply` either succeeds and produces consistent downstream state, or fails cleanly.
- **Write records** for tracking drwn-owned files and clean removal.
- **The 8th-layer positioning** from `32_*` §6.2 — drwn manages agent-harness state, doesn't pretend to be Flox/Nix/Conda.

The vocabulary cleanup (`42_*` v2) is also assumed: `drwn apply` is the materialization verb; project composition lives at top level; `drwn card` is the artifact namespace.

---

## 2. Reference: How agentsync Does It

`dallay/agentsync` is the closest published tool in adjacent territory. A short investigation summary, because its model is informative for what to borrow and what to avoid.

### 2.1 What it does

- Single source of truth at `<project>/.agents/`; symlinks fanned out to each consumer (Claude, Codex, Cursor, Copilot, Gemini, OpenCode).
- Skills installed from a **separate Git catalog repo** (`dallay/agents-skills`).
- Catalog is a flat directory of `skills/<name>/SKILL.md` entries; one repo, no per-skill versioning.
- The skill IDs are `<owner>/<repo>/<skill-name>` (e.g., `dallay/agents-skills/docker-expert`).
- Installation: download the source repo's archive via `https://github.com/<owner>/<repo>/archive/HEAD.zip` and extract the named subpath.
- Catalog metadata is **embedded in the binary** at compile time (Rust includes `catalog.v1.toml` via `include_str!`).
- Local-override hook: if `AGENTSYNC_LOCAL_SKILLS_REPO` points at a sibling clone, use it instead of fetching.
- No lockfile. No per-skill semver. No integrity hash beyond GitHub's archive response.

### 2.2 What's useful to borrow

- **Git-repo-as-catalog is a viable pattern at small scale.** No package registry needed; the Git host IS the registry.
- **GitHub's `archive/<ref>.zip` endpoint is a free distribution channel** that supports any ref (branch, tag, commit). Same for GitLab and most hosts.
- **Local-override via sibling-clone env var** is a nice developer affordance — cheap to add, big quality-of-life win for the maintainer.
- **Deterministic URL construction from a structured ID** avoids round-tripping a search API.

### 2.3 What to NOT borrow

- **HEAD-pull semantics.** agentsync pulls whatever HEAD of the source repo is at install time. No reproducibility. Two developers installing the same skill on different days can get different content. drwn's cards-with-lockfile is much more rigorous and that contract must not regress.
- **No semver per skill.** Every skill is effectively "latest." This is fine for a small curated catalog but fails as soon as a skill has incompatible versions.
- **No integrity verification beyond GitHub's transport.** drwn already does sha256 integrity for cards; this must stay.
- **Embedded catalog in binary.** Locks the catalog to release cadence of the CLI. Fine for `agentsync`'s scale (a few dozen skills) but doesn't scale to community contribution.

### 2.4 Net takeaway

`agentsync` proves that Git-as-distribution-channel works for small curated content. Its **simplicity comes from skipping reproducibility**. drwn cannot make the same trade — the cards architecture explicitly opted into lockfile-pinned reproducibility for good reasons (`29_*` §4.2, comparable to pnpm/uv). Anything Git-based in drwn must preserve that contract.

---

## 3. The Six Design Dimensions

A Git-based storage design varies across six orthogonal axes. Each axis admits multiple positions; the candidate designs in §4 are concrete combinations of positions across these axes.

### 3.1 Dimension D1 — Repo granularity

How many Git repositories make up "the store"?

- **D1.a Monorepo.** Single `~/.agents/drwn/store.git` containing every card under `cards/@scope/name/`. Versions distinguished by tags (e.g., `card/@scope/name/1.2.0`).
- **D1.b Per-card repo.** `~/.agents/drwn/cards/@scope/name.git/` per card. Each card has independent history and tags `v1.2.0`. N repos on disk.
- **D1.c Per-scope repo.** `~/.agents/drwn/cards/@scope.git/` per scope. Each scope holds multiple cards as subdirectories; tags carry the card name (e.g., `foo/v1.2.0`).
- **D1.d Submodule parent + per-card submodule.** Parent repo lists submodule pointers; each submodule is its own card repo. Parent's HEAD pins which submodule commits are "active." User's stated direction.
- **D1.e No local Git store.** No central Git repo at all; cards are referenced via Git URLs, downloaded to a content-addressed cache. (Used in Design E.)

### 3.2 Dimension D2 — Versioning scope

What in `~/.agents/drwn/` is Git-versioned?

- **D2.a Cards only.** Sources, MCP defs, machine config stay as plain files.
- **D2.b Cards + sources merged.** Source authoring lives in the same Git repo as published versions (tags = published; branches/HEAD = editable).
- **D2.c Cards + sources + MCP definitions.** MCP server defs join the Git-versioned set.
- **D2.d The whole store.** `~/.agents/drwn/` is a Git repo top-to-bottom. `machine.json`, `projects.json`, profiles, presets, all under version control. "Roll back my machine" = `git checkout`.

### 3.3 Dimension D3 — Version representation in Git

How does semver `@scope/name@1.2.0` map to a Git ref?

- **D3.a Tags = semver.** Each published version is an annotated tag carrying the semver. Lockfile stores tag name + commit SHA.
- **D3.b Commits with semver metadata.** A `package.json`-style file at each commit names the version. Tags are nice-to-have but optional. Lockfile stores commit SHA.
- **D3.c Branches per major version.** `v1.x` branch tracks the v1 line, `v2.x` for v2. Tags mark releases on those branches.
- **D3.d Hybrid.** Annotated tags for releases (immutable, semver-named), branches for major-version development lines, commit SHAs in lockfile for exact pinning. This is what modern OSS conventions look like.

### 3.4 Dimension D4 — Distribution model

How do cards move between machines and teams?

- **D4.a Local-only Git.** Git is purely a local format. Distribution still happens via npm + tarballs (today's model).
- **D4.b Git-as-distribution.** `drwn store push <remote>` becomes `git push`; `drwn store pull <remote>` becomes `git pull`. Federated; no central registry needed.
- **D4.c Both.** Public cards on npm; private/team on Git remotes. Two distribution paths.
- **D4.d Git URLs as card refs.** A card ref can be `git+https://github.com/me/foo.git#v1.2.0`. No local Git store; just a content cache. (Used in Design E.)

### 3.5 Dimension D5 — User exposure

Does the user know Git is under the hood?

- **D5.a Invisible.** Users only run `drwn` commands. Git is implementation; `drwn` translates everything.
- **D5.b Hybrid.** Common ops via `drwn`; advanced ops (`git log`, `git diff`, custom workflows) available because the store IS a Git repo.
- **D5.c Visible protocol.** `drwn` is a thin wrapper over Git. Users routinely run `git` directly.

### 3.6 Dimension D6 — Materialization mechanics

How does Git-stored content reach the downstream symlinks?

- **D6.a Bare repo + extract on demand.** Store is a bare Git repo. `drwn apply` extracts pinned versions via `git archive` or `git cat-file` into a working location. Downstream symlinks point into the extracted tree. Re-extract when a version changes.
- **D6.b Worktrees per active version.** `git worktree add <path> <ref>` for every (card, version) currently materialized. Downstream symlinks point at worktrees. Worktrees share Git objects; only their checked-out files differ.
- **D6.c Single working tree.** Store has one working tree; checkout the right version when needed. Doesn't support multi-version materialization (e.g., projectA pins `@me/foo@1.0`, projectB pins `@me/foo@1.1`).
- **D6.d Content-addressed extraction.** Resolve lockfile to commit SHAs; extract each unique SHA once into `~/.agents/drwn/extracted/<sha>/`. Downstream symlinks point at SHA-addressed directories. GC removes unreferenced SHAs.

---

## 4. Five Concrete Design Candidates

Each candidate is a concrete combination of positions across the six dimensions. Each gets a storage layout sketch, lockfile shape, command flow, and honest trade-off summary.

### 4.1 Design A — Conservative per-card Git repos

**Positions:** D1.b · D2.a · D3.d · D4.a · D5.b · D6.d

**Idea.** Replace today's plain-directory versioning with a per-card Git repo. The user-facing semantic is unchanged; under the hood, each card is a Git repo with tags. Disk layout mirrors today's `~/.agents/drwn/cards/@scope/name/` but each card is now a bare repo.

**Storage layout:**

```text
~/.agents/drwn/
├── cards/                              # one bare Git repo per card
│   └── @me/
│       └── baseline.git/               # bare repo
│           ├── refs/tags/v1.0.0
│           ├── refs/tags/v1.1.0
│           ├── refs/tags/v1.2.0
│           └── ...                     # standard bare Git structure
├── extracted/                          # content-addressed extraction cache
│   ├── <sha256-of-tree>/               # extracted content of a specific Git tree
│   │   ├── card.json
│   │   ├── skills/...
│   │   └── mcp-servers/...
│   └── ...
├── sources/                            # editable card sources (unchanged from today)
│   └── @me/baseline/                   # regular working tree; may or may not also be a Git repo
└── ...
```

**Lockfile shape (additive change):**

```json
{
  "lockfileVersion": 2,
  "cards": [
    {
      "spec": "@me/baseline@^1.0.0",
      "name": "@me/baseline",
      "version": "1.2.0",
      "origin": "store",
      "integrity": "sha256-abc...",
      "git": {
        "ref": "v1.2.0",
        "commit": "deadbeef1234..."
      },
      "extracted": "deadbeef1234..."  // points at extracted/<commit>/
    }
  ]
}
```

**Command flow (`drwn add @me/baseline@^1.0.0`):**

1. Resolve `^1.0.0` against tags in `~/.agents/drwn/cards/@me/baseline.git` (or fetch from npm if not present locally).
2. Pick the highest matching tag (e.g., `v1.2.0` → commit `deadbeef`).
3. If `~/.agents/drwn/extracted/deadbeef/` doesn't exist, run `git archive --format=tar deadbeef | tar -x -C ~/.agents/drwn/extracted/deadbeef/`.
4. Verify integrity hash against `card.json` of the extracted tree.
5. Update `<project>/.agents/drwn/config.json` and `card.lock`.

**Command flow (`drwn apply`):**

1. Read `card.lock`. For each card, ensure its extracted SHA-directory exists; extract if not.
2. Run the existing three-mechanism materialization against the extracted content.
3. Update write record.

**`drwn publish` flow:**

1. Take an editable source from `~/.agents/drwn/sources/@me/baseline/`.
2. Resolve target version (e.g., bump from manifest).
3. Commit the source's current content into `~/.agents/drwn/cards/@me/baseline.git` on `main`.
4. Tag the commit `v1.2.0`.
5. Update `~/.agents/drwn/extracted/` with the new tree.

**Trade-offs:**

| Property | Status |
|---|---|
| User-facing surface change | minimal — semver still primary |
| Git visibility | hybrid — power users can `git log` directly in `cards/@me/baseline.git` |
| Distribution | unchanged (still npm + planned `drwn store push/pull` per `29_*`) |
| History/diff/log | gained — `cd ~/.agents/drwn/cards/@me/baseline.git && git log` works |
| Disk efficiency | improved per card (Git objects dedupe across versions), but cards don't share with each other |
| Sharing one card with a team | natural — push that one repo |
| Submodule complexity | none — no submodules used |
| Migration from today | low effort — each existing version directory becomes the initial commit + tag in a new repo |
| Backward compat | full — same `cards/@scope/name/...` path layout via extraction cache |
| Implementation effort | medium — Git plumbing, extraction cache, GC of unreferenced SHAs |

**Honest assessment:** This is the lowest-risk path. It buys most of the history benefits without paying the submodule complexity tax. It also leaves an obvious upgrade path: if later we decide to do submodule federation (Design B), the per-card repos are already in place — we just add a parent repo that submodules them.

### 4.2 Design B — Submodule federation (the user's stated vision)

**Positions:** D1.d · D2.b · D3.d · D4.b · D5.b · D6.b

**Idea.** A parent Git repo at `~/.agents/drwn/store.git/` maintains a list of card submodules. Each card lives in its own Git repo (hosted anywhere — GitHub, GitLab, local file path). The parent's HEAD records which commit of each submodule is "active" — the parent itself becomes a meta-lockfile in Git form. Sources and store merge: a card's editable working tree and its published tags share one repo.

**Storage layout:**

```text
~/.agents/drwn/
├── store.git/                          # the parent repo (regular working tree)
│   ├── .gitmodules                     # submodule registrations
│   │   # [submodule "@me/baseline"]
│   │   #   path = cards/@me/baseline
│   │   #   url = https://github.com/me/baseline-card.git
│   │   # [submodule "@team/observability"]
│   │   #   path = cards/@team/observability
│   │   #   url = https://github.com/team/observability-card.git
│   ├── cards/
│   │   ├── @me/
│   │   │   └── baseline/               # submodule working tree, at a pinned commit
│   │   │       ├── .git                # gitlink → submodule .git
│   │   │       ├── card.json
│   │   │       ├── skills/
│   │   │       └── mcp-servers/
│   │   └── @team/
│   │       └── observability/          # another submodule
│   └── lockfile.json                   # parent-tracked global state (optional)
└── ...
```

**The "pin a version" model:**

- A project's `card.lock` references `@me/baseline@1.2.0`.
- The parent `store.git` repo, at its current HEAD, has the `@me/baseline` submodule pinned at commit `deadbeef` (which carries tag `v1.2.0`).
- `drwn apply` runs `git submodule update --recursive` to ensure all submodules are at their pinned commits, then materializes.

**Lockfile shape:**

```json
{
  "lockfileVersion": 2,
  "storeRef": "abc123...",       // commit SHA of parent store.git HEAD
  "cards": [
    {
      "spec": "@me/baseline@^1.0.0",
      "name": "@me/baseline",
      "version": "1.2.0",
      "git": {
        "submodule": "cards/@me/baseline",
        "url": "https://github.com/me/baseline-card.git",
        "ref": "v1.2.0",
        "commit": "deadbeef1234..."
      },
      "integrity": "sha256-abc..."
    }
  ]
}
```

**Command flow (`drwn add @me/baseline@^1.0.0`):**

1. If `@me/baseline` not already a submodule in `store.git`, run `git submodule add <url> cards/@me/baseline`.
2. `cd cards/@me/baseline && git fetch --tags && git checkout v1.2.0`.
3. `cd store.git && git add cards/@me/baseline && git commit -m "pin @me/baseline to v1.2.0"`.
4. Update project's `config.json` and `card.lock` (lockfile carries both commit SHA and a reference to store.git's commit at this point).

**Command flow (`drwn apply`):**

1. Read project `card.lock`.
2. `cd store.git`. For each card, ensure submodule is at the pinned commit (`git submodule update --init`).
3. Materialize from submodule working trees (which are real files on disk, no extraction needed).

**`drwn publish` flow (for a card source you own):**

1. The card's source repo (e.g., `~/dev/baseline-card/`) is itself a Git repo.
2. `drwn card publish @me/baseline` from inside the card source: tags the current commit `v1.2.0`, pushes to the remote.
3. Optionally update the parent store.git to pin the new tag.

**Trade-offs:**

| Property | Status |
|---|---|
| User-facing surface change | medium — `drwn store` namespace becomes more prominent |
| Git visibility | hybrid-leaning-visible — submodule mechanics surface in advanced workflows |
| Distribution | Git-native (push/pull). Each card is independently distributable. |
| History/diff/log | excellent — per-card history + parent-repo history of pin changes |
| Disk efficiency | best — each submodule shares its own pack files; parent has near-zero overhead |
| Sharing one card | natural (it IS its own Git repo) |
| Submodule complexity | high — the user-visible mechanic IS submodules, with all their classic pain points (detached HEAD, init flow, recursive flags, remote re-fetch) |
| Migration from today | high effort — every card becomes its own repo; parent repo invented |
| Backward compat | partial — file layout changes; existing card-store paths break |
| Implementation effort | high — submodule plumbing, atomicity of multi-submodule updates, partial-clone considerations, sparse-checkout for performance |
| Match to user's stated vision | **highest** — this is literally what was described |

**Honest assessment:** This is the most ambitious option and the one closest to what Remy described. It is also the one most likely to bleed users at the corners because Git submodules are genuinely difficult to operate. The submodule pain points are well-documented:

- `git clone` of the parent doesn't fetch submodules by default; users must remember `--recurse-submodules`.
- After a `git pull` in the parent, submodules don't update automatically; must `git submodule update`.
- Submodule URLs are baked into `.gitmodules` and are awkward to retarget (e.g., for users behind corporate Git mirrors).
- `git submodule deinit` and `git rm` for a submodule are a multi-step dance.
- Sparse checkout across many submodules is hard.

These pain points would need to be **hidden behind `drwn` commands** for the model to be usable. That's the second-order implementation cost: `drwn` becomes a careful Git-submodule UX wrapper. Substantial work; not impossible.

If the user genuinely wants this design, the right path is to start with Design A (per-card Git repos, no submodule parent), use it for a while, then layer a submodule parent on top once the per-card Git plumbing is mature.

### 4.3 Design C — Monorepo store

**Positions:** D1.a · D2.c · D3.d · D4.b · D5.a · D6.d

**Idea.** One Git repo for everything: all cards from all scopes, all sources, all MCP definitions, all in a single tree. Versions tracked via prefixed tags (e.g., `card/@me/baseline/v1.2.0`). The single repo is the user's entire local cards-and-sources store.

**Storage layout:**

```text
~/.agents/drwn/store.git/
├── cards/
│   ├── @me/
│   │   ├── baseline/
│   │   │   ├── card.json
│   │   │   ├── skills/
│   │   │   └── mcp-servers/
│   │   └── helpers/
│   └── @team/
│       └── observability/
├── sources/
│   └── @me/baseline/                   # editable source for the same card
├── mcp-servers/
│   └── github.json
└── ...
```

**Tags:** `card/@me/baseline/v1.2.0`, `card/@team/observability/v2.0.3`, etc.

**Lockfile:** stores `storeRef` (parent commit) + per-card commit SHAs.

**Trade-offs:**

| Property | Status |
|---|---|
| Conceptual simplicity | highest — one repo |
| Disk efficiency | best — Git deduplication across every card |
| Sharing one card | painful — you'd push the whole monorepo |
| Multi-machine clone | one `git clone` does it all |
| Submodule complexity | zero |
| Lock contention on writes | possible — concurrent `drwn` operations contend on the single repo |
| Match to user's vision | weak — user explicitly said "submodule" |

**Honest assessment:** Conceptually clean but operationally bad for distribution. A monorepo locks every card into one history; you can't share a card without sharing the whole thing. This is the model `agents-skills` uses, and it works for `agentsync` because the catalog IS curated centrally. drwn's expected use case — multiple scopes, multiple teams, private and public cards mixed — is the opposite of curated centrally. Design C is wrong for drwn's distribution profile.

### 4.4 Design D — Scope repos

**Positions:** D1.c · D2.c · D3.d · D4.c · D5.b · D6.d

**Idea.** One Git repo per scope. `@me/*` cards live in `~/.agents/drwn/scopes/@me.git/`; `@team/*` cards live in `~/.agents/drwn/scopes/@team.git/`. Compromise between monorepo (C) and per-card (A) / submodule (B).

**Trade-offs:** Inherits some of C's lock contention and "share one = share all" issues, scoped to the scope rather than globally. Less common as an organizational pattern. The natural unit of sharing in OSS is usually the project (per-card) or the organization (per-scope), and drwn's scopes already encode "organization" — so this is plausible.

**Honest assessment:** A reasonable compromise but loses to A on sharing flexibility and to B on the user's stated vision. Not recommended as a starting point; could emerge as a v2.x evolution if scope-level sharing patterns prove common.

### 4.5 Design E — Cache-only, Git URLs as card refs

**Positions:** D1.e · D2.a · D3.d · D4.d · D5.b · D6.a

**Idea.** No central Git store on disk. Card refs include a Git URL: `git+https://github.com/me/baseline-card.git#v1.2.0` (npm-style). `drwn` resolves the ref, fetches the archive (via `git archive` or `https://.../archive/<ref>.zip`), extracts to a content-addressed cache, and materializes. No local Git operations between cache and store.

**Storage layout:**

```text
~/.agents/drwn/
├── cache/
│   ├── git-archives/                   # downloaded archives, content-addressed
│   │   └── <sha256>.tar.gz
│   ├── extracted/                      # extracted content, content-addressed
│   │   └── <sha256>/
│   └── refs.json                       # cache of url+ref → commit SHA mappings
├── sources/                            # editable sources (unchanged, may be Git repos individually)
└── ...
```

**Lockfile shape:**

```json
{
  "lockfileVersion": 2,
  "cards": [
    {
      "spec": "git+https://github.com/me/baseline-card.git#v1.2.0",
      "name": "@me/baseline",
      "version": "1.2.0",
      "origin": "git",
      "git": {
        "url": "https://github.com/me/baseline-card.git",
        "ref": "v1.2.0",
        "commit": "deadbeef1234..."
      },
      "integrity": "sha256-abc..."
    }
  ]
}
```

**Command flow (`drwn add git+https://github.com/me/baseline-card.git#v1.2.0`):**

1. Resolve ref to commit SHA (via `git ls-remote` or GitHub's API).
2. Download archive via `https://github.com/me/baseline-card.git/archive/deadbeef.tar.gz`.
3. Verify checksum; extract to `~/.agents/drwn/cache/extracted/<sha>/`.
4. Update lockfile.

**Command flow (`drwn apply`):**

1. Read lockfile; ensure every card's extracted SHA-directory exists; download+extract if not.
2. Materialize from extracted directories.

**Trade-offs:**

| Property | Status |
|---|---|
| User-facing surface change | small — add Git URL support to card refs |
| Git visibility | invisible-leaning-hybrid — no local Git store, but `git+` URLs are explicit |
| Distribution | Git-native, per-repo. Any Git host works. |
| History/diff/log | weak — to see history, user must clone the source repo themselves |
| Disk efficiency | weak — extracted content per version, no Git pack deduplication |
| Sharing one card | natural — share a Git URL |
| Submodule complexity | zero |
| Migration from today | low — additive (today's npm-based refs keep working) |
| Backward compat | full |
| Implementation effort | low-medium — mostly resolver + download logic |
| Match to user's vision | partial — user wanted under-the-hood Git, not just URLs |

**Honest assessment:** This is the agentsync-flavored design done rigorously (with lockfile + integrity). It's the lowest-cost way to get Git-as-distribution without rebuilding the local store. The downside is the user loses the "browse history" benefit because no local Git repo exists for the user to inspect. If history matters, this is the wrong design. If only distribution-without-npm matters, this is the right design.

---

## 5. Comparison Matrix

| Dimension | A (per-card) | B (submodule) | C (monorepo) | D (scope) | E (cache + Git URLs) | Today (no Git) |
|---|---|---|---|---|---|---|
| **Repo granularity** | per-card | submodule federation | single | per-scope | none local | none |
| **Versions in Git** | tags | tags (per submodule) | prefixed tags | prefixed tags | tags (remote) | n/a |
| **Distribution** | npm + planned push/pull | Git push/pull native | Git push (whole monorepo) | npm + Git per scope | Git URLs | npm + tarballs |
| **Disk efficiency** | medium | high | highest | high | low | low |
| **Sharing one card** | easy | easy | bad | medium | easy | medium (npm) |
| **History inspection** | yes (per card) | yes (per card + parent) | yes (whole repo) | yes (per scope) | weak (need to clone) | none built-in |
| **Submodule complexity** | none | high | none | none | none | n/a |
| **User exposure to Git** | hybrid | hybrid-visible | invisible | hybrid | invisible | n/a |
| **Materialization mechanism** | extract on add/apply | submodule worktree | extract on add/apply | extract | extract | already files |
| **Backward compat** | full (via extraction) | low (layout changes) | partial | partial | full (additive) | n/a |
| **Implementation effort** | medium | high | medium | medium | low-medium | n/a |
| **Match to user's vision** | partial | highest | weak | weak | partial | n/a |
| **Risk of operational footguns** | low | high (submodules) | medium (lock contention) | medium | low | low (today) |

---

## 6. Findings

1. **The cards model already delivers reproducibility.** Lockfile + sha256 integrity + immutable versioned directories already give drwn what Nix/Flox/pnpm get. Git as storage is **not load-bearing** for the reproducibility story. Its real value is elsewhere: history, distribution, deduplication, source/store unification.

2. **`agentsync`'s pattern is informative but shallow.** Its lack of lockfile and semver is a direct trade for simplicity. drwn cannot make that trade — and shouldn't, because the cards model is more rigorous and that rigor is part of the product's positioning (per `32_*` §6).

3. **Materialization is untouched.** Per `32_*` §5, the three downstream mechanisms (symlinks, `_drwn` meta-block, generated-file-plus-symlink) are forced by the consumer tools' read contracts. Git doesn't move that boundary. Whatever the storage backend, materialization extracts to a working tree and symlinks from there.

4. **Submodules are the user's stated direction but operationally costly.** Design B is closest to what Remy described, but submodules are well-known for surprising users with detached-HEAD states, recursive init/update flows, and `.gitmodules` retarget pain. Hiding them behind `drwn` commands is feasible but is itself a substantial implementation cost.

5. **Per-card Git repos (Design A) capture most of Git's benefits with the least operational risk.** History/diff/log per card, easy individual sharing, no submodule pain, smooth migration from today's directory layout. The upgrade path to Design B remains open if submodule federation becomes valuable later — the per-card repos are already there to submodule.

6. **Design E is the right choice if only distribution matters.** No local Git operations, no submodules, no migration cost. The user gives up history inspection (because there's no local Git repo to inspect). Worth knowing as the cheap fallback.

7. **A hybrid is possible.** Designs A and E are not mutually exclusive. drwn could keep a per-card Git store locally (Design A) while ALSO supporting `git+url` refs that download into the cache (Design E). The lockfile shape is similar enough that both can coexist behind one `origin` field.

8. **What this proposal actually solves vs. doesn't.** Solves: history inspection, optional Git distribution, source/store unification (with Design B). Doesn't solve: any v1 gap in cards' reproducibility, scattered-asset discovery (analysis 43's projects/scan story), the materialization complexity (3 mechanisms still required).

9. **Disk efficiency claim is overstated.** Cards aren't huge. A typical card is a few markdown files plus JSON; tens of KB. Multiple versions of "a few markdown files" don't need pack-file deduplication to fit comfortably. Disk efficiency is a real Git benefit, but for drwn it's marginal — not the headline.

10. **The "submodule" framing the user used is doing more work than it should.** Submodules suggest Design B, but per-card repos with a lockfile (Design A) achieve the same conceptual goal — "the parent state points at a specific version of each child" — without the submodule mechanics. The lockfile IS the parent-points-at-child mechanism, just in JSON instead of Git's `.gitmodules`+gitlink. For most user-facing semantics, this is indistinguishable. If the *mechanism* matters (e.g., "I want `git submodule status` to work"), then Design B; if only the *semantics* matter, Design A is enough.

---

## 7. Recommendation

### 7.1 Headline

**Start with Design A (conservative per-card Git repos), keep Design E (Git URL refs) available as a complementary distribution channel, and treat Design B (full submodule federation) as a v3+ option that becomes cheap once A is in place.**

### 7.2 Why

- Design A buys the user the **history/diff/log experience** they probably most want from Git, without paying the submodule operational tax.
- Design A is **a small layer over today's store**. The lockfile gains a `git.commit` field; the per-card directory becomes a Git bare repo; extraction is one extra step. Backward compatibility with existing card consumers is full.
- Design E **handles the distribution case** at near-zero cost. A card ref like `git+https://github.com/me/foo.git#v1.2.0` works alongside today's npm refs and tomorrow's `drwn store push` planned in `29_*`. It's the cheap path to "share a card without npm publishing."
- Design B can **be added later** without re-doing Design A. Per-card Git repos are exactly what a submodule architecture needs; adding a parent submodule registry is a strictly additive change.

### 7.3 What to defer

- **Don't do Design B first.** The submodule complexity is real, and Design A gives 80% of the benefit at 30% of the cost. Once Design A is shipped and the user has lived with it for a quarter, the question "do we need submodule federation?" becomes empirical instead of speculative.
- **Don't do Design C (monorepo) at all.** It's the wrong distribution profile for drwn.
- **Don't do Design D (scope repos) yet.** It might emerge later if scope-level sharing is a common ask, but it has no compelling case today.

### 7.4 What to NOT change

- The cards model (multi-card composition, last-wins merge).
- The lockfile contract (still semver + sha256 integrity; just adds optional Git fields).
- The materialization layer (three mechanisms unchanged).
- The vocabulary cleanup (`apply`/`use`/`add`/etc. per analysis 42 v2).
- The card source authoring CLI (`drwn card source ...` per task 41).

### 7.5 Risks under Design A

- **GC of unreferenced extracted SHAs.** With content-addressed extraction (D6.d), old extracts accumulate. Need a `drwn store gc` that walks all active lockfiles and removes extracted SHAs not referenced anywhere. (Manageable; standard cache-eviction pattern.)
- **Migration of existing card store.** Every current `~/.agents/drwn/cards/@scope/name/<version>/` directory becomes the initial commit + version tag in a new bare repo. A migration tool runs once; pre-published cards (none yet, per task 28 context) are unaffected.
- **Git as a runtime dependency.** Today drwn requires Bun; tomorrow it would also require Git. Most developer machines have Git already; this is a soft dep but worth flagging.
- **Bare repo operations from a Bun/TypeScript runtime.** drwn would need to either shell out to `git` (simple, portable) or use a Git library (control, but adds dependency). Recommend shell-out for v1; revisit if performance becomes an issue.

---

## 8. Hybrid v1: What Design A + Design E Together Looks Like

A unified picture if both Design A (local per-card Git store) and Design E (Git URLs as refs) ship together:

```text
~/.agents/drwn/
├── cards/                              # local Git store (Design A)
│   └── @me/baseline.git/               # bare per-card repo
├── extracted/                          # content cache for all extracted content
│   └── <sha>/                          # content-addressed
├── cache/                              # download cache for Git URL refs (Design E)
│   └── git-archives/
│       └── <sha>.tar.gz
├── sources/                            # editable card sources (unchanged from today)
├── mcp-servers/                        # MCP defs (unchanged from today)
├── machine.json
└── ...
```

**Card refs supported:**

- `@me/baseline@^1.0.0` — resolved via local store, npm fallback, or local source (today's behavior, plus per-card Git inside)
- `git+https://github.com/me/baseline-card.git#v1.2.0` — Git URL, fetched into cache, extracted
- `file:../path/to/card-source` — local source path (unchanged)

**Lockfile carries `origin` field naming which path was used:**

```json
{
  "spec": "...",
  "origin": "store" | "git" | "file" | "npm",
  "git": { "url": "...", "ref": "...", "commit": "..." },
  "integrity": "sha256-..."
}
```

This combination delivers:

- ✅ History inspection (`cd ~/.agents/drwn/cards/@me/baseline.git && git log`)
- ✅ Per-version diff (`git diff v1.0.0 v1.2.0`)
- ✅ Local card development (`drwn card source ...` unchanged)
- ✅ npm distribution (unchanged)
- ✅ Git distribution (`git+url` refs work, no central registry needed)
- ✅ Lockfile-pinned reproducibility (same lockfile + same store = same content)
- ✅ Backward compatibility (existing flows untouched)

Without paying for:

- ❌ Submodule mechanics in v1
- ❌ Monorepo lock contention
- ❌ Migration of card sources (they stay as plain directories or become Git repos opportunistically)

---

## 9. Comparison to Adjacent Tools

For sanity-check positioning, here's how Design A + E compares to the closest reference tools.

| Tool | Storage backend | Versioning | Distribution | Lockfile? |
|---|---|---|---|---|
| **agentsync** | none (cache) | none (HEAD only) | GitHub archive | no |
| **npm/pnpm** | content-addressed cache | semver | npm registry | yes |
| **uv** | content-addressed cache | semver | PyPI | yes |
| **Nix flakes** | `/nix/store/` (content-addressed) | Git refs in `flake.nix` | Git URLs | `flake.lock` (Git SHAs) |
| **Flox** | `/nix/store/` + manifest | semver-ish in `manifest.toml` | FloxHub or Git | `manifest.lock` |
| **direnv** | n/a | n/a | n/a | n/a |
| **drwn (today)** | versioned directories | semver tags | npm | `card.lock` (sha256) |
| **drwn (Design A + E)** | per-card Git bare repos + extraction cache | semver tags + Git commits | npm + Git URLs | `card.lock` (sha256 + Git SHA) |

The closest analog is **Nix flakes**: Git URLs as the canonical reference + a lockfile that pins exact commits. The drwn (Design A + E) row matches flakes' shape in the columns that matter, with the differences being:

- drwn keeps semver as the primary user-facing version concept (flakes are commit-first).
- drwn maintains a local Git store for history (flakes don't — `/nix/store/` is content-addressed but not Git).
- drwn's materialization is filesystem-symlink (8th layer, per `32_*`); flakes' is PATH (layer 4).

This positions drwn well: it inherits Nix flakes' best instincts (Git URLs, lockfile-pinned commits) while keeping cards' superior semver UX and the existing materialization mechanism.

---

## 10. Open Questions

1. **Should the local Git store be the primary, with npm/Git URL as import paths into it? Or should both be "first-class refs" without a privileged local form?**
   - Lean: primary local store. Imports normalize into the store. Single internal representation simplifies tooling.

2. **What's the GC trigger for `extracted/<sha>/`?**
   - Options: (a) explicit `drwn store gc`, (b) on every `drwn apply`, (c) on a schedule. Lean: (a) explicit, plus (b) opportunistic on apply if it's cheap.

3. **Should `drwn card source <name>` be optionally backed by a Git repo (allowing `git status` inside a source)?**
   - Lean: yes, opt-in via a `.git/` dir. Today's source authoring (task 41) doesn't require it.

4. **For Git URL refs, what's the discovery story?**
   - Cards via npm get a registry and search. Cards via Git URL have no registry. Discovery is "someone told me a URL." Acceptable for v1; future could add a community catalog (à la agents-skills).

5. **For private cards on Git remotes that need auth (SSH keys, HTTPS tokens), how does drwn handle credentials?**
   - Lean: defer to Git's own credential infrastructure. drwn shells out to `git` and inherits whatever the user already has set up.

6. **Should `card.lock` capture the URL or just the commit SHA?**
   - Both. URL for re-fetch on a fresh machine; SHA for integrity verification.

7. **What happens to `drwn card publish` under Design A + E?**
   - Local publish (commit + tag in the per-card bare repo) AND push to a remote if `--remote=<url>`.
   - npm publish remains a separate path for users who want the registry.

8. **Should the parent store.git of Design B be reserved for v2+?**
   - Yes — Design A's per-card repos make the eventual Design B trivially additive.

9. **Performance of `git archive` for cards with many small files?**
   - Probably fine. Cards are <1 MB typical. `git archive` overhead is sub-100ms. Not a hot path; only runs on `add`/`apply`/`update`.

10. **What about cards that have generated content (e.g., from scripts in `card source`)?**
    - Already handled by today's card-source publish flow. Git store backend doesn't change this — content gets committed at publish time, regardless of how it was produced.

---

## 11. Appendix

### A. `agentsync` deep dive — what we learned

`agentsync` is a Rust CLI that synchronizes AI agent configurations using symlinks (similar materialization as drwn). It installs skills from a separate `dallay/agents-skills` Git repo via deterministic GitHub archive download.

Architectural signatures:

- **Skill ID = `<owner>/<repo>/<skill-name>`.** Self-describing, no API needed.
- **Catalog metadata embedded in binary** via Rust `include_str!`. Catalog updates require CLI updates.
- **Install = download archive, extract subpath, symlink.** No Git operations on the client beyond the archive download.
- **No lockfile.** No reproducibility guarantee across time.
- **No per-skill semver.** HEAD is the only version.
- **Local override via env var** (`AGENTSYNC_LOCAL_SKILLS_REPO`). Nice dev affordance.

Lessons for drwn:

- Git-as-distribution works without a registry.
- Deterministic URL construction is cheap and avoids API surface.
- Local override env vars are worth borrowing.
- **drwn must NOT drop semver + lockfile to match agentsync's simplicity** — that simplicity is bought by giving up reproducibility, which drwn promises.

### B. Why not just use git refs in `cards[]` directly?

A user could ask: "Why not just put `git+https://github.com/me/foo.git#v1.2.0` in `cards[]` today, in the current store?" The answer is: **you can** under Design E, but only if drwn knows how to resolve Git URL refs. Today's `~/.agents/drwn/cards/@scope/name/<version>/` resolver doesn't speak Git URLs. Design E adds that. It's strictly additive on top of today's store.

### C. Why semver matters more than commit SHAs for users

Even though Git commits give exact pinning, users think in semver. "I want v1.x.y of @me/foo" is meaningful; "I want commit deadbeef of @me/foo" is not. The lockfile carries both (semver for human reference, SHA for verification), but the user-facing surface stays semver-first. This is why Design A/B/E all keep semver tags as the primary user identifier.

### D. Compatibility with the planned `drwn store push/pull` from `29_*` §13

The cards architecture v1.1 already planned a v2 push/pull command for the local store. Under Design A + E, `drwn store push <remote>` becomes natural:

- `drwn store push <remote>` — pushes the per-card bare repo to a remote
- `drwn store pull <remote>` — fetches updates and re-resolves lockfile

This was a v2+ feature anyway, and Design A makes it cheap.

### E. Risks I'm not addressing in this analysis

- **Hosting-vendor lock-in.** If users adopt `git+https://github.com/...#ref` refs, they implicitly depend on GitHub. Cards become harder to move to GitLab or self-hosted. Mitigation: drwn shouldn't bake any host-specific assumptions; the URL is data, not enum.
- **Long-tail Git host quirks.** Not every Git host supports `archive/<ref>.zip`; some have rate limits; some require auth even for read. These are real but solvable per-host.
- **Time-traveling cards.** A user pinned `git+url#abc123` two years ago. The repo has since been deleted. Now the card can't be re-resolved. Mitigation: bundle the extracted content in the project (committed alongside `card.lock`) — same problem npm has, same answer.
- **Submodule of submodules in Design B.** If a card itself references another card via submodule, you get nested submodule recursion. Submodules handle this in theory; in practice it gets ugly. Defer until Design B is actually attempted.

### F. Phasing — if all three designs eventually ship

Recommended order (each independently shippable):

1. **Phase 1 (Design E partially):** add `git+<url>#<ref>` resolver for card refs. Lockfile gains optional `git` block. No local Git store yet.
2. **Phase 2 (Design A):** introduce per-card bare repos at `~/.agents/drwn/cards/@scope/name.git/`. Migrate existing version directories. Add content-addressed extraction cache. Expose `drwn store gc`.
3. **Phase 3 (Design E full):** allow `git+url` refs to also be cached in per-card bare repos opportunistically (clone instead of download archive), unifying the two backends.
4. **Phase 4 (Design B, if/when needed):** add a parent store.git with submodule pointers. Migrate per-card repos into being submodules. Most invasive; only do if the use case is clear.

Each phase is independent; later phases don't require earlier ones (except Phase 4 building on Phase 2).

### G. What `drwn doctor` reports under Git backend

`drwn doctor` already reports stale symlinks, MCP drift, etc. Under Design A + E, it gains:

- **Missing extractions:** lockfile references SHA, extraction directory missing.
- **Stale extractions:** extracted directory exists but no lockfile references it (candidate for GC).
- **Git repo health:** `cd <bare repo> && git fsck` on each per-card repo (slow; opt-in via flag).
- **URL reachability:** for `git+url` refs, optionally verify the remote is still accessible.

### H. Decision Matrix — Cost vs Value

| Design | Implementation cost | History benefit | Distribution benefit | Disk efficiency | User complexity tax |
|---|---|---|---|---|---|
| A (per-card) | medium | high | medium (with `store push` v2) | medium | low |
| B (submodule federation) | high | highest | high | highest | high |
| C (monorepo) | medium | medium | low (whole-repo coupling) | highest | low |
| D (scope repos) | medium | medium | medium | high | medium |
| E (cache + Git URLs) | low | low | high | low | low |

The cost-value sweet spot is **A or E (or both)**. B is high-cost AND high-value; worth it only when the value is demonstrated empirically.
