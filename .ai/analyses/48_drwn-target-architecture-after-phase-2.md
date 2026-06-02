# drwn Target Architecture — After Phase 2 (Per-Card Bare Repos + Team Sharing)

> **⚠ SUPERSEDED on 2026-06-01** by **[analysis 52](52_drwn-target-architecture-post-wave-1.md)**, which collapses Phase 1 and Phase 2 into a single "Wave 1" target. The canonical end-state for Wave 1 is largely identical to what this doc described as "after Phase 2" — but with Phase 1's `~/.agents/drwn/cache/` layer eliminated entirely (never built). This doc remains as historical record. See analysis 52 §15 for the rationale.

**Date**: 2026-06-01
**Author**: Claude + Remy
**Status**: Draft
**References**: [analyses/47_drwn-target-architecture-after-phase-1.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, analyses/43_drwn-cli-target-architecture.md, analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, analyses/29_harness-cards-target-architecture-v1_1.md, cli/core/card-store.ts, cli/core/card-lock.ts, cli/commands/card/publish.ts]

---

## 1. Executive Summary

This document specifies the **target state of `drwn` after Phase 2** of the Git-distribution rollout. Phase 2 builds on Phase 1's Git URL refs by introducing **per-card local bare Git repositories** as the canonical storage backend (Design A from analysis `44_*`), wrapping the full team-sharing flow from analysis `46_*`, and adding catalog-based discovery.

**What Phase 2 adds:**

- **Per-card bare repos** at `~/.agents/drwn/cards/@scope/name.git/` replacing the per-version directory layout.
- **Content-addressed extraction cache** at `~/.agents/drwn/extracted/<tree-sha>/` shared across cards.
- **Migration tool** to convert existing `cards/@scope/name/<version>/` directories into bare repos.
- **Git-native `drwn card publish`**: source content → `git write-tree` → `git commit-tree` → tag.
- **Team-sharing commands**: `drwn card remote add/set/list/remove`, `drwn card push`, `drwn card fetch`, `drwn card clone`.
- **Catalog support**: `drwn library add catalog`, `drwn search card --scope`, scope-level discovery.
- **`drwn install` upgraded**: clones bare repos for missing cards from lockfile (instead of just downloading archives).
- **`drwn outdated --fetch`**: option to fetch remotes before listing outdated cards.
- **`drwn store gc`**: garbage-collect unreferenced extracted content.
- **History inspection**: `drwn card show` and `drwn card diff` use Git plumbing for real history and real diffs.

**What Phase 2 does NOT add** (deferred to Phase 3):

- Unification of Git-URL refs with the bare-repo store. In Phase 2, `git+url#ref` cards live in `cache/extracted/` (Phase 1 path) until explicitly imported into a local bare repo. Phase 3 routes Git URL refs through bare-repo clone instead.
- No registry service (catalog files are sufficient).
- No automatic dependency resolution across cards (bundles model from `29_*` is unchanged).

**Mental model after Phase 2:** Users still think in cards and semver. The local store *is* a collection of Git repos, but most interaction stays in `drwn`-land. Power users can `cd` into the bare repo and run Git directly. Authors get the full publish/push/fetch loop. Teams get catalog-based discovery. The materialization layer is unchanged.

---

## 2. Scope of Changes (Phase 2 vs Phase 1)

### 2.1 In scope for Phase 2

1. **Storage migration**: per-version dirs → per-card bare repos.
2. **Migration tool**: `drwn store migrate-to-git`.
3. **Content-addressed extraction**: shared cache keyed by Git tree SHA.
4. **Git plumbing wrapper**: `cli/core/git.ts` (new module) wrapping `Bun.spawn(["git", ...])`.
5. **Publish rewrite**: `drwn card publish` commits + tags into the bare repo.
6. **Remote management commands**: `drwn card remote add/set/list/remove`.
7. **Push command**: `drwn card push <name> [--remote <r>]`.
8. **Fetch command**: `drwn card fetch <name> [--remote <r>]`.
9. **Clone command**: `drwn card clone <url> [--as <name>]`.
10. **`drwn install` upgrade**: clones bare repos for missing cards.
11. **Catalog support**: `drwn library add/remove/list/refresh catalog`.
12. **Search by scope**: `drwn search card --scope @team`.
13. **History commands**: `drwn card show <ref>` with Git log, `drwn card diff <a> <b>` with Git diff.
14. **GC command**: `drwn store gc`.
15. **`drwn outdated --fetch`**: refresh remotes before reporting.
16. **Backward compat**: Lockfile v2 still works; existing tests still pass after migration.

### 2.2 Out of scope for Phase 2

- Unifying `cache/extracted/` (Phase 1 Git-URL cache) with `extracted/` (Phase 2 store extraction). Phase 3 does this.
- `drwn card fork` (composable from existing commands).
- `drwn card rename` (composable from `card source set --name` + publish).
- A registry service.
- Multi-machine sync via hosted service.
- Sparse-checkout optimizations.

