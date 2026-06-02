# drwn CLI Target Architecture — Post-Wave-1 (Canonical)

**Date**: 2026-06-01
**Author**: Claude + Remy
**Status**: Draft (canonical target — supersedes analyses 47, 48; partially supersedes 49 for the Phase-1-cache-migration portion)
**References**: [analyses/51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md, analyses/50_drwn-command-roles-across-git-rollout-phases.md, analyses/49_drwn-target-architecture-after-phase-3.md, analyses/48_drwn-target-architecture-after-phase-2.md, analyses/47_drwn-target-architecture-after-phase-1.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, analyses/43_drwn-cli-target-architecture.md, analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, analyses/32_harness-cards-vs-flox-and-conda.md, analyses/29_harness-cards-target-architecture-v1_1.md, cli/core/card-store.ts, cli/core/card-lock.ts, cli/core/store-paths.ts]

---

## 0. Document Status and Scope

This is the **canonical target architecture** for drwn after Wave 1 lands. It consolidates the earlier phase-specific target docs (47, 48, partial 49) into a single picture, removes the throwaway `cache/` archive path that the three-phase rollout would have built, and articulates the long-term architectural disciplines that carry forward into Wave 2 (capture flow + manifest fields) and beyond (Electron desktop app per backlog B4, library mode per B6).

**Superseded analyses:**

- `47_drwn-target-architecture-after-phase-1.md` — Phase 1's separate cache layer is eliminated. Mark superseded.
- `48_drwn-target-architecture-after-phase-2.md` — collapsed into this doc. Mark superseded.
- `49_drwn-target-architecture-after-phase-3.md` — the migration-of-Phase-1-cache portion no longer applies; the URL→name discovery and unified resolver are now part of Wave 1. The capture flow (R6) and manifest schema bumps (R12) remain as Wave 2 deliverables; analysis 49 stays as the Wave 2 spec with minor edits.

**Why one doc instead of three:** the three-phase rollout assumed iterative learning would inform Phase 2's design. In practice, Phase 2's design was already settled by analyses 44, 46, 48. Shipping Phase 1's cache infrastructure just to deprecate it in Phase 3 was throwaway scaffolding. The collapsed plan goes straight to the right end-state.

---

## 1. Executive Summary

Wave 1 lands the full Git-backed card distribution model: per-card bare repos, content-addressed extraction, team-sharing primitives (publish/push/fetch/clone/remote), catalogs with default community pre-registration, full author and consumer workflows, history affordances, and maintenance commands. Wave 2 is a smaller follow-up adding the capture-from-project flow (R6) and quality-signal manifest fields (R12).

**Five load-bearing decisions, recapped from prior analyses:**

1. **Git as the storage backend, per-card bare repos.** Selected from five options in analysis 44 (A through E); per-card bare repos are Design A. The local store at `~/.agents/drwn/cards/@scope/name.git/` is a Git bare repository per card; versions are tags; content is extracted to `~/.agents/drwn/extracted/<tree-sha>/` keyed by Git tree SHA. (Analysis 44 §4.1; analysis 48 §3.)

2. **Filesystem-as-API, CLI-as-kernel, no daemon.** The CLI is the source of truth for all mutations. The filesystem layout is a stable contract. Future UIs (Electron desktop app per backlog B4, library mode per B6) sit on top of the CLI without duplicating logic. Cross-process communication is filesystem state + JSON output, never sockets or pipes. (Analysis 50 §4; analysis 51 §6.)

3. **Two-phase intent → materialization.** Project composition verbs (`use`, `add`, `pin`, `remove`, `clear`) modify intent in `<project>/.agents/drwn/config.json` and `card.lock`. The materialization verb (`apply`) reads effective state and writes downstream tool config (`.claude/`, `.codex/`, `.cursor/`). The two phases are deliberately separate so users can dry-run, inspect, and freeze CI behavior. (Analysis 42 v2; analysis 50 §4.)

4. **Three materialization mechanisms.** Forced by the consumer-tool landscape (Claude Code, Codex, Cursor each have different config-read contracts). Symlinks for skills; `_drwn` meta-block for managed fields in user-edited settings files; generated-file-plus-symlink for Cursor's standalone JSON. (Analysis 32 §5.)

5. **Lockfile-pinned reproducibility.** Every card resolution pins both semver and Git commit SHA in `card.lock`. Same lockfile + same store → byte-identical effective state. Tag rewriting on remotes is detected by integrity mismatch. (Analysis 47 §4; analysis 29 §5.)

These five hold across Wave 1 and Wave 2 and constrain all future work. Any feature proposal must be checked against them (see §13 architectural discipline).

**What Wave 1 ships:**

- `cli/core/git.ts` — comprehensive Git plumbing wrapper.
- Per-card bare repos at `~/.agents/drwn/cards/@scope/name.git/`.
- Content-addressed extraction at `~/.agents/drwn/extracted/<tree-sha>/`.
- Lockfile v2 with origin field and Git metadata block.
- Migration tool `drwn store migrate-to-git` for the existing per-version layout.
- `drwn card publish` rewritten with Git plumbing.
- Team-sharing commands: `drwn card remote add/list/set/remove`, `drwn card push`, `drwn card fetch`, `drwn card clone`.
- `drwn install` — fetches missing cards from lockfile, then applies. New top-level verb.
- Card ref grammar: `@scope/name@<range>`, `file:./path`, `git+<url>#<ref>`, `git+<url>@<range>`, `github:owner/repo#<ref>`, `gitlab:owner/repo#<ref>`, and the @<range> variants of each.
- Origin-dispatching resolver with first-time URL→name discovery via shallow clone.
- Catalog support: `drwn library add/remove/list/refresh catalog`, with default community catalog pre-registration.
- `drwn search card --scope <s>` and name-based search across catalogs.
- History affordances: `drwn card show` with Git log, `drwn card diff` with real Git diff.
- `drwn card validate <ref>` for consumer-side validation.
- Maintenance: `drwn store gc`, `drwn store verify`, `drwn store export`, `DRWN_STORE_READONLY` env var.
- `drwn outdated --fetch` for remote-aware version checking.
- `writeAtomically()` utility consolidating the temp-then-rename pattern in `cli/core/fs.ts`.
- Companion PR: `darwinian-harness/validate-card-action` reusable GitHub Action.
- Docs: `drwn-card` GitHub topic convention, six-term vocabulary lockdown.

**What Wave 1 does NOT ship (deferred to Wave 2):**

- `drwn card new --from-project` capture flow (R6).
- Manifest schema v2 with `stability` / `lastValidatedWith` / `testStatusBadge` fields (R12).
- URL→name mapping cache file (small optimization; URL→name discovery itself is Wave 1).

**What's permanently out of scope** (per analysis 51 §5.4 + this document):

- Hosted registry service.
- User account system.
- Web-based publish flow.
- Rating/review system.
- TUI (replaced by Electron desktop app, backlog B4).

---

## 2. The Five-Layer Mental Model

Carried forward from analysis 43 §2, with the storage details updated for Wave 1.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 5 — Downstream                                                 │
│   ~/.claude/, ~/.codex/, ~/.cursor/                                  │
│   <project>/.claude/, <project>/.codex/, <project>/.cursor/          │
│   Materialized by `drwn write` — three mechanisms unchanged          │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ drwn write  (materialize Layer 4 → Layer 5)
                              │
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 4 — Curated                                                    │
│   Effective machine baseline (active skills, active MCP servers)     │
│   ~/.agents/skills/  (publication symlinks)                          │
│   ~/.agents/drwn/machine.json  (active config)                       │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ drwn skills enable / library defaults
                              │
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 3 — Project                                                    │
│   <project>/.agents/drwn/config.json   (cards + overlay declaration) │
│   <project>/.agents/drwn/card.lock     (v2, semver + git pinning)    │
│   <project>/.agents/drwn/skills/       (project-local skill content) │
│   <project>/.agents/drwn/presets/      (named project snapshots)     │
│   <project>/.agents/drwn/write-record.json                           │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ drwn use / add / pin / remove / clear / install
                              │
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 2 — Library                                                    │
│   ~/.agents/drwn/cards/@scope/name.git/   (per-card BARE REPOS)      │
│   ~/.agents/drwn/extracted/<tree-sha>/   (content-addressed extracts)│
│   ~/.agents/drwn/sources/@scope/name/    (editable card sources)     │
│   ~/.agents/drwn/skills/                 (package-backed bundles)    │
│   ~/.agents/drwn/mcp-servers/<id>.json   (MCP server defs)           │
│   ~/.agents/drwn/catalogs/<slug>/        (cached catalog repos)      │
│   ~/.agents/drwn/catalogs.json           (catalog index)             │
│   ~/.agents/drwn/profiles/<name>.json    (machine snapshots, per 42) │
│   ~/.agents/drwn/global-write-record.json                            │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ drwn library / drwn card source / drwn card publish
                              │
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 1 — Built-in                                                   │
│   <repo>/skills/shared/   (built-in shared skills)                   │
│   <repo>/registry/        (built-in MCP servers, extensions)         │
│   Distributed via npm package or checkout                            │
└──────────────────────────────────────────────────────────────────────┘
```

**Reading rules** (unchanged from `43_*` §2):

- Composition flows bottom-up: each higher layer is a function of lower layers plus its own state.
- Materialization flows top-down (Layer 4 → Layer 5) and never feeds back upward except via drift detection (`drwn doctor`).
- Cards in Layer 3 reference content in Layer 2. The project lockfile pins which Layer-2 content is bound.

**Key change from analysis 43 §2:** Layer 2's `cards/` is no longer per-version directories. It's per-card bare repos. Versions are tags. Content for materialization lives in `extracted/<tree-sha>/`. The `cache/` directory from the original Phase 1 design is gone — never built.

---

## 3. Storage Layout

### 3.0 A note on the store path

The store path is `~/.agents/drwn/`. The repo state has already moved here in commit `b1ec183` (May 2026, "move runtime state to drwn paths"). drwn is pre-public, so no external users have `~/.agents/bgng/` state to migrate. The Wave-1-era plan for an automated path migration helper (§11.5 below) was dropped on 2026-06-02 in favor of a hard cut: any pre-rebrand local store is renamed manually by its owner with `mv ~/.agents/bgng ~/.agents/drwn`.

For the rest of this document, all paths are expressed in `~/.agents/drwn/` form. §11.5 is preserved as historical context only.

### 3.1 Per-user store (`~/.agents/drwn/`)

```text
~/.agents/drwn/
├── store.json                       # store metadata + format version marker
├── machine.json                     # active machine-wide harness baseline
├── cards/                           # per-card BARE Git repositories
│   ├── @scope/
│   │   └── name.git/                # bare repo; objects/, refs/, config, HEAD
│   └── unscoped-name.git/
├── sources/                         # editable card sources (working trees, NOT Git-linked to bare repos)
│   ├── @scope/name/
│   │   ├── card.json
│   │   ├── skills/
│   │   └── mcp-servers/
│   └── unscoped-name/
├── extracted/                       # content-addressed extraction cache
│   └── <tree-sha>/                  # extracted Git tree contents
│       ├── card.json
│       ├── skills/
│       └── mcp-servers/
├── catalogs/                        # cached catalog repos (shallow clones)
│   └── <slugified-url>/             # full clone of one catalog
│       ├── catalog.json
│       └── .git/
├── catalogs.json                    # registered catalogs index
├── mcp-servers/                     # MCP server definitions (library)
│   └── <id>.json
├── skills/                          # package-backed skill bundles
│   └── @scope/pkg/<version>/
├── profiles/                        # named machine snapshots (per analysis 42)
│   ├── work.json
│   └── personal.json
├── generated/                       # downstream-generated files (e.g., cursor-mcp.json)
└── global-write-record.json         # tracks drwn-owned machine-scope materializations
```

**Notable absences:**

- No `cache/` directory. Phase 1's archive cache is never built.
- No `url-card-map.json`. URL→name discovery runs on-demand in Wave 1; the persistent mapping cache is a Wave 2 optimization.

### 3.2 Per-card bare repo structure

```text
~/.agents/drwn/cards/@scope/name.git/
├── HEAD                             # → refs/heads/main
├── config                           # [core], [remote "origin"], [drwn] sections
├── description
├── objects/                         # Git object database
│   ├── <hash-prefix>/<hash-rest>
│   └── pack/                        # pack files
├── refs/
│   ├── heads/main
│   └── tags/v1.0.0, v1.1.0, ...
└── packed-refs
```

`config` contains a `[drwn]` section with metadata drwn cares about:

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
    formatVersion = 1
```

The `[drwn]` section is drwn-owned metadata. Cleanly co-located with Git config; readable by anyone running `git -C cards/@team/baseline.git config drwn.cardName`.

### 3.3 Per-project state (`<project>/.agents/drwn/`)

```text
<project>/.agents/drwn/
├── config.json                      # cards array + overlay (declared intent)
├── card.lock                        # v2; resolved versions + integrity + git metadata
├── write-record.json                # drwn-owned materialized files for this project
├── skills/                          # project-local skill content (per analysis 43 §4.3)
│   └── <name>/SKILL.md + assets
└── presets/                         # named project snapshots (per analysis 42)
    └── <preset-name>.json
```

Unchanged from analysis 43 §4.7 + Phase 2's plan.

### 3.4 Extraction cache addressing

The `~/.agents/drwn/extracted/<tree-sha>/` directories are keyed by **Git tree SHA**, not commit SHA. Two reasons:

1. **Content deduplication.** If two commits have identical tree content (e.g., a no-op merge), they share the same extraction.
2. **Multiple-card content sharing.** If two unrelated cards happen to have identical content trees (rare but possible), they share extraction.

The lockfile records both the commit SHA (for human reference and remote re-fetch) and the resolved `path` (which always points into `extracted/<tree-sha>/`). The tree SHA isn't itself stored in the lockfile; it's derived from the commit on each resolution.

### 3.5 Why no Git working tree under `sources/`

A card source at `~/.agents/drwn/sources/@me/foo/` is a plain working directory, not a Git working tree of the bare repo at `cards/@me/foo.git/`. They're independent.

Why not unify them (Design B / submodule federation from analysis 44)?

- A unified source-and-repo would require the source to be a working tree of the bare repo. That's awkward because the bare repo's `main` reflects the **last published** content, while the source reflects **in-progress edits**. The two are inherently different states.
- The "snapshot source → publish" flow is cleaner when they're separate. `drwn card publish` reads the source's current state and writes-tree → commit-tree → tag in the bare repo. No need to manage working-tree vs index vs source consistency.
- A future Design B variant (submodule federation) is possible if Wave 1's per-card bare repos prove valuable enough to want a parent meta-repo over them. That'd be a backlog item, not Wave 1 work.

---

## 4. Lockfile v2 Schema (Full Specification)

The lockfile at `<project>/.agents/drwn/card.lock` carries the full pinning contract.

### 4.1 Schema

```typescript
interface CardLockfile {
  lockfileVersion: 2;
  store?: {
    minDrwnVersion?: string;        // semver; refuses downgrades
  };
  cards: CardLockEntry[];
}

interface CardLockEntry {
  // Identity
  name: string;                     // canonical card name, e.g., "@team/baseline"
  requested: string;                // original ref string, e.g., "git+github.com/team/baseline.git#v1.3.0"
  version: string;                  // resolved semver

  // Resolution metadata
  origin: "store" | "git" | "file" | "npm";

  // Location pointer (where to read content from for materialization)
  path: string;                     // absolute path; ALWAYS points into extracted/<tree-sha>/ except for `origin: "file"`

  // Integrity
  integrity: string;                // sha256-<hex>, computed over normalized extracted content

  // Git metadata (present when origin is "git" or "store"; both are Git-backed in Wave 1)
  git?: {
    url?: string;                   // remote URL (optional for "store" origin; required for "git")
    ref?: string;                   // human-readable ref (tag name) for diagnostics
    commit: string;                 // 40-char lowercase hex; the cryptographic pin
  };

  // Manifest snapshot (cached at resolution time)
  manifest: CardManifest;
  skills: string[];                 // from manifest.skills.include
  registry: null;                   // reserved for Wave 3+ (registry references)
}
```

### 4.2 Origin semantics (Wave 1 target)

| Origin | When used | path points to | git block |
|---|---|---|---|
| `store` | Card was published locally via `drwn card publish` (with optional remote configured) | `extracted/<tree-sha>/` | `git.commit` required; `git.url` and `git.ref` optional |
| `git` | Card was added via `git+url#ref` or shorthand `github:`/`gitlab:` | `extracted/<tree-sha>/` | `git.url`, `git.ref`, `git.commit` all required |
| `file` | Card was added via `file:./path` ref | resolved filesystem path | absent |
| `npm` | Reserved; not implemented in Wave 1 | TBD | absent |

The `store` vs `git` distinction reflects **provenance**: `store` cards may have been authored locally (no remote URL) or pulled from a remote (URL in `git.url`). `git` cards always have a URL — they were added via URL ref by the user.

In both cases, `path` points into the same `extracted/` cache. The materialization layer doesn't care about origin; it just reads `path`.

### 4.3 Lockfile v2 hard cut

Wave 1 uses `lockfileVersion: 2` only. There is no v1 read-compat shim. drwn is pre-public, so projects with pre-Wave-1 local lockfiles must regenerate them from the intended cards rather than rely on an automatic lockfile migration.

### 4.4 The `store.minDrwnVersion` field