### 2.3 Preserved invariants

All from Phase 1, plus:

- Lockfile schema v2 (refined slightly: see §6).
- Materialization mechanisms unchanged.
- Vocabulary cleanup intact.
- Card composition model intact.

---

## 3. Storage Layout — After Phase 2

### 3.1 Per-user store (`~/.agents/drwn/`)

```text
~/.agents/drwn/
├── store.json                       # store metadata; add Phase 2 version marker
├── machine.json                     # (unchanged)
├── cards/                           # CHANGED: now per-card bare repos
│   ├── @scope/
│   │   └── name.git/                # bare Git repo, NOT a working tree
│   │       ├── HEAD
│   │       ├── config               # contains [remote "origin"] etc.
│   │       ├── objects/             # Git object database
│   │       ├── refs/
│   │       │   ├── heads/main
│   │       │   └── tags/v1.0.0, v1.1.0, ...
│   │       └── packed-refs
│   └── name.git/                    # unscoped cards same shape
├── sources/                         # (unchanged) editable card sources
│   └── @scope/name/
├── extracted/                       # NEW: content-addressed extraction cache
│   └── <tree-sha>/                  # extracted content of a specific Git tree
│       ├── card.json
│       ├── skills/
│       └── mcp-servers/
├── cache/                           # NEW use: Phase 1's git-URL cache still lives here
│   ├── git-archives/                # Phase 1 archives; Phase 2 may also write here for non-bare-repo Git URLs
│   ├── extracted/                   # Phase 1's Git-URL extracted content
│   └── refs.json                    # ref → SHA TTL cache
├── catalogs/                        # NEW: cached catalog repos
│   └── <slugified-url>/             # shallow clone of each catalog
│       ├── catalog.json
│       └── .git/
├── catalogs.json                    # NEW: catalog index (urls + scopes)
├── mcp-servers/                     # (unchanged)
├── skills/                          # (unchanged)
├── generated/                       # (unchanged)
└── global-write-record.json         # (unchanged)
```

**Key changes from Phase 1:**

- `cards/@scope/name/<version>/` is gone (or migrated). Each card is now a bare Git repo.
- `extracted/<tree-sha>/` replaces the per-version content directories. Multiple cards or versions sharing identical content (same Git tree) extract once.
- `catalogs/` and `catalogs.json` are new.
- `cache/` from Phase 1 is preserved for git-URL cards that haven't been imported into bare repos yet (Phase 3 unifies this).

### 3.2 The bare repo's structure

A typical bare repo's `config` after `drwn card remote add @team/baseline https://github.com/team-org/baseline-card.git`:

```ini
[core]
    repositoryformatversion = 0
    filemode = true
    bare = true

[remote "origin"]
    url = https://github.com/team-org/baseline-card.git
    fetch = +refs/heads/*:refs/remotes/origin/*

[drwn]
    cardName = @team/baseline
```

The `[drwn]` section records drwn-side metadata directly in the Git config. This lets `git` operations work standalone (e.g., `cd cards/@team/baseline.git && git log v1.3.0`).

### 3.3 The extraction cache layout

```text
~/.agents/drwn/extracted/
├── abc123.../                       # Git tree SHA (40 chars)
│   ├── card.json
│   ├── skills/
│   │   ├── code-review/
│   │   └── error-explainer/
│   └── mcp-servers/
└── def456.../
    └── ...
```

Why tree SHA, not commit SHA: two commits with identical tree content (e.g., a no-op merge commit) share the same tree and thus the same extraction. Saves disk and dedupes cleanly.

### 3.4 Per-project store (unchanged from Phase 1)

```text
<project>/.agents/drwn/
├── config.json
├── card.lock                        # still v2; `path` now points into extracted/<tree-sha>/
├── write-record.json
├── skills/
└── presets/
```

The `path` field in `card.lock` continues to point at the **extracted content directory** (not the bare repo). For Phase 2 cards from bare repos, that's `~/.agents/drwn/extracted/<tree-sha>/`. The lockfile reader doesn't care how the content got there — just that it exists and matches the integrity hash.

---

## 4. Migration from Phase 1 (and from Phase 0 for users who skipped Phase 1)

### 4.1 What migrates

| Source | Target |
|---|---|
| `~/.agents/drwn/cards/@scope/name/<version>/` directory tree | `~/.agents/drwn/cards/@scope/name.git/` bare repo, with each version as a commit + tag |
| `cards/@scope/name/<version>/.integrity` file | Computed on demand by drwn from extracted tree |
| `cards/@scope/name/versions.json` index | Becomes `git tag --list` against the bare repo |
| Project lockfile entries with `origin: "store"` | Updated `path` field on next `drwn install` or `drwn apply` |