Optional. Set when the writing drwn version introduces a non-back-compat behavior (e.g., a future v3 feature that v2-only drwn can't reproduce). Wave 1's lockfile writes don't set this; v2 is fully back-compat with v1 readers via shim.

### 4.5 Integrity verification

Two-stage:

1. **Git commit SHA** (in `git.commit`): cryptographic identifier of the source commit. Verified by checking that the commit exists in the bare repo (or on the remote for first-time resolves).
2. **Content sha256** (in `integrity`): computed by drwn over the normalized extracted content. Verified after extraction; mismatch raises an integrity error.

Both must pass for a card to be considered valid. A mismatch on integrity but not commit SHA usually indicates the extracted content was tampered with externally (rare); a mismatch on commit SHA usually indicates tag rewriting on the remote.

### 4.6 Sample lockfile

```json
{
  "lockfileVersion": 2,
  "store": {
    "minDrwnVersion": "1.0.0"
  },
  "cards": [
    {
      "name": "@team/baseline",
      "requested": "@team/baseline@^1.0.0",
      "version": "1.3.0",
      "origin": "store",
      "path": "/Users/alice/.agents/drwn/extracted/abc123def456789012345678901234567890abcd",
      "integrity": "sha256-abc123...",
      "git": {
        "url": "https://github.com/team-org/baseline-card.git",
        "ref": "v1.3.0",
        "commit": "deadbeef1234567890abcdef1234567890abcdef"
      },
      "manifest": { /* full card.json snapshot */ },
      "skills": ["code-review", "tracing-helper"],
      "registry": null
    },
    {
      "name": "@upstream/observability",
      "requested": "git+https://github.com/upstream/obs.git#v2.0.0",
      "version": "2.0.0",
      "origin": "git",
      "path": "/Users/alice/.agents/drwn/extracted/fedcba0987654321fedcba0987654321fedcba09",
      "integrity": "sha256-fed987...",
      "git": {
        "url": "https://github.com/upstream/obs.git",
        "ref": "v2.0.0",
        "commit": "1234567890abcdef1234567890abcdef12345678"
      },
      "manifest": { /* full card.json snapshot */ },
      "skills": ["tracing-helper"],
      "registry": null
    }
  ]
}
```

---

## 5. Card Manifest Schema

Unchanged in Wave 1 from current `card-manifest.ts`. Wave 2 (R12) adds optional `stability`, `lastValidatedWith`, `testStatusBadge` fields. No manifest version bump is required unless a future schema change becomes breaking.

```typescript
interface CardManifest {
  $schema?: string;                 // optional pointer to a published JSON Schema URL
  name: string;                     // @scope/name pattern or unscoped name
  version: string;                  // strict semver
  description?: string;
  license?: string;
  harness?: {
    minVersion?: string;            // minimum drwn version required
  };
  bundles?: Record<string, string>; // bundle deps (version ranges)
  skills?: {
    include?: string[];             // names of skills this card bundles
    exclude?: string[];             // NOT allowed (rejected by validation)
    shared?: string[];              // reserved for future use (rejected if non-empty in Wave 1)
  };
  servers?: Record<string, ServerOverride>;       // MCP server defs
  extensions?: Record<string, ProjectExtensionConfig>;
  targets?: Partial<Record<TargetName, { enabled: boolean }>>;
}
```

Validation rules (from `cli/core/card-manifest.ts`):

- Name pattern: `@[a-z0-9-]+/[a-z0-9-]+` (scoped) or `[a-z0-9-]+` (unscoped).
- Version: strict semver.
- `skills.exclude`: rejected (cards don't subtract from cards; only project overlays can exclude).
- `skills.shared`: must be empty array or absent in Wave 1 (reserved for future cross-card shared content).
- `bundles` values must be valid semver ranges.

Wave 2 adds:

```typescript
interface CardManifest /* extended */ {
  manifestVersion?: 1 | 2;          // default 1 if absent
  stability?: "experimental" | "stable" | "production";
  lastValidatedWith?: string;       // drwn semver
  testStatusBadge?: string;         // http(s) URL
}
```

These are optional; manifests without them continue to validate.

---

## 6. Catalog Schema

A catalog is a Git repo hosting a single `catalog.json` file. Wave 1's catalog format:

```typescript
interface CatalogManifest {
  catalogVersion: 1;
  scope: string;                    // e.g., "@team" or "@community"
  description?: string;
  homepage?: string;
  cards: Array<{
    name: string;                   // unscoped name (scope is implied from the catalog's scope field)
    url: string;                    // Git URL of the card source repo
    description?: string;
    tags?: string[];                // discovery hints
  }>;
  maintainers?: Array<{
    name: string;
    email?: string;
  }>;
}
```

A catalog repo is structured as:

```text
catalog-repo/
├── catalog.json
├── README.md                       # human-readable; not parsed by drwn
└── .github/workflows/validate.yml  # optional CI for the catalog itself
```

The default community catalog at `darwinian-harness/cards-catalog` ships with an initial `catalog.json` (empty `cards` array). It's pre-registered on `drwn init` unless `--no-default-catalogs` is passed.

### 6.1 Catalog registration index

`~/.agents/drwn/catalogs.json`:

```typescript
interface CatalogsIndex {
  catalogsVersion: 1;
  catalogs: Array<{
    url: string;                    // catalog repo URL
    scope: string;                  // from the catalog's manifest
    lastFetched: string;            // ISO 8601 timestamp
    cardCount: number;              // denormalized for fast `library list catalog`
  }>;
}
```

Each registered catalog has its content shallow-cloned into `~/.agents/drwn/catalogs/<slugified-url>/`.

### 6.2 Catalog operations

- `drwn library add catalog <url>` — clone shallow, parse manifest, validate, add to index.
- `drwn library refresh catalog [<scope>]` — `git fetch + git pull` on the catalog repo; re-validate.
- `drwn library remove catalog <scope-or-url>` — remove from index + delete cached clone.
- `drwn library list catalog` — list registered catalogs.
- `drwn search card --scope <scope>` — search across catalogs matching scope.
- `drwn search card <query>` — search by name across all catalogs.

---

## 7. The Complete Command Surface

After Wave 1, the CLI surface is comprehensive. Wave 2 adds capture through `drwn card new --from-project`, manifest field exposure in `card show`, and the persistent URL-to-name cache. Everything else is final.

### 7.1 Top-level project composition

```
drwn init [--non-interactive | --minimal | --force | --no-default-catalogs]
drwn use <card>...                              # set cards array (replace)
drwn add <card> | skill <name> | mcp <name>     # incremental
drwn remove <name>                              # remove from project
drwn pin <card>[@version]                       # upsert by name
drwn clear                                       # empty cards array, keep overlay
drwn update [--fetch]                           # re-resolve all cards
drwn outdated [--fetch] [--json]                # list outdated cards
drwn cards                                       # list this project's cards
```

### 7.2 Bootstrap and materialization

```
drwn install [--frozen] [--no-apply] [--json]   # fetch missing cards from lockfile + write unless --no-apply
drwn write [--dry-run | --target=... | --skills-only | --mcp-only | --force]
```

### 7.3 Status and diagnostics

```
drwn status [--json | --explain | --why <category>:<name>]
drwn doctor [<scope>] [--json]
```

### 7.4 Card-as-artifact namespace

```
drwn card list
drwn card show <ref>                            # includes Git log
drwn card diff <a> <b>                          # real git diff
drwn card new <name> [--scope | --no-git]       # Wave 2 adds --from-project
drwn card source list | show | doctor | add-skill | remove-skill | set | add-mcp | remove-mcp
drwn card publish <ref> [--bump <level> | --version <v>]
drwn card deprecate <ref>
drwn card validate <ref>                        # consumer-side validation (R5)
drwn card remote add <name> <url> [--name <r>]
drwn card remote remove <name> [--remote <r>]
drwn card remote list <name>
drwn card remote set <name> <url>
drwn card push <name> [--remote <r>] [--tags-only]
drwn card fetch <name> [--remote <r>]
drwn card clone <url> [--as <name>]
```

### 7.5 Presets and profiles (from analysis 42)

```
drwn preset save <name> [--overwrite]
drwn preset use <name> [--no-apply]
drwn preset list
drwn preset show <name>
drwn preset diff <name>
drwn preset delete <name>
drwn preset rename <old> <new>

drwn profile save <name> [--overwrite] [--description <text>]
drwn profile use <name>
drwn profile list
drwn profile show <name>
drwn profile diff <name>
drwn profile delete <name>
drwn profile rename <old> <new>
drwn profile export <name>
drwn profile import <file> [--as <name>]
```

### 7.6 Library inventory

```
drwn library list [skill | mcp | card | catalog]
drwn library show <id>
drwn library add skill <pkg-or-path>
drwn library add mcp <json> --as <id>
drwn library add card <url>                     # alias for drwn card clone
drwn library add catalog <url>
drwn library remove catalog <scope-or-url>
drwn library refresh catalog [<scope>]
drwn library defaults list
drwn library defaults add | remove skill <name>
drwn library defaults add | remove mcp <name>
```

### 7.7 Skills, MCP, Extensions, Search

```
drwn skills enable <name>
drwn skills disable <name>
drwn skills list

drwn mcp list
drwn mcp apply [--target=... | --dry-run]

drwn extensions list | show | status | doctor | setup

drwn search skill <query> [--library | --catalog]
drwn search mcp <query>
drwn search card <query> [--scope <s>]
```

### 7.8 Store maintenance

```
drwn store status
drwn store migrate-to-git [--dry-run] [--remove-old]
drwn store gc [--dry-run]
drwn store verify
drwn store export <output-dir> [--cards <name1>,<name2>]
```

### 7.9 Card ref grammar — every accepted form

```
@scope/name                          → store-origin, range *
@scope/name@1.0.0                    → store-origin, exact version
@scope/name@^1.0.0                   → store-origin, semver range
file:./path/to/source                → file-origin

git+https://host/path.git#v1.0.0     → git-origin, explicit ref
git+https://host/path.git@^1.0.0     → git-origin, semver range over tags
git+ssh://git@host/path.git#main     → git-origin, branch ref (rare; tag preferred)
git+file:///abs/path/repo.git#v1.0   → git-origin, local file:// repo (for tests)

github:owner/repo#v1.0.0             → shorthand for git+https://github.com/owner/repo.git#v1.0.0
github:owner/repo@^1.0.0              → shorthand with semver range
gitlab:owner/repo#v1.0.0             → shorthand for git+https://gitlab.com/owner/repo.git#v1.0.0
gitlab:owner/repo@^1.0.0              → shorthand with semver range
```

All forms result in canonical `origin` + lockfile metadata. The project config records the canonical name + version (or range), never the URL.

---

## 8. Resolver Architecture

### 8.1 Dispatch overview

```typescript
async function resolveCard(agentsDir: string, ref: string): Promise<ResolvedCard> {
  const parsed = parseCardRef(ref);
  switch (parsed.origin) {
    case "store": return resolveFromStore(agentsDir, parsed);
    case "file":  return resolveFromFile(parsed);
    case "git":   return resolveFromGit(agentsDir, parsed);
    case "npm":   throw new Error("npm origin not implemented in Wave 1");
  }
}
```

### 8.2 `resolveFromStore` (Wave 1: now bare-repo backed)

```typescript
async function resolveFromStore(
  agentsDir: string,
  parsed: ParsedCardRef,
): Promise<ResolvedCard> {
  const barePath = resolveCardBareRepoPath(agentsDir, parsed.name);
  if (!existsSync(barePath)) {
    throw new DrwnError("CARD_NOT_FOUND", `${parsed.name} not in local store`);
  }

  // Resolve range → tag → commit → tree
  const tags = await git.listTags(barePath);
  const targetVersion = semver.maxSatisfying(
    tags.filter(t => t.startsWith("v")).map(t => t.slice(1)),
    parsed.range,
  );
  if (!targetVersion) {
    throw new DrwnError("CARD_NO_MATCHING_VERSION", /* ... */);
  }
  const tag = `v${targetVersion}`;
  const commit = await git.revParse(barePath, tag);
  const treeSha = await git.getCommitTree(barePath, commit);

  // Ensure extracted
  const extractedDir = await ensureExtracted(agentsDir, barePath, treeSha);

  // Read manifest + integrity
  const manifest = await readManifestFromExtracted(extractedDir);
  const integrity = await computeCardIntegrity(extractedDir);

  return {
    name: manifest.name,
    requested: parsed.original,
    version: manifest.version,
    path: extractedDir,
    integrity,
    manifest,
    skills: manifest.skills?.include ?? [],
    registry: null,
    origin: "store",
    git: { commit },                  // URL/ref omitted for store origin
  };
}
```

### 8.3 `resolveFromGit` with first-time URL→name discovery

```typescript
async function resolveFromGit(
  agentsDir: string,
  parsed: ParsedCardRef,
): Promise<ResolvedCard> {
  const { gitUrl, gitRef, gitRange } = parsed;

  // Step 1: discover or look up the card name for this URL
  const cardName = await discoverCardNameForUrl(agentsDir, gitUrl);

  // Step 2: ensure a bare repo exists at cards/@scope/name.git/
  const barePath = resolveCardBareRepoPath(agentsDir, cardName);
  if (!existsSync(barePath)) {
    await git.cloneBare(gitUrl, barePath);
    await git.configSet(barePath, "drwn.cardName", cardName);
    await git.configSet(barePath, "drwn.formatVersion", "1");
  } else {
    // Verify origin URL matches; error on collision
    await assertOriginMatches(barePath, gitUrl);
  }

  // Step 3: resolve range or ref to commit SHA
  let commit: string;
  let resolvedRef: string;
  if (gitRange) {
    // Semver range over remote tags
    await git.fetch(barePath, "origin", ["--tags"]);
    const { tag, commit: c } = await resolveSemverRangeAgainstTags(barePath, gitRange);
    commit = c;
    resolvedRef = tag;
  } else if (gitRef) {
    // Explicit ref; fetch if not present locally
    try {
      commit = await git.revParse(barePath, gitRef);
    } catch {
      await git.fetch(barePath, "origin", [gitRef, `refs/tags/${gitRef}:refs/tags/${gitRef}`]);
      commit = await git.revParse(barePath, gitRef);
    }
    resolvedRef = gitRef;
  } else {
    throw new DrwnError("GIT_REF_REQUIRED", /* ... */);
  }

  // Step 4: get tree, extract, validate
  const treeSha = await git.getCommitTree(barePath, commit);
  const extractedDir = await ensureExtracted(agentsDir, barePath, treeSha);
  const manifest = await readManifestFromExtracted(extractedDir);
  const integrity = await computeCardIntegrity(extractedDir);

  return {
    name: manifest.name,
    requested: parsed.original,
    version: manifest.version,
    path: extractedDir,
    integrity,
    manifest,
    skills: manifest.skills?.include ?? [],
    registry: null,
    origin: "git",
    git: { url: gitUrl, ref: resolvedRef, commit },
  };
}
```

### 8.4 The `discoverCardNameForUrl` helper

```typescript
async function discoverCardNameForUrl(agentsDir: string, url: string): Promise<string> {
  // Wave 1: no persistent cache; discovery runs each time the URL is first seen.
  // Wave 2 may add ~/.agents/drwn/url-card-map.json for repeat lookups.

  // Shallow clone to a temp dir
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-discover-"));
  try {
    await git.cloneBare(url, tempDir, { depth: 1 });
    // Read card.json from HEAD via git show
    const manifestContent = await git.showBlob(tempDir, "HEAD:card.json");
    const manifest = JSON.parse(manifestContent);
    if (!manifest.name || typeof manifest.name !== "string") {
      throw new DrwnError("INVALID_CARD_REMOTE", `card.json at ${url} missing valid name`);
    }
    return manifest.name;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
```

**Performance note:** the shallow clone is a one-time cost on first encounter of a URL. Subsequent operations against the same URL hit the (now-present) bare repo at the canonical path. A persistent URL→name mapping cache (Wave 2 R-future) eliminates even this first-time cost for repeat installs across fresh machines.

### 8.5 Name collision handling

If `discoverCardNameForUrl` returns `@team/baseline`, and a bare repo already exists at `cards/@team/baseline.git/` whose `[remote "origin"]` URL is different from the URL being added, this is a name collision. drwn errors out with a clear message:

```text
Error: Card name collision

  Card @team/baseline is already in your local store, sourced from:
    https://github.com/team-org/baseline-card.git

  You're trying to add it from a different URL:
    https://github.com/forks-r-us/baseline-card.git

  These cannot coexist under the same name. Options:
    - Use `drwn card remote set @team/baseline <new-url>` to change the origin
    - Fork the upstream card under a different scope (e.g., @me/baseline)
    - Remove the existing card first: `drwn card remove @team/baseline` (also cleans up the bare repo)
```

---

## 9. Git Plumbing Layer

The `cli/core/git.ts` module wraps all Git shell-outs. Nothing else in the codebase calls `Bun.spawn(["git", ...])` directly.

### 9.1 Module surface

```typescript
// cli/core/git.ts

// Error types
export class GitError extends DrwnError { /* ... */ }
export class GitNetworkError extends GitError { /* ... */ }
export class GitAuthError extends GitError { /* ... */ }
export class GitRefNotFoundError extends GitError { /* ... */ }

// Generic runner
export interface GitRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
export async function runGit(args: string[], opts?: GitRunOpts): Promise<GitRunResult>;
export async function runInRepo(repoPath: string, args: string[], opts?: GitRunOpts): Promise<GitRunResult>;

// Remote operations
export async function lsRemote(url: string, refs?: string[]): Promise<Array<{ sha: string; ref: string }>>;
export async function cloneBare(url: string, targetPath: string, opts?: { depth?: number }): Promise<void>;
export async function fetch(repoPath: string, remote: string, refspecs?: string[]): Promise<void>;
export async function push(repoPath: string, remote: string, refs: string[]): Promise<void>;

// Repo initialization
export async function initBare(path: string): Promise<void>;

// Object plumbing
export async function revParse(repoPath: string, ref: string): Promise<string>;
export async function catFileType(repoPath: string, sha: string): Promise<string>;
export async function getCommitTree(repoPath: string, commitSha: string): Promise<string>;
export async function showBlob(repoPath: string, refColonPath: string): Promise<string>;

// Tree/commit creation (publish flow)
export async function writeTreeFromDir(repoPath: string, sourceDir: string): Promise<string>;
export async function commitTree(
  repoPath: string,
  treeSha: string,
  parentSha: string | null,
  message: string,
  author?: { name: string; email: string },
): Promise<string>;
export async function updateRef(repoPath: string, ref: string, sha: string): Promise<void>;

// Tags
export async function createAnnotatedTag(repoPath: string, tag: string, sha: string, message: string): Promise<void>;
export async function listTags(repoPath: string): Promise<string[]>;

// Extraction
export async function extractTreeToDir(repoPath: string, treeSha: string, targetDir: string): Promise<void>;

// Remote management
export async function remoteAdd(repoPath: string, name: string, url: string): Promise<void>;
export async function remoteSet(repoPath: string, name: string, url: string): Promise<void>;
export async function remoteRemove(repoPath: string, name: string): Promise<void>;
export async function remoteList(repoPath: string): Promise<Array<{ name: string; url: string }>>;

// Config
export async function configGet(repoPath: string, key: string): Promise<string | null>;
export async function configSet(repoPath: string, key: string, value: string): Promise<void>;

// Inspection
export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  subject: string;
  body: string;
}
export async function log(repoPath: string, opts?: { ref?: string; maxCount?: number }): Promise<GitCommitInfo[]>;
export async function diff(repoPath: string, refA: string, refB: string): Promise<string>;

// Health
export async function fsck(repoPath: string): Promise<void>;
export async function gc(repoPath: string, opts?: { aggressive?: boolean }): Promise<void>;
```

### 9.2 Implementation discipline

- **Always shell out via `runGit` or `runInRepo`.** Both use `Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })` and await exit.
- **All functions throw on non-zero exit code.** Error type matches the failure mode: `GitNetworkError`, `GitAuthError`, `GitRefNotFoundError`, or generic `GitError`.
- **Network operations honor a configurable timeout** via `DRWN_GIT_TIMEOUT_MS` env var (default 30 seconds).
- **`fetch` and `push` parse stderr** to classify errors and produce typed exceptions with actionable hints.
- **`writeTreeFromDir` uses a temp index file** to avoid touching the bare repo's actual index (bare repos don't have one anyway).

### 9.3 The publish plumbing flow

Replacing the current `cp()`-based `publishCard`:

```typescript
async function publishCardWithGit(
  agentsDir: string,
  cardName: string,
  sourceDir: string,
  targetVersion: string,
): Promise<{ commit: string; tree: string; integrity: string }> {
  const barePath = resolveCardBareRepoPath(agentsDir, cardName);
  if (!existsSync(barePath)) {
    await git.initBare(barePath);
    await git.configSet(barePath, "drwn.cardName", cardName);
    await git.configSet(barePath, "drwn.formatVersion", "1");
  }

  // Refuse duplicate version publish
  const existingTags = await git.listTags(barePath);
  if (existingTags.includes(`v${targetVersion}`)) {
    throw new DrwnError("CARD_VERSION_EXISTS", `${cardName}@${targetVersion} already published`);
  }

  // Update source's card.json to reflect the new version
  const manifest = await readSourceManifest(sourceDir);
  manifest.version = targetVersion;
  await writeAtomically(join(sourceDir, "card.json"), JSON.stringify(manifest, null, 2));

  // Compute integrity from source directly
  const integrity = await computeIntegrityOverDir(sourceDir);

  // Use temp index to stage the source
  const tempIndexPath = await mkdtemp(join(tmpdir(), "drwn-index-"));
  const env = { GIT_INDEX_FILE: join(tempIndexPath, "index") };

  // git --git-dir=<bare> --work-tree=<source> add -A
  await git.runInRepo(barePath, ["--work-tree", sourceDir, "add", "-A"], { env });

  // git --git-dir=<bare> write-tree
  const writeTreeResult = await git.runInRepo(barePath, ["write-tree"], { env });
  const treeSha = writeTreeResult.stdout.trim();

  // Determine parent commit (current main, if any)
  let parentSha: string | null = null;
  try {
    parentSha = await git.revParse(barePath, "refs/heads/main");
  } catch {
    // No main yet — first publish
  }

  // Create commit
  const commitMessage = `Publish ${cardName}@${targetVersion}\n\nintegrity: ${integrity}`;
  const commitSha = await git.commitTree(barePath, treeSha, parentSha, commitMessage);

  // Advance main + create annotated tag
  await git.updateRef(barePath, "refs/heads/main", commitSha);
  await git.createAnnotatedTag(barePath, `v${targetVersion}`, commitSha, `Release v${targetVersion}`);

  // Extract to content-addressed cache
  const extractedDir = resolveExtractedPath(agentsDir, treeSha);
  if (!existsSync(extractedDir)) {
    const tempExtract = `${extractedDir}.tmp.${randomId()}`;
    await git.extractTreeToDir(barePath, treeSha, tempExtract);
    await rename(tempExtract, extractedDir);
  }

  // Cleanup temp index
  await rm(tempIndexPath, { recursive: true });

  return { commit: commitSha, tree: treeSha, integrity };
}
```

This is the heart of the migration from `cp()` to Git plumbing: stage from source via temp index, write-tree, commit, tag, extract.

---

## 10. Materialization Pipeline

Unchanged from `32_*` §5. The three mechanisms are forced by the consumer-tool landscape, not aesthetic choice.

### 10.1 Mechanism 1: Directory symlinks for skills

```text
~/.agents/drwn/extracted/<tree-sha>/skills/<skill-name>/
                              ↑
                              │ (symlinked)
<project>/.claude/skills/<skill-name>
<project>/.codex/skills/<skill-name>
```

`drwn write` reads `path` from each lockfile entry, finds the skills the project's effective state includes, creates symlinks in the downstream tool dirs.

### 10.2 Mechanism 2: `_drwn` meta-block for managed fields

For `<project>/.claude/settings.json` and `<project>/.codex/config.toml`, drwn owns specific keys (`mcpServers`, `mcp_servers`) but the file as a whole is user-owned. drwn writes a `_drwn` meta-block alongside its managed keys to track ownership:

```json
{
  "_drwn": {
    "version": 1,
    "managedKeys": ["mcpServers"],
    "fieldHashes": { "mcpServers": "sha256-abc..." },
    "lastWriteAt": "2026-06-01T12:00:00Z"
  },
  "mcpServers": { /* drwn-owned */ },
  "model": "claude-opus-4-7" /* user-owned, preserved */
}
```

Read-modify-write flow: parse the file, extract the meta-block, verify managed-key hashes match (drift detection), regenerate managed keys from effective state, write back with meta-block updated.

### 10.3 Mechanism 3: Generated-file-plus-symlink for Cursor

```text
<project>/.agents/drwn/generated/cursor-mcp.json   # drwn-written
<project>/.cursor/mcp.json → ../.agents/drwn/generated/cursor-mcp.json
```

Cursor's `mcp.json` is drwn-owned entirely. drwn writes the generated form, then symlinks into Cursor's expected path.

### 10.4 Write records

Each materialization is recorded in:

- `<project>/.agents/drwn/write-record.json` (project-scope writes)
- `~/.agents/drwn/global-write-record.json` (machine-scope writes)

The write record tracks every drwn-owned path with its kind (`symlink`, `managed-fields`, `generated-symlink`) and target. On subsequent `drwn write`, the diff between desired and recorded determines:

- New paths to write
- Existing paths to leave alone
- drwn-owned paths to remove (no longer in desired state, owned by drwn → safe to remove)
- User-owned paths to leave alone with a warning

### 10.5 What changes in Wave 1 (and what doesn't)

**Changes:** the `path` field in lockfile entries now points into `extracted/<tree-sha>/` instead of `cards/<name>/<version>/`. The materialization layer reads `path` and processes it identically.

**Unchanged:** the three mechanisms, the write record format, the drift detection algorithm, the `_drwn` meta-block schema, the merge semantics for managed fields.

The materialization layer is shielded from the storage refactor by the lockfile's `path` field.

---

## 11. Migration from Pre-Wave-1

The existing local store (pre-Wave-1) has cards at `~/.agents/drwn/cards/<scope>/<name>/<version>/`. Migration converts these to per-card bare repos.

### 11.1 The `drwn store migrate-to-git` command

```text
drwn store migrate-to-git [--dry-run] [--remove-old] [--json]
```

Algorithm:

```
For each card directory at ~/.agents/drwn/cards/<scope>/<name>/:
  If it ends in `.git/`: already migrated, skip
  Otherwise:
    Enumerate versions (immediate subdirectories that match strict semver)
    Sort versions chronologically using publish-time from versions.json (fallback: semver order)

    Create temporary bare repo: <name>.git.tmp
    git init --bare <name>.git.tmp
    git config drwn.cardName <full-card-name>
    git config drwn.formatVersion 1

    parentCommit = null
    For each version v in sorted order:
      versionDir = <name>/<v>/
      Use temp index to stage versionDir into the bare repo
      treeSha = git write-tree (with temp index)
      commit message = "Publish <name>@<v>\n\nmigrated-from: <name>/<v>/\nintegrity: <recorded-integrity>"
      commitSha = git commit-tree <treeSha> -p <parentCommit> -m <message>
      git update-ref refs/heads/main <commitSha>
      git tag -a v<v> <commitSha> -m "Release v<v>"
      Extract treeSha to extracted/<treeSha>/
      Compute integrity from extracted/<treeSha>/
      Verify integrity matches the recorded integrity (from .integrity file or versions.json)
      If mismatch: error out, preserve everything as-is
      parentCommit = commitSha

    Atomic rename: <name>.git.tmp → <name>.git
    If --remove-old: rm -rf <name>/
    Otherwise: rename <name>/ → <name>.legacy/

For each project's card.lock:
  Mark for update (will happen on next `drwn write` or `drwn install`)
```

### 11.2 Lockfile re-resolution after migration

The migration does NOT directly update project lockfiles. Project lockfiles' `path` fields still point at the old `cards/<scope>/<name>/<version>/` paths after migration. The bridge:

- On next `drwn write` or `drwn install`, drwn detects that the recorded `path` doesn't exist anymore.
- Falls back to re-resolution: looks up the card by `name` + `version`, finds the bare repo, locates the version's commit, extracts to `extracted/<tree-sha>/`.
- Updates the lockfile entry with the new `path` and adds the `git.commit` field if absent.
- Materialization proceeds.

This means migration is **incremental from the lockfile's perspective**: each project's lockfile updates lazily, when the project next applies.

### 11.3 Migration safety properties

- **Idempotent:** running `drwn store migrate-to-git` twice produces no further changes (already-bare repos are skipped).
- **Resumable:** partial migrations (interrupted halfway) leave the old `<name>/` directory untouched and clean up the temp `.git.tmp` directory; rerun completes.
- **Integrity-preserving:** every migrated version has its extracted-content integrity verified against the original `.integrity` file. Mismatch aborts that card's migration.
- **Reversible:** without `--remove-old`, the original `<name>/` becomes `<name>.legacy/` and remains on disk. Rolling back is `mv <name>.legacy/ <name>/ && rm -rf <name>.git/`.

### 11.4 What about projects with pre-Wave-1 lockfiles?

drwn does not read `lockfileVersion: 1` files after Wave 1. Regenerate the lockfile by re-adding the project's intended cards and writing the resulting v2 lockfile.

### 11.5 Store-path rename: `~/.agents/bgng/` → `~/.agents/drwn/` (HISTORICAL — DROPPED 2026-06-02)

> **Status: DROPPED.** This section is preserved as historical context. The original plan called for runtime auto-migration helpers; the closeout decision on 2026-06-02 dropped this in favor of a hard cut. The repo state moved to `drwn/` paths in commit `b1ec183`; any pre-rebrand local store is renamed manually by its owner. No automatic helper exists in the codebase.

The rebrand commit `d761714` (May 2026) renamed the package and CLI binary but **deliberately preserved the runtime store directory** at `~/.agents/bgng/` to avoid breaking existing users mid-rebrand. Wave 1 finishes this deferred rename.

**Mechanism: auto-detect on first command invocation.**

At the start of every drwn command (via the `getContext()` helper), drwn checks the machine-scope and project-scope paths:

```typescript
// cli/core/store-paths.ts (Wave 1 addition)

export async function ensureStorePath(homeDir: string): Promise<void> {
  const newPath = join(homeDir, ".agents", "drwn");
  const oldPath = join(homeDir, ".agents", "bgng");
  if (existsSync(newPath)) return;                       // already migrated
  if (!existsSync(oldPath)) return;                       // first-time install; nothing to migrate
  // Old exists, new doesn't → rename
  await rename(oldPath, newPath);
  console.error(
    "drwn: migrated store path ~/.agents/bgng/ → ~/.agents/drwn/ (one-time; no data change)",
  );
}

export async function ensureProjectStorePath(projectRoot: string): Promise<void> {
  const newPath = join(projectRoot, ".agents", "drwn");
  const oldPath = join(projectRoot, ".agents", "bgng");
  if (existsSync(newPath)) return;
  if (!existsSync(oldPath)) return;
  await rename(oldPath, newPath);
  console.error(
    `drwn: migrated project store path ${oldPath} → ${newPath} (one-time; no data change)`,
  );
}
```

**Properties:**

- **Idempotent.** Running twice does nothing on the second pass.
- **Atomic.** A single `rename()` syscall; no half-state possible.
- **No data change.** Only the parent directory is renamed; all contents preserved bit-for-bit.
- **Transparent.** User sees a one-line stderr notice on the first migration; subsequent commands are silent.
- **Safe.** If both `bgng/` and `drwn/` exist (edge case — manual creation, or partial restore), drwn errors out asking the user to resolve manually rather than risking data loss.

**Per-project rename runs lazily.** Every command that enters a project context (`drwn apply`, `drwn install`, `drwn use`, `drwn add`, etc.) calls `ensureProjectStorePath(projectRoot)` before reading project state. New projects use `~/.agents/drwn/` directly.

**Relation to the Git layout migration:** the path rename runs first (transparent to the user), and only after the path is `~/.agents/drwn/` does `drwn store migrate-to-git` operate on the contents. The two migrations are orthogonal: path rename is a directory `mv`; Git layout migration is a content transformation.

**What's NOT renamed (intentionally):** the GitHub repo URL `github.com/remyjkim/beginning-harness` is preserved per task 28's deferral. That's a separate operator action (GitHub UI rename) coordinated with this codebase's URL update; not in Wave 1's scope.

---

## 12. CLI-as-Kernel Architectural Discipline

The long-term framing for the CLI tooling: drwn CLI is a headless kernel. Future UIs (Electron app per backlog B4, library mode per B6, possibly IDE extensions or web dashboards) sit on top without duplicating logic.

This discipline shapes Wave 1's code organization and informs what's preserved going forward.

### 12.1 Filesystem layout is a stable contract

`~/.agents/drwn/` and `<project>/.agents/drwn/` are public APIs. The directory tree, file names, and file format schemas are committed contracts. Changes require deliberate migration tooling.

What this means in Wave 1:

- The store layout from §3 is the contract.
- Lockfile v2 schema from §4 is the contract.
- Catalog schema from §6 is the contract.
- Manifest schema from §5 is the contract (with Wave 2 adding optional fields, not changing required ones).

External consumers (the eventual Electron app, library mode, future tools) can rely on these.

### 12.2 JSON output is universal and stable

The investigation confirmed all 20 inspection commands already support `--json`. Wave 1 maintains this discipline:

- Every command that surfaces state has `--json`.
- JSON output schemas are stable across patch versions.
- Error JSON includes `code`, `message`, and optional `hints`.

A future Electron app parses these JSON outputs. Stability of the schemas matters more than stability of the human-readable output.

### 12.3 Mutations are atomic

Every write goes through atomic temp-then-rename. Investigation found this discipline missing in `cli/core/card-store.ts` and `cli/core/migration.ts` — both use naive `writeFile` patterns. Wave 1 introduces `writeAtomically()` in `cli/core/fs.ts` and refactors callers.

```typescript
// cli/core/fs.ts (Wave 1 addition)
export async function writeAtomically(targetPath: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp.${randomId()}`;
  await writeFile(tempPath, content);
  await rename(tempPath, targetPath);
}
```

This is invoked for every state file: lockfile, project config, machine.json, catalogs.json, write records, the `_drwn` meta-block.

### 12.4 No daemon, no IPC

drwn is a one-shot CLI. There's no background process, no socket, no shared state in memory across invocations.

This is deliberate. A daemon would require:

- Lifecycle management (start, stop, restart, recover from crashes)
- IPC protocol design
- Concurrency control (file locking, lock coordination)
- Persistent state in addition to filesystem state

None of these are needed for drwn's workload. Every operation is filesystem-fast (sub-second for typical projects); spawning a CLI invocation per operation is acceptable overhead.

A future Electron desktop app reads filesystem state directly and shells out to the CLI for mutations. No daemon required.

### 12.5 `cli/core/*` stays import-clean

The investigation confirmed `cli/core/*` has zero Clipanion imports and zero `process.exit` calls. Wave 1 maintains this:

- All Clipanion code lives in `cli/commands/*` and `cli/index.ts`.
- All `process.exit` calls live in `cli/commands/*` and `cli/index.ts`.
- `cli/core/*` modules throw errors; commands catch and translate to exit codes.

This makes library mode (backlog B6) viable without future refactoring. A user could `import { resolveCard, applyMaterialization } from "darwinian-harness-core"` and use drwn's logic without invoking the CLI.

### 12.6 Schema stability discipline

Every schema (lockfile, manifest, catalog, store) is:

- Documented with a `$schema` URL pointing at a published JSON Schema.
- Versioned with a `<name>Version` field.
- Backward-readable for at least one major version after introduction of a new version.

When a schema changes:

1. The new version increments the schema field.
2. A read-compat shim handles the old version.
3. Migration is lazy on next mutation (no big-bang migration tool unless absolutely necessary).

Wave 1's lockfile bump from v1 to v2 follows this discipline. Future schema work follows it too.

### 12.7 Typed errors (Wave 1 introduces; B5 generalizes)

Wave 1 introduces typed errors:

- `DrwnError` (base class)
- `GitError`, `GitNetworkError`, `GitAuthError`, `GitRefNotFoundError`
- `IntegrityError`
- `CardNotFoundError`, `CardVersionExistsError`
- `MigrationError`

Each carries:

- `code: string` — stable identifier for error type
- `message: string` — human-readable
- `cause?: unknown` — underlying error if wrapping
- `hints?: string[]` — actionable suggestions

JSON output includes structured error details:

```json
{
  "ok": false,
  "error": {
    "code": "GIT_AUTH_FAILED",
    "message": "Could not authenticate to https://github.com/team-org/baseline-card.git",
    "hints": [
      "Verify GitHub credentials are configured for this remote",
      "See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
    ]
  }
}
```

A future Electron app dispatches on `code`; CI consumers can detect specific failures.

The full typed error system (every throw site classified, comprehensive code catalog) is backlog item B5. Wave 1 establishes the pattern; subsequent work refines it.

---

## 13. Architectural Discipline Summary (Carry-Forward Rules)

These principles carry forward through all post-Wave-1 work:

| Principle | What it means | Enforced by |
|---|---|---|
| **Filesystem-as-API** | Store layout, schemas, formats are stable contracts | This document; future analysis docs |
| **CLI-as-kernel** | The CLI is the source of truth; no daemon | Code review |
| **Atomic writes** | Every mutation uses temp + rename | `writeAtomically()` helper, code review |
| **JSON output stability** | Every command has stable `--json` | Tests, code review |
| **No state duplication** | UIs read filesystem + parse CLI JSON, never re-implement | Architecture review for new UIs |
| **`cli/core/*` import-clean** | No Clipanion, no `process.exit` in core | Linting, code review |
| **Schema versioning** | All schemas have version fields and read-compat shims | Schema design discipline |
| **Typed errors** | Errors carry stable `code` field | `DrwnError` hierarchy, code review |
| **Vocabulary discipline** | Six public-facing terms; no jargon proliferation | Doc review |

When a future feature proposal arrives, it's evaluated against these. A proposal that breaks any (e.g., introduces a daemon, weakens lockfile pinning, duplicates state) requires explicit justification.

---

## 14. Vocabulary (Locked Terms)

Per analysis 50 + 51, the public-facing CLI vocabulary is locked to six terms:

| Term | Definition | When users encounter it |
|---|---|---|
| **Card** | A bundle of harness intent (skills, MCP servers, extensions) authored by someone and shareable | Every interaction with cards |
| **Store** | The local cache of cards on the user's machine (`~/.agents/drwn/`) | When learning about caching, GC, offline use |
| **Catalog** | A Git repo listing cards in a scope (discovery layer) | When discovering new cards |
| **Project** | A working directory with a drwn configuration | Daily use |
| **Apply** | The verb that materializes the project's harness into downstream tool config | Daily use |
| **Install** | The verb that fetches missing cards and applies (bootstrap) | After fresh project clone |

Deeper terms (manifest, lockfile, source, preset, profile, write-record, machine.json, integrity, origin, scope, overlay) are internal vocabulary — they appear in deeper docs and error messages but not in beginner-facing tutorials.

---

## 15. Phase Map: How We Got Here

Historical context. Not load-bearing but useful for readers tracing the design evolution.

### Original phasing (analysis 44 §11.F, three phases):

- **Phase 1 (Design E partial):** Git URL refs with HTTP archive download, separate `cache/` directory, basic `drwn install`.
- **Phase 2 (Design A):** Per-card bare repos, content-addressed extraction, team-sharing primitives, catalogs.
- **Phase 3 (Design E full):** Unify the `cache/` (Phase 1) with the bare-repo store (Phase 2). Migrate `cache/` content into the unified model.

### Why the original phasing existed (analysis 44 + 47 + 48 + 49):

The framing was "incremental risk reduction": ship Phase 1, learn from production use, then ship Phase 2 informed by those learnings.

### Why we collapsed (this document):

The learning-from-production framing assumed an active user base testing Phase 1. drwn is pre-public; the only user is Remy. The "learnings" from Phase 1 would be self-feedback. Meanwhile, Phase 1's `cache/` infrastructure is throwaway — Phase 3 explicitly migrates it into the bare-repo model.

Skipping Phase 1's `cache/` saves:

- ~1 PR worth of work building cache infrastructure
- ~1 PR worth of work migrating it away (the Phase 3 cache→bare-repo migration)
- Conceptual complexity (the "wait, is this card in cache or in bare repos?" mental load during Phase 2)
- Throwaway documentation (analysis 47, parts of 49)

### The collapsed phasing (this document):

- **Wave 1 (this target):** everything from original Phases 1 + 2, minus the `cache/` infrastructure. Goes straight to bare repos. The runtime store-path was moved by commit `b1ec183` ahead of Wave 1; the planned auto-migration helper from §11.5 was dropped in favor of a manual `mv` since drwn is pre-public.
- **Wave 2 (analysis 49 reduced):** R6 capture flow + R12 manifest fields + URL→name persistent cache.

The end state is identical to the original three-phase end state. The path is shorter.

---

## 16. What's Deferred to Wave 2

Three items remain for Wave 2 (covered in analysis 49 reduced + tasks future):

### 16.1 R6 — `drwn card new --from-project` capture flow

The flywheel entry point per analysis 51 §3.6. Lets a user snapshot their current working harness as a self-contained card source, ready to publish. Most users won't author cards from scratch; they'll capture what they already have.

Why deferred: Wave 1 establishes the bare-repo store and publish flow. With those in place, the capture flow becomes a small additive feature (~2 sessions). Shipping it in Wave 1 would bloat an already-large PR.

### 16.2 R12 — Manifest schema v2 with quality signals

Optional `stability`, `lastValidatedWith`, `testStatusBadge` fields. Useful for ecosystem quality signaling (per analysis 51 §4.3).

Why deferred: not architecturally load-bearing. A schema bump with read-compat is the same complexity in Wave 1 or Wave 2; the benefit is small enough to wait.

### 16.3 Persistent URL→name mapping cache

`~/.agents/drwn/url-card-map.json` records discovered URL → cardName mappings. First-time resolution does a shallow clone to read `card.json`; subsequent resolutions hit the cache.

Why deferred: Wave 1's on-demand discovery is correct but slightly slow on first-time `drwn install` against a fresh machine. The cache is a performance optimization, not a correctness requirement. Wave 2 introduces it.

---

## 17. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Migration tool corrupts existing card content | Per-version integrity verification (§11); preserves `<name>.legacy/` until `--remove-old` |
| Wave 1 PR is too large to review | Sub-phase commits in chronological order; reviewer walks the chain |
| Bare-repo per-card creates filesystem clutter | Per-card directories are well-organized at `cards/@scope/name.git/`; no worse than per-version dirs |
| `git ls-remote` / `git clone` against slow/unreachable hosts blocks | 30s default timeout (`DRWN_GIT_TIMEOUT_MS`); typed `GitNetworkError` with hints |
| Auth varies across hosts | drwn defers to Git's credential helpers; typed `GitAuthError` with platform-specific hints |
| Tag rewriting on remote breaks integrity | SHA-pinned lockfile detects; `drwn install` errors out clearly |
| Concurrent publish on `main` causes non-fast-forward push | Standard Git collaboration; document the fetch-rebase-republish pattern |
| URL→name discovery shallow clone fails on flaky network | Retry with backoff (max 3 attempts); typed error otherwise |
| First-time bootstrap requires N clones for N cards | Parallel-fetch in `drwn install` (bounded concurrency 4); future B11 progress bars |
| Atomic writes fail on cross-filesystem rename | Temp file is in same directory as target → same filesystem |
| Bare repo's `[drwn]` config section conflicts with future drwn versions | Field-by-field versioning; `drwn.formatVersion = 1` |
| Catalog repo for the default community is empty initially | Acceptable — empty `catalog.json` works; gates `drwn search card` on having registered catalogs with content |

---

## 18. Open Questions

1. **Should `drwn install` parallelize fetches?**
   - Lean: yes, bounded concurrency 4 by default. Configurable via `DRWN_FETCH_CONCURRENCY`. Future B11 adds progress feedback.

2. **What happens to a migration that fails mid-way through a card with 10+ versions?**
   - The `<name>.git.tmp` dir is cleaned up on next run. The original `<name>/` is untouched. User can re-run; idempotent.

3. **Should the default community catalog be empty or seeded with at least one card?**
   - Lean: empty initially. As cards exist, add them via catalog PR. Empty is fine; `drwn search card` returns nothing until content shows up.

4. **What's the friendliest error for a `git+url#ref` where the URL is unreachable due to network issues vs auth issues?**
   - Two distinct typed errors: `GitNetworkError` (with retry hint) and `GitAuthError` (with credential-setup hint). Implementation parses `git fetch` stderr to discriminate.

5. **Should `drwn store gc` run automatically after `drwn install`?**
   - Lean: no, with a hint if the store is large. GC is explicit (per analysis 48 §11.3); auto-running risks user confusion.

6. **Where do `drwn.cardName` and `drwn.formatVersion` Git config values live exactly?**
   - In each bare repo's `config` file under `[drwn]` section (§3.2). Globally relevant config (e.g., default catalog list) is in `~/.agents/drwn/store.json`.

7. **Should we ship a `drwn doctor --check-bare-repos` flag in Wave 1 or defer to backlog B12?**
   - Defer. `drwn store verify` (Wave 1) does the heavy lifting; deep `git fsck` per backlog B12 is opt-in.

---

## 19. Appendices

### A. Cross-reference: how this doc relates to prior analyses

| Analysis | Status under this target |
|---|---|
| `29_harness-cards-target-architecture-v1_1.md` | Cards model authoritative; this doc inherits |
| `32_harness-cards-vs-flox-and-conda.md` | Materialization mechanisms authoritative; this doc inherits |
| `42_drwn-cli-vocabulary-and-multi-env-design.md` | Vocabulary + presets/profiles inherited |
| `43_drwn-cli-target-architecture.md` | Five-layer model inherited; storage details refined in this doc |
| `44_drwn-git-storage-backend-options.md` | Design A + E selected; this doc realizes them |
| `46_drwn-card-team-sharing-flow.md` | Team workflow inherited; commands and patterns identical |
| `47_drwn-target-architecture-after-phase-1.md` | **Superseded** — Phase 1's cache layer eliminated |
| `48_drwn-target-architecture-after-phase-2.md` | **Superseded** — collapsed into this doc |
| `49_drwn-target-architecture-after-phase-3.md` | **Partially superseded** — migration portion gone; Wave 2 spec preserved |
| `50_drwn-command-roles-across-git-rollout-phases.md` | Command roles + lifecycle stages inherited |
| `51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md` | Comparison insights inherited; R-recommendations integrated |

### B. Wave 1 sub-phase index (for task plan reference)

The task plan (task 33) decomposes Wave 1 into:

- **Sub-Phase A — Foundation:** `cli/core/git.ts` skeleton, path helpers, `writeAtomically()`, lockfile v2 schema + read-compat, `parseCardRef` extension.
- **Sub-Phase B — Resolver + Install:** origin dispatch, `resolveFromStore` rewrite, `resolveFromGit` with URL→name discovery, `drwn install` command.
- **Sub-Phase C — Migration + Publish Rewrite:** `drwn store migrate-to-git`, `publishCardWithGit` plumbing.
- **Sub-Phase D — Team Sharing:** `drwn card remote/push/fetch/clone`.
- **Sub-Phase E — Discovery:** catalog support, default community catalog pre-registration, `drwn search card`.
- **Sub-Phase F — Affordances:** `drwn card show` with Git log, `drwn card diff` with real diff, `drwn card validate <ref>`.
- **Sub-Phase G — Maintenance:** `drwn store gc / verify / export`, `DRWN_STORE_READONLY`, `drwn outdated --fetch`.
- **Sub-Phase H — Status + Docs:** documentation refresh, GitHub topic convention, vocabulary lockdown verification.
- **Sub-Phase I — Final Verification.**
- **Companion PR — `darwinian-harness/validate-card-action`.**

### C. Estimated effort

| Sub-phase | Sessions |
|---|---|
| A — Foundation | 2–3 |
| B — Resolver + Install | 2–3 |
| C — Migration + Publish Rewrite | 2–3 |
| D — Team Sharing | 1–2 |
| E — Discovery | 1–2 |
| F — Affordances | 1–2 |
| G — Maintenance | 2 |
| H — Status + Docs | 1 |
| I — Final Verification | 1 |
| **Total** | **13–19 sessions** |
| Companion PR (validate-card-action) | 1–2 |

Slightly tighter than the prior "10–17 + 1 companion" estimate because the `cache/` infrastructure work is gone.

### D. A day in the life of drwn (post-Wave-1)

```bash
# Monday morning: switch from weekend mode to work
drwn profile use work
drwn write

# Open project, switch to heavy-work preset
cd ~/dev/myproject
drwn preset use heavy-work
# auto-applied

# Fetch latest from team
drwn card fetch @team/baseline
drwn outdated --fetch
# → @team/baseline: 1.3.0 → 1.4.0 available

# Bump and apply
drwn pin @team/baseline@1.4.0
drwn write

# Discover a new card from the team catalog
drwn search card --scope @team
# → @team/observability, @team/security, @team/baseline (already installed)

drwn add @team/observability@^1.0.0
drwn write

# A new teammate joins; they git clone the project and run:
drwn install
# → fetches @team/baseline + @team/observability into local store, applies

# Author flow: improve a card
$EDITOR ~/.agents/drwn/sources/@team/baseline/skills/code-review/SKILL.md
$EDITOR ~/.agents/drwn/sources/@team/baseline/card.json  # update version
drwn card publish @team/baseline
drwn card push @team/baseline

# Inspect history
drwn card show @team/baseline@1.5.0
# → manifest, integrity, recent Git history, configured remotes

drwn card diff @team/baseline@1.4.0 @team/baseline@1.5.0
# → real git diff between the tagged versions

# End of week: snapshot machine state before experimenting
drwn profile save before-experiment
# ... try something risky ...
# regret it
drwn profile use before-experiment
drwn write
```

Every command in this walkthrough is part of Wave 1's surface.

### E. What Wave 2 adds beyond this target

```bash
# Wave 2 capture flow — capture a working project as a shareable card
cd ~/dev/another-project
drwn card new --from-project
# → snapshots effective state into ~/.agents/drwn/sources/@me/another-project-harness/
# → user edits, publishes, pushes

# Wave 2 manifest fields surface in card show
drwn card show @team/baseline@1.4.0
# → ... Stability: stable
# →     Last validated with: drwn 1.0.0
```

Two small additions on top of the comprehensive Wave 1 surface.

### F. The Electron desktop app (backlog B4) on this foundation

```text
┌──────────────────────────────────────┐
│ Electron App (B4, future)            │
│                                      │
│   Reads:                             │
│   - ~/.agents/drwn/* (state)         │
│   - <project>/.agents/drwn/* (state) │
│   - `drwn ... --json` output         │
│                                      │
│   Writes (via shell-out):            │
│   - `drwn use ...` (mutate intent)   │
│   - `drwn write` (materialize)       │
│   - `drwn install` (bootstrap)       │
│   - `drwn card publish/push` (share) │
└──────────────────────────────────────┘
                 ↓
       file watchers, parse JSON
                 ↓
┌──────────────────────────────────────┐
│ drwn CLI (kernel)                    │
│   - same binary users invoke         │
│   - all commands have --json         │
│   - filesystem-state authoritative   │
└──────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────┐
│ ~/.agents/drwn/ + <project>/...      │
│   (stable filesystem contract)       │
└──────────────────────────────────────┘
```

Wave 1's architectural discipline (filesystem-as-API, JSON-everywhere, CLI-as-kernel) makes B4 a straightforward layering rather than a re-architecture.