### 4.2 The migration command

```text
drwn store migrate-to-git [--dry-run] [--remove-old]
```

Algorithm:

```
For each card in ~/.agents/drwn/cards/:
  If it's already a `<name>.git/` bare repo: skip
  Otherwise (it's a per-version directory tree):
    Create temp bare repo `<name>.git.tmp/`
    Read all versions in chronological order (sort by published-at in versions.json, fall back to semver order)
    For each version:
      Create a Git tree from the version's directory contents
      Create a Git commit pointing at that tree, with parent = previous version's commit (or root if first)
      Tag the commit `v<version>` (annotated tag with metadata: publish date, integrity hash)
    Rename `<name>.git.tmp/` to `<name>.git/`
    If --remove-old: rm -rf the original `<name>/` directory tree
    Otherwise: rename to `<name>.legacy/` for safety
```

The `--dry-run` flag reports what would be migrated without actually doing it.

### 4.3 Migration is idempotent and resumable

If `drwn store migrate-to-git` is interrupted midway:

- Already-migrated cards (those that are bare repos) are skipped.
- Temp `<name>.git.tmp/` directories from prior runs are cleaned up.
- The original per-version trees (renamed to `<name>.legacy/`) are preserved until `--remove-old` is explicitly passed.

### 4.4 Lockfile updates after migration

On the first `drwn apply` or `drwn install` after migration:

- Existing lockfile entries with `origin: "store"` and `path: ~/.agents/drwn/cards/@scope/name/<version>/` are still readable.
- drwn detects the path no longer exists (it was migrated) and re-resolves: extracts the tagged version from the bare repo to `extracted/<tree-sha>/`, updates `card.lock` with the new `path`.
- Integrity hash is recomputed and compared against the lockfile's stored value. **Hash must match** — if it doesn't, the migration produced different content than the original, which is a bug; drwn errors out.

---

## 5. The Git Plumbing Layer

### 5.1 The wrapper module

A new module at `cli/core/git.ts` wraps all Git shell-outs. Every Git operation goes through this module; nothing else calls `Bun.spawn(["git", ...])` directly.

```typescript
// cli/core/git.ts (sketch)

export interface GitRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runGit(
  args: string[],
  options?: { cwd?: string; env?: Record<string, string>; stdin?: string }
): Promise<GitRunResult> { /* ... */ }

export async function lsRemote(url: string, ref?: string): Promise<Array<{ sha: string; ref: string }>>;
export async function initBare(path: string): Promise<void>;
export async function clone(url: string, targetPath: string, opts?: { bare?: boolean; depth?: number }): Promise<void>;
export async function fetch(repoPath: string, remote: string, refspec?: string[]): Promise<void>;
export async function push(repoPath: string, remote: string, refs: string[]): Promise<void>;
export async function archive(repoPath: string, ref: string, outputPath: string): Promise<void>;
export async function catFile(repoPath: string, sha: string): Promise<Buffer>;
export async function revParse(repoPath: string, ref: string): Promise<string>;
export async function tagList(repoPath: string): Promise<string[]>;
export async function createTag(repoPath: string, name: string, sha: string, message?: string): Promise<void>;
export async function writeTree(repoPath: string, sourceDir: string): Promise<string>;
export async function commitTree(repoPath: string, treeSha: string, parentSha: string | null, message: string): Promise<string>;
export async function updateRef(repoPath: string, ref: string, sha: string): Promise<void>;
export async function fsck(repoPath: string): Promise<void>;
export async function gc(repoPath: string, opts?: { aggressive?: boolean }): Promise<void>;
export async function remoteAdd(repoPath: string, name: string, url: string): Promise<void>;
export async function remoteSet(repoPath: string, name: string, url: string): Promise<void>;
export async function remoteList(repoPath: string): Promise<Array<{ name: string; url: string }>>;
export async function configSet(repoPath: string, key: string, value: string): Promise<void>;
export async function configGet(repoPath: string, key: string): Promise<string | null>;
```

All functions:

- Throw a typed `GitError` on non-zero exit, with `stderr` captured.
- Accept an optional `env` override for testing.
- Use `Bun.spawn` with piped stdio and explicit `await proc.exited`.

### 5.2 `writeTree` and `commitTree` for publishing

The publish flow uses Git plumbing to commit content into the bare repo without ever materializing a working tree:

```typescript
async function publishCardToBareRepo(
  bareRepoPath: string,
  sourceDir: string,
  version: string,
  parentCommitSha: string | null
): Promise<{ commit: string; tree: string }> {
  // Step 1: stage source content into a temporary index
  const tempIndexPath = await fs.mkdtemp(/* ... */);

  // git --git-dir=<bare>.git read-tree --empty
  // git --git-dir=<bare>.git --work-tree=<sourceDir> add -A
  // git --git-dir=<bare>.git write-tree
  const treeSha = await git.writeTreeFromDir(bareRepoPath, sourceDir);

  // Step 2: create commit object
  const message = `Publish ${manifest.name}@${version}\n\nintegrity: sha256-${integrity}`;
  const commitSha = await git.commitTree(bareRepoPath, treeSha, parentCommitSha, message);

  // Step 3: update main branch and create tag
  await git.updateRef(bareRepoPath, "refs/heads/main", commitSha);
  await git.createTag(bareRepoPath, `v${version}`, commitSha, `Release v${version}`);

  return { commit: commitSha, tree: treeSha };
}
```

### 5.3 Why shell-out, not a Git library

Per `46_*` §19.H, the choice is:

- Every developer machine has `git` already installed.
- `Bun.spawn` is fast enough for the cadence of Git operations drwn does (rarely more than once per second).
- A Git library (`isomorphic-git`, `nodegit`) adds bundle size and a second source of truth for Git behavior.
- Edge-case behavior (auth helpers, SSH, HTTPS tokens) is uniformly handled by `git` itself.

Phase 2 ships shell-out only.

---

## 6. Lockfile v2 — Refined for Phase 2

The lockfile schema from Phase 1 stands. Phase 2 refines two things:

### 6.1 `path` semantics

After Phase 2, `path` for `origin: "store"` cards points to `~/.agents/drwn/extracted/<tree-sha>/`, not `~/.agents/drwn/cards/@scope/name/<version>/`.

`drwn apply` and materialization read from `path`. If `path` doesn't exist, drwn re-extracts from the bare repo using the recorded `git.commit` (which is now present even for `origin: "store"` cards after migration).

### 6.2 `git.commit` is required for `origin: "store"` cards

Phase 1 only required `git.commit` for `origin: "git"`. Phase 2 stores `git.commit` for store-origin cards too, because the store IS Git:

```json
{
  "name": "@team/baseline",
  "version": "1.3.0",
  "origin": "store",
  "integrity": "sha256-abc...",
  "path": "/Users/me/.agents/drwn/extracted/<tree-sha>/",
  "git": {
    "commit": "deadbeef..."
  }
}
```

For `origin: "git"`, the full `git` block (url + ref + commit) is required. For `origin: "store"`, only `commit` is required; `url` and `ref` are absent (no remote configured, or configured separately in the bare repo's `config`).

### 6.3 Cache header

```json
{
  "lockfileVersion": 2,
  "store": {
    "minDrwnVersion": "0.5.0"
  },
  "cards": [ ... ]
}
```

The `store.minDrwnVersion` indicates the minimum drwn version expected to read this lockfile. Set on first Phase-2 write. Used to refuse downgrades cleanly.

---

## 7. Command Surface — After Phase 2

The full top-level CLI surface after Phase 2 lands. Phase-1-introduced commands are noted with `(P1)`; Phase 2 additions are noted with `(P2)`.

```text
# Initialization
drwn init [--non-interactive | --minimal | --force]

# Project composition (intent layer)
drwn use <card>...                              # set cards array
drwn add <card> | skill <name> | mcp <name>     # incremental
drwn remove <name>
drwn pin <card>[@version]
drwn clear                                       # empty cards[], keep overlay
drwn update [--fetch]                            # P2: --fetch refreshes remotes first
drwn outdated [--fetch]                          # P2: --fetch refreshes remotes first
drwn cards                                       # list project's cards

# Materialization
drwn apply [--dry-run | --target | --skills-only | --mcp-only | --force]

# Bootstrap (P1)
drwn install [--frozen] [--no-apply]             # P1; P2 upgraded to clone bare repos

# Diagnostics
drwn status [--json | --explain | --why <cat>:<name>]
drwn doctor [<scope>] [--json]                   # P2: optional --check-cards Git fsck

# Card-as-artifact (drwn card namespace)
drwn card list                                   # P0
drwn card show <ref>                             # P2: now includes Git log if available
drwn card diff <a> <b>                           # P2: now uses git diff
drwn card new <name> [--scope | --no-git]        # P0
drwn card source list | show | doctor | add-skill | remove-skill | set | add-mcp | remove-mcp  # P0
drwn card publish <name> [--bump <level> | --version <v>]  # P2: rewritten with Git plumbing
drwn card deprecate <ref>                        # P0
drwn card remote add <name> <url> [--name <r>]   # P2 NEW
drwn card remote remove <name> [--remote <r>]    # P2 NEW
drwn card remote list <name>                     # P2 NEW
drwn card remote set <name> <url>                # P2 NEW
drwn card push <name> [--remote <r>] [--tags-only]  # P2 NEW
drwn card fetch <name> [--remote <r>]            # P2 NEW
drwn card clone <url> [--as <name>]              # P2 NEW (alias for `library add card`)

# Presets (per 42_*)
drwn preset save | use | list | show | diff | delete | rename

# Profiles (per 42_*, C1 variant)
drwn profile save | use | list | show | diff | delete | rename | export | import

# Library (inventory)
drwn library list [skill | mcp | card | catalog]  # P2: includes `catalog`
drwn library show <id>
drwn library add skill <pkg-or-path>
drwn library add mcp <json> --as <id>
drwn library add card <url>                       # P2 NEW: same as `drwn card clone`
drwn library add catalog <url>                    # P2 NEW
drwn library remove catalog <scope-or-url>        # P2 NEW
drwn library refresh catalog [<scope>]            # P2 NEW
drwn library defaults add | remove skill <name>
drwn library defaults add | remove mcp <name>

# Skills (curation)
drwn skills enable <name>
drwn skills disable <name>
drwn skills list

# MCP
drwn mcp list
drwn mcp apply [--target | --dry-run]

# Extensions
drwn extensions list | show | status | doctor | setup

# Search & discovery
drwn search skill <query> [--library | --catalog]
drwn search mcp <query>
drwn search card <query> [--scope <s>] [--catalog]  # P2 NEW: searches by name across catalogs

# Store maintenance
drwn store status
drwn store migrate-to-git [--dry-run] [--remove-old]  # P2 NEW
drwn store gc [--dry-run]                              # P2 NEW
drwn store verify                                      # P2 NEW: re-check integrity of all cards
```

---

## 8. Author Workflow After Phase 2

The full flow from `46_*` §3 becomes available:

```bash
# One-time per card: configure remote
drwn card remote add @team/baseline https://github.com/team-org/baseline-card.git

# Edit source (existing task 41 surface)
$EDITOR ~/.agents/drwn/sources/@team/baseline/skills/code-review/SKILL.md

# Validate
drwn card source doctor @team/baseline

# Publish locally (commits + tags in bare repo, no remote interaction)
drwn card publish @team/baseline --bump minor

# Push to team remote
drwn card push @team/baseline
```

What `drwn card publish` does internally (Phase 2):

1. Resolve target version (per `--bump` or `--version`).
2. Read source content from `~/.agents/drwn/sources/@team/baseline/`.
3. Compute new integrity hash over normalized source.
4. Use `git write-tree` to create a tree object in the bare repo's object DB.
5. Use `git commit-tree` to create a commit (parent = previous commit on `main`).
6. Use `git update-ref` to advance `refs/heads/main`.
7. Use `git tag -a` to create annotated tag `v1.3.0`.
8. Extract the new tree into `~/.agents/drwn/extracted/<tree-sha>/` (so future `drwn apply` in any project that pins this version doesn't have to re-extract).
9. Update `versions.json` index (still used for fast version listing — derived from tags).

What `drwn card push` does:

1. Read configured remote URL from the bare repo's `[remote "origin"]` config.
2. Run `git push origin main v1.3.0` against the bare repo.
3. Report success or failure with friendly error messages.

---

## 9. Consumer Workflow After Phase 2

The full flow from `46_*` §4 becomes available:

```bash
# In a project that uses @team/baseline (which is in card.lock)
cd ~/dev/myproject

# Fetch new versions
drwn card fetch @team/baseline

# Or: refresh remotes globally before listing outdated
drwn outdated --fetch

# Adopt a newer version
drwn pin @team/baseline@1.3.0
drwn apply
```

For a teammate joining a project fresh:

```bash
git clone https://github.com/team-org/my-project.git
cd my-project
drwn install
# → reads card.lock
# → for each card with origin: "store" or "git":
#   → if bare repo not present in local store: `git clone --bare <url>` into ~/.agents/drwn/cards/@scope/name.git/
#   → `git fetch` if needed
#   → extract the pinned commit's tree to extracted/<tree-sha>/
# → run apply
```

---

## 10. Catalog Support

### 10.1 Adding a catalog

```bash
drwn library add catalog https://github.com/team-org/cards-catalog.git
```

What happens:

1. Shallow-clone the catalog repo into `~/.agents/drwn/catalogs/<slugified-url>/` (e.g., slugify `github.com/team-org/cards-catalog` → `github.com_team-org_cards-catalog`).
2. Read `catalog.json`.
3. Validate schema (`catalogVersion: 1`, well-formed entries).
4. Update `~/.agents/drwn/catalogs.json` with the entry: `{ url, scope, lastFetched }`.

### 10.2 Using a catalog for discovery

```bash
drwn search card --scope @team
# Reads all catalogs in catalogs.json that declare scope @team
# Returns matching cards with their URLs

drwn search card code-review
# Searches across all catalogs by name match in catalog entries

drwn library list catalog
# Shows configured catalogs
```

### 10.3 Refreshing a catalog

```bash
drwn library refresh catalog                 # all catalogs
drwn library refresh catalog @team           # one scope
```

Pulls latest commits from the catalog repo and re-validates `catalog.json`.

### 10.4 Catalog-driven add

A user can now add a card by name via the catalog:

```bash
drwn add baseline
# If `baseline` is unambiguous in known catalogs → uses the catalog-provided URL
# If multiple catalogs have `baseline` → asks for clarification
```

This is sugar over the explicit `drwn library add card <url>` flow.

---

## 11. Garbage Collection

### 11.1 What accumulates

- **Extracted trees** at `~/.agents/drwn/extracted/<tree-sha>/`: extracted for some past resolution; no longer referenced.
- **Phase 1 cache** at `~/.agents/drwn/cache/extracted/<commit-sha>/`: same idea, Phase 1 path.
- **Phase 1 archives** at `~/.agents/drwn/cache/git-archives/<commit-sha>.tar.gz`: downloaded archives.
- **Bare repos with no project referencing them**: cards installed once, project deleted, repo still around.

### 11.2 `drwn store gc`

```bash
drwn store gc [--dry-run]
```

Algorithm:

1. **Collect references.** Walk all known project lockfiles (machine-wide + project-local). For each card entry, collect the `git.commit` and `integrity` and `path`.
   - Question: how does drwn know all projects? Today, drwn doesn't track projects. **Use the tracked-projects registry from analysis 43** (`~/.agents/drwn/projects.json`). If that's not yet implemented, fall back to a CLI flag: `drwn store gc --projects <path1>:<path2>:...`.
2. **Mark live tree SHAs.** From each card's `git.commit`, derive the tree SHA (one `git cat-file commit <sha>` lookup) and add to a live set.
3. **Sweep extracted/.** For each `extracted/<tree-sha>/`, if not in the live set: remove.
4. **Sweep cache/.** For each `cache/extracted/<commit-sha>/` and `cache/git-archives/<commit-sha>.tar.gz`, if not in the live set: remove.
5. **Optional: prune bare repos.** Bare repos not referenced by any project AND not in any catalog: report; don't auto-remove (could be user-authored, awaiting consumers).

### 11.3 Why not auto-GC

`drwn store gc` is **explicit** — drwn doesn't run it on every `apply`. Reasons:

- Listing all project lockfiles is slow if the user has many projects.
- A user may have cards they're actively developing without any project referencing them yet.
- Bare repo pruning is destructive (removes Git history); should never be implicit.

A future enhancement: auto-detect garbage on `apply` and print a "you might want to run `drwn store gc`" hint when the cache exceeds a threshold (e.g., 1 GB).

---

## 12. History Inspection

### 12.1 `drwn card show <ref>`

After Phase 2:

```text
$ drwn card show @team/baseline@1.3.0

Card:     @team/baseline
Version:  1.3.0
Origin:   store (Git-backed)
Bare repo: ~/.agents/drwn/cards/@team/baseline.git
Remote:   https://github.com/team-org/baseline-card.git
Commit:   deadbeef1234... (full SHA: deadbeef1234567890...)
Tree:     abc123...

Manifest:
  name:        @team/baseline
  description: Team baseline harness
  skills:      [code-review, error-explainer, tracing-helper]
  servers:     [github, context7]
  extensions:  [parallel]

Recent history (last 5 versions):
  v1.3.0  2026-05-29  "Add tracing-helper skill"           Alice <alice@team.example>
  v1.2.0  2026-05-15  "Improve code-review prompts"        Bob <bob@team.example>
  v1.1.0  2026-04-22  "Add error-explainer skill"          Alice
  v1.0.0  2026-04-01  "Initial release"                    Bob

Use `drwn card diff @team/baseline@1.2.0 @team/baseline@1.3.0` to compare.
Use `cd ~/.agents/drwn/cards/@team/baseline.git && git log` for full history.
```

### 12.2 `drwn card diff <a> <b>`

```text
$ drwn card diff @team/baseline@1.2.0 @team/baseline@1.3.0

Manifest changes:
  + skills.include: +tracing-helper

Content changes (3 files):
  diff --git a/skills/code-review/SKILL.md b/skills/code-review/SKILL.md
  --- a/skills/code-review/SKILL.md
  +++ b/skills/code-review/SKILL.md
  @@ -10,7 +10,8 @@
   ...

  diff --git a/skills/tracing-helper/SKILL.md b/skills/tracing-helper/SKILL.md
  new file mode 100644
  ...
```

Phase 2 uses real `git diff` against the two tagged commits in the bare repo. No more manifest-only diff.

---

## 13. Error Handling Additions

### 13.1 Push failures

```
$ drwn card push @team/baseline
Error: Could not push @team/baseline to origin (https://github.com/team-org/baseline-card.git)

  Underlying error: Updates were rejected because the remote contains work that you do not have locally.

Hint: Someone else pushed first. Run `drwn card fetch @team/baseline` to bring in their changes,
then re-publish with a bumped version: `drwn card publish @team/baseline --bump patch`.
```

### 13.2 Fetch failures with auth

```
$ drwn card fetch @team/baseline
Error: Could not fetch @team/baseline from origin (https://github.com/team-org/baseline-card.git)

  Underlying error: remote: Repository not found.
                    fatal: Authentication failed

Hint: Verify you have read access. Configure HTTPS credentials with `git credential-manager`,
or use SSH: `drwn card remote set @team/baseline git@github.com:team-org/baseline-card.git`.
```

### 13.3 Integrity mismatch after migration

```
$ drwn apply
Error: Integrity mismatch for @team/baseline@1.2.0

  Expected: sha256-abc... (from card.lock)
  Got:      sha256-xyz... (from extracted content)
  Origin:   store (Git-backed, post-migration)

This could mean:
  - The migration from per-version directories to Git bare repos produced different content.
  - Re-run `drwn store verify` to confirm.
  - If the mismatch is intentional, re-pin: `drwn pin @team/baseline@1.2.0`.
```

---

## 14. Testing Strategy for Phase 2

### 14.1 Test scaffold updates

- `test/fixtures/scaffoldCliFixture` now creates a per-card-bare-repo store layout by default.
- A new `publishCardToBareRepo()` helper replaces direct directory copies.
- Local file:// remotes are used heavily for push/fetch tests.

### 14.2 New test files

| File | Coverage |
|---|---|
| `test/commands-card-remote.test.ts` | `drwn card remote add/list/set/remove` |
| `test/commands-card-push.test.ts` | `drwn card push` against local file:// remote |
| `test/commands-card-fetch.test.ts` | `drwn card fetch` brings in new tags |
| `test/commands-card-clone.test.ts` | `drwn card clone` bootstraps from URL |
| `test/commands-store-migrate.test.ts` | Migration from per-version → bare repo |
| `test/commands-store-gc.test.ts` | GC removes unreferenced extractions |
| `test/commands-library-catalog.test.ts` | Add/remove/refresh catalogs |
| `test/commands-search-card.test.ts` | Search across catalogs |
| `test/core-git.test.ts` | Git plumbing wrapper (writeTree, commitTree, etc.) |
| `test/scenarios-team-workflow.test.ts` | End-to-end: publish, push, fetch by teammate, install, apply |

### 14.3 Performance smoke tests

- `drwn install` on a project with 10 cards (file:// origins) completes in <5s on a typical dev machine.
- `drwn store gc` on a store with 100 bare repos completes in <10s.
- `drwn apply` is unchanged in performance (materialization is the same).

---

## 15. Open Questions for Phase 2

1. **Should `drwn card publish` push automatically with `--push`?**
   - Lean: opt-in flag, default off. Two-phase preserves the inspect-before-push gap.

2. **What's the default remote name?**
   - `origin`, matching Git convention. `drwn card remote add` without `--name` uses `origin`.

3. **Should `drwn install` recursively resolve bundle dependencies?**
   - Yes — bundles are part of the card model (`29_*`). Each bundle is itself a card. Recursive resolution is required for correctness.

4. **What happens if a card is migrated but no project references its old `versions.json` entries?**
   - The bare repo is created with all old versions as commits + tags. The old `versions.json` is preserved as a side-artifact at `cards/@scope/name.git/info/versions.json` for diagnostic purposes; not read by drwn.

5. **Should `drwn card publish` require the source to be Git-clean (no uncommitted changes in the source dir if it's also a Git repo)?**
   - No. Source dir is the editable working tree; its own Git state is independent. Publish snapshots whatever is in the source dir.

6. **What about cards published from a Git source dir that's behind upstream?**
   - drwn doesn't know about the source dir's Git remote. The source dir is just files. The bare repo is the canonical published version.

7. **Should `drwn outdated --fetch` parallelize fetches across cards?**
   - Yes for performance. Bound concurrency (e.g., 4 parallel fetches).

8. **Should the catalogs.json file itself be a Git repo for shareable team-side meta-configuration?**
   - Defer. v1 catalogs.json is a single local JSON file.

9. **What about the `~/.agents/drwn/cache/` from Phase 1 — is it still used in Phase 2?**
   - Yes, for cards added via `git+url#ref` that haven't been "imported" into a bare repo. Phase 3 unifies; Phase 2 leaves both paths active.

10. **How is the migration command exposed in the CLI surface?**
    - Under `drwn store migrate-to-git`. The `store` namespace is the right place for one-shot infrastructure operations.

---

## 16. What Phase 2 Enables

The team-sharing flow from `46_*` is fully usable. Concretely:

- A team can host one Git repo per card on their existing Git host.
- An author can `drwn card publish` + `drwn card push` to share improvements.
- Teammates can `drwn card fetch` + `drwn pin` + `drwn apply` to consume updates.
- New teammates can `git clone <project> && drwn install` to bootstrap.
- A scope catalog provides one-command discovery for all team cards.
- The local store dedupes content via tree-SHA-addressed extraction.
- `drwn store gc` reclaims disk.
- Power users can `cd ~/.agents/drwn/cards/@team/baseline.git && git log` for raw inspection.

The `drwn` surface now covers the full Git-backed cards workflow end-to-end.

---

## 17. What Phase 2 Still Doesn't Solve (Deferred to Phase 3)

- **Cards added via `git+url#ref` live in a separate cache** from the bare-repo store. They work, but they don't get the same `drwn card show`/`diff` Git-history treatment that store-origin cards do.
- **`drwn outdated --fetch` for `origin: git` cards** has to fetch each archive endpoint individually; no shared bare-repo means no `git fetch --tags` efficiency. (Phase 3 fixes this by cloning instead of downloading.)

These don't block the team workflow. They're polish items for Phase 3.

---

## 18. Appendix

### A. Files added/modified in Phase 2

| File | Change |
|---|---|
| `cli/core/git.ts` (NEW) | Git plumbing wrapper |
| `cli/core/card-store.ts` | Rewrite for bare-repo backend |
| `cli/core/store-paths.ts` | Add `resolveBareRepoPath`, `resolveExtractedPath` |
| `cli/core/card-lock.ts` | Refine v2 (path semantics, `git.commit` for store-origin) |
| `cli/core/card-catalog.ts` (NEW) | Catalog management |
| `cli/commands/card/publish.ts` | Rewrite to use Git plumbing |
| `cli/commands/card/remote.ts` (NEW) | `drwn card remote ...` |
| `cli/commands/card/push.ts` (NEW) | `drwn card push` |
| `cli/commands/card/fetch.ts` (NEW) | `drwn card fetch` |
| `cli/commands/card/clone.ts` (NEW) | `drwn card clone` |
| `cli/commands/card/show.ts` | Add Git log output |
| `cli/commands/card/diff.ts` | Use `git diff` |
| `cli/commands/install.ts` | Upgrade to clone bare repos |
| `cli/commands/store/migrate.ts` | `drwn store migrate-to-git` |
| `cli/commands/store/gc.ts` (NEW) | `drwn store gc` |
| `cli/commands/store/verify.ts` (NEW) | `drwn store verify` |
| `cli/commands/library/catalog.ts` (NEW) | Catalog subcommands |
| `cli/commands/library/add.ts` | Add `card`, `catalog` types |
| `cli/commands/search/card.ts` (NEW) | `drwn search card` |
| `cli/commands/outdated.ts` | Add `--fetch` flag |
| `cli/index.ts` | Register all new commands |
| `test/...` | ~10 new test files |

### B. Schema deltas

#### Lockfile v2 (Phase 2 refinement)

```typescript
interface CardLockEntry {
  // ... existing v2 fields from Phase 1 ...
  origin: "store" | "git" | "file" | "npm";
  git?: {
    url?: string;        // optional for origin: "store" (lives in bare repo config)
    ref?: string;        // optional
    commit: string;      // REQUIRED for origin: "store" and "git" after Phase 2
  };
}
```

#### Catalog format

```typescript
interface Catalog {
  catalogVersion: 1;
  scope: string;            // e.g., "@team"
  description?: string;
  cards: Array<{
    name: string;           // unscoped name (e.g., "baseline" — the scope is implicit)
    url: string;            // Git URL
    description?: string;
    tags?: string[];
  }>;
  maintainers?: Array<{ name: string; email?: string }>;
}
```

#### `~/.agents/drwn/catalogs.json`

```typescript
interface CatalogsIndex {
  catalogsVersion: 1;
  catalogs: Array<{
    url: string;
    scope: string;
    lastFetched: string;   // ISO 8601
    cardCount: number;
  }>;
}
```

### C. Decision rationale for keeping Phase 1's `cache/` directory

Phase 2 *could* migrate Phase 1's `cache/extracted/<commit-sha>/` content into the new `extracted/<tree-sha>/` layout (different key, same content). Decision: **don't migrate**. Two reasons:

1. `cache/` and `extracted/` use different keys (commit SHA vs tree SHA). Migration would require computing tree SHAs for each cached commit, then renaming. Risk of subtle bugs.
2. Phase 3 unifies them anyway by routing `git+url` refs through bare-repo clone. Migrating in Phase 2 only to re-organize in Phase 3 is wasted work.

Phase 2 leaves both paths active:
- `origin: "store"` → `~/.agents/drwn/extracted/<tree-sha>/`
- `origin: "git"` (still Phase 1 model) → `~/.agents/drwn/cache/extracted/<commit-sha>/`

Phase 3 collapses these by import-on-resolve.
