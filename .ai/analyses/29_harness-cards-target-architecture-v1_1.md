# Harness Cards: Target Architecture v1.1

**Date**: 2026-05-20
**Status**: Final
**References**: [analyses/26_harness-cards-target-architecture.md, analyses/28_harness-cards-architecture-assessment.md, analyses/25_harness-cards-cli-design.md, analyses/27_cli_help_gap_analysis.md, knowledges/02_per-project-config-guide.md, knowledges/03_npm-skill-bundles-guide.md]

---

## Changes from v1 draft (`26_harness-cards-target-architecture.md`)

This v1.1 revision folds the fifteen resolution strategies from `28_harness-cards-architecture-assessment.md` into the design. The structure of the original v1 draft is preserved where it worked; the substantive changes are listed below for reviewers familiar with that draft. The feature release target remains Harness Cards v1; "v1.1" is the architecture-document revision.

| # | Change | Driver |
|---|---|---|
| 1 | §4.3 Store layout clarifies that `mcp-servers/` is a **directory of per-server JSON files**, not a single file. The top-level `version` from today's `~/.agents/library/mcp-servers.json` migrates into `store.json`. | S1, S7 |
| 2 | **New §4.5 Migration semantics** with the full `bgng store migrate` algorithm, trigger detection, failure recovery, and orphan cleanup. | S7 |
| 3 | §5 Schemas reorders to put **write-record first** (§5.1) — it is foundational infrastructure for §8.4 drift handling and §8.5 cleanup, not an afterthought. Adds explicit missing/corrupt fallback semantics. | S4 |
| 4 | §5.2 Card manifest commits to **three-layer MCP server resolution** (card-inline > user library > packaged baseline). No `mcpBundles` field in v1. | S5 |
| 5 | §6.6 Universal flags codifies **`--why <category>:<name>`** syntax and **`--write` chaining (no rollback)**. | S8, S11 |
| 6 | §6.5 Existing namespaces explicitly **preserves `bgng scan`** as a non-card discovery surface. | S10 |
| 7 | **New §7.7 Bundle conflict resolution** with the intersect-and-pick-highest algorithm. | S6 |
| 8 | §8.3 enumerates **three materialization mechanisms** (symlinks, `_bgng` meta-block, generated-file-plus-symlink). Cursor explicitly keeps the generated-file-plus-symlink pattern; the v1 proposal of `_bgng`-in-cursor is rejected. | S3 |
| 9 | §8.4 Drift handling specifies the **`_bgng` meta-block schema** (managed-key hashing, `_bgng.fieldHashes`, refusal-with-`--force`). | S3, S4 |
| 10 | §11 Testing strategy adds the **idempotency property test** (§11.4) and standardizes test isolation on the existing **`AGENTS_DIR`** convention (§11.6). | S13, S14 |
| 11 | **§14 is rewritten** as Surface Summary *and* Behavior Changes — leading with the cuts (project-local materialization, drift refusal, legacy orphan handling, `bgng add extension` removal) before the additions. | S2, S15 |
| 12 | **New §15 Implementation Milestones** maps M0–M7 to PR-able units of work with dependencies. | S15 |
| 13 | §6 acknowledges the **diagnostics section-builder refactor** as the basis for `--explain`/`--why`. | S9 |
| 14 | §10 Resolved Open Questions extends with the v1 architecture's pending decisions ("leans" carried over from the assessment). | S15 |
| 15 | **CLI gap fixes are sequenced into M0** (orphan flag removal, `--json` parity, `details`/`examples` template). | S12 |

---

## 1. Executive Summary

Harness Cards introduce a new abstraction to `bgng`: **named, semver-versioned, reusable bundles of harness intent** that a project can pin to. A card declares which skills, MCP servers, extensions, and downstream targets a project should run on. Cards are immutable once published, stored locally under `~/.agents/bgng/cards/<scope>/<name>/<version>/`, and reference-able from any project's `.agents/bgng/config.json`.

The design is **clean-cut**: no backward-compatibility layer, one canonical schema, one canonical CLI surface, one materialization path. Existing project configs without a `cards` field remain valid (degenerate case: empty cards array), but every project benefits from the same new behaviors — project-scoped writes, integrity-checked materialization, drift detection, safe cleanup.

The clean cut is honest about two breaking changes that come with v1:

1. **Materialization scope shifts from global to project-local** for any directory with `.agents/bgng/config.json` in its ancestry. `bgng write` from inside a project writes to `<project>/.claude/skills/`, `<project>/.codex/skills/`, `<project>/.cursor/mcp.json` — not to your home directory. Machine-scope writes (outside any project) keep targeting `~/.claude/`, `~/.codex/`, `~/.cursor/`, driven by `machine.json`.
2. **`bgng write` refuses on drift** in regions it manages. Hand-edits to `mcpServers` in `settings.json` (or equivalent) are surfaced; the user either re-runs with `--force` to overwrite or promotes the change into the project config to keep it.

Distribution leans on existing infrastructure: npm in v1, git URLs in v2, no custom registry service ever. The local store is the source of truth; remotes are sync targets.

The mental model is **"uv/pnpm for harnesses"** with one refinement — the store is *local-authoritative* (the user's own published cards live there as canonical), not merely a download cache.

This document is the authoritative specification for the v1 implementation. Section 14 enumerates the user-visible behavior changes; section 15 sequences the work into eight PR-able milestones.

---

## 2. Motivation

The current `bgng` model has three layers of intent: machine defaults (`~/.agents/bgng/config.json`), project overlay (`<project>/.agents/bgng/config.json`), and named extensions. This works for a single configuration per machine, but breaks down for two real use cases:

1. **Reuse across projects.** A user with a "backend service" harness setup wants to apply the same setup to a new project without retyping. Today's only mechanism is hand-copying overlay JSON between repos.
2. **Versioned improvement.** A user iterating on their harness wants to capture "the way I had it working in March" so they can either roll back or compare to "the way it works now." Today's only mechanism is git history of the config file.

Cards solve both. A card is the named, versioned, immutable unit. Projects pin to versions; authors publish new versions; the local store keeps history of releases.

Cards also raise the bar on materialization safety. The current `bgng write` is idempotent at the content level (it skips no-op writes) but does not track what it materialized last time. That means safe cleanup is impossible — orphan symlinks accumulate and are merely warned about, never removed. v1's write-record + drift-refusal + project-scoped materialization closes that loop.

---

## 3. Vocabulary

| Term | Meaning |
|---|---|
| **Card** | A named, versioned bundle of harness intent (manifest + optional inline content). |
| **Store** | The local-authoritative content layer at `~/.agents/bgng/`. Holds published cards, in-progress card sources, standalone skill bundles, MCP server definitions, machine state. |
| **Source** | An editable card under `~/.agents/bgng/sources/<scope>/<name>/`. Authoring happens here. |
| **Published card** | An immutable directory under `~/.agents/bgng/cards/<scope>/<name>/<version>/`. Created by `publish`. |
| **Manifest** | The user-edited declaration: a card's `card.json` or a project's `.agents/bgng/config.json`. |
| **Lockfile** | The system-generated `<project>/.agents/bgng/card.lock` recording exact resolved versions + integrity hashes. Git-tracked. |
| **Write-record** | The system-generated `<project>/.agents/bgng/write-record.json` (or `~/.agents/bgng/global-write-record.json` for machine scope) recording what `bgng write` last materialized; the basis for drift detection and cleanup. Gitignored. |
| **Overlay** | The project-specific deviation from cards: `skills`/`servers`/`extensions`/`targets` fields in the project config, applied last in the merge stack. |
| **Apply** | The project-side act of pinning to a card version and producing a lockfile. Mutates project files only. |
| **Publish** | The author-side act of snapshotting a source into the store as an immutable version. |
| **Write** | The materialization step that pushes effective state into the project's `.claude/`, `.codex/`, `.cursor/` directories (project scope) or the user's home equivalents (machine scope). |
| **Effective state** | The merged result of cards (in declared order) and the project overlay; the input to `write`. |
| **Managed region** | A field in a settings file (Claude/Codex) or a generated file (Cursor) whose content bgng owns. Hand-edits to managed regions cause `write` to refuse without `--force`. |

---

## 4. Architectural Overview

### 4.1 The merge stack

For projects with cards:

```text
built-in defaults  →  user library (standalone skills/MCP)  →  cards (in declared order)  →  project overlay
```

`bgng write` materializes the resulting effective state into project-local directories. Machine defaults (the legacy `~/.agents/bgng/` config, now `machine.json`) **are not in the stack for projects** — they apply only to materialization that happens outside any project (when `bgng write` is run from a directory that has no `.agents/bgng/config.json` in its ancestry).

For machine-scope writes (no project config in ancestry):

```text
built-in defaults  →  user library (standalone skills/MCP)  →  machine.json overlay
```

The user library is *not* the same as cards. It is the post-migration home of today's `~/.agents/library/mcp-servers.json` (now a directory of per-server files at `~/.agents/bgng/mcp-servers/`) and today's `~/.agents/packages/skills/` (now `~/.agents/bgng/skills/`). It provides ad-hoc, un-versioned content that the user has installed without packaging into a card.

### 4.2 Single card mental model: "uv/pnpm for harnesses, with a local-authoritative store"

| Concept | bgng | pnpm | uv |
|---|---|---|---|
| Immutable versioned releases | `cards/<scope>/<name>/<ver>/` | `~/.pnpm-store/` | `~/.cache/uv/` |
| Manifest + lockfile | `config.json` + `card.lock` | `package.json` + `pnpm-lock.yaml` | `pyproject.toml` + `uv.lock` |
| Constraint syntax | npm-style semver (`^1.2.0`) | npm-style | PEP 440 |
| Multiple deps per project | `cards: [...]` array | dependencies | dependencies |
| User-authored content lives in the store | yes (`sources/`) | no (lives wherever) | no |
| Separate materialization step | yes (`bgng write`) | no (`install` materializes) | no |
| Per-project overrides on top of fetched deps | yes (overlay) | no | no |
| Materialization-state record | yes (`write-record.json`) | no (npm-style links) | no |

The four novel properties — local-authoritative content, separate materialization, per-project overlay, materialization-state record — are what distinguish this from a pure package-manager analogy.

The "uv/pnpm for harnesses" framing is the **user-facing analogy** because uv and pnpm are familiar entry points for "lockfile + immutable store + npm-style solver." Internally, the model is more precisely described as **Flox-style package management composed with dotfile-style materialization**. The Flox half — per-directory environments, local-authoritative content store, lockfile-pinned reproducibility, composable bundles — covers everything except how the resolved state reaches the consumer tools. The dotfile-manager half — symlinks, managed-field rewrites in mixed-ownership files, generated-file-plus-symlink — handles the materialization, which is fragmented across three mechanisms (§8.3) because the consumers (Claude Code, Codex, Cursor) don't share a single config convention. See `analyses/32_harness-cards-vs-flox-and-conda.md` §5 for the deep dive on the materialization mechanism and §6 for cards' position in the broader reproducible-environments stack.

### 4.3 Store layout

```text
~/.agents/bgng/
├── store.json                          # store metadata: schema version, init timestamp
├── machine.json                        # machine-wide state (active default card for project-less use, etc.)
├── cards/                              # published immutable versions
│   ├── @me/
│   │   └── backend-service/
│   │       ├── 1.0.0/
│   │       │   ├── card.json
│   │       │   ├── skills/             # optional inline content
│   │       │   ├── mcp-servers/        # optional inline content (per-server JSON files)
│   │       │   └── .integrity          # sha256 of directory tree
│   │       ├── 1.1.0/
│   │       └── versions.json           # { "latest": "1.1.0", "available": [...], "deprecated": {} }
│   └── third-party/...                 # cards fetched from npm
├── sources/                            # editable card sources
│   └── @me/
│       └── backend-service/            # author iterates here; optional .git/
├── skills/                             # standalone skill bundles (was ~/.agents/packages/skills/)
│   └── @scope/<pkg>/<version>/         # existing "current" symlink convention is preserved
├── mcp-servers/                        # standalone MCP definitions (one file per server)
│   ├── context7.json                   # was a key in ~/.agents/library/mcp-servers.json
│   ├── chrome-devtools.json
│   └── ...
├── generated/                          # transient: rendered files for symlink-based targets (cursor)
├── cache/                              # transient: fetched tarballs, http payloads
└── global-write-record.json            # write-record for machine-scope writes (gitignored)
```

The store is **not** a git repo. Versioning is by directory (immutable releases); history of *authoring* a card is the author's concern (typically `git init` inside `sources/<scope>/<name>/` if they want it — `bgng card new` initializes one by default with a `--no-git` opt-out).

**Per-server MCP files.** Each `mcp-servers/<id>.json` mirrors the shape today's `~/.agents/library/mcp-servers.json` uses for the values in its `servers` map — every field preserved, exploded one file per record. The top-level `version: 1` from today's single-file `library/mcp-servers.json` migrates into `store.json` as `schemaVersion`. This shape choice lets cards ship per-server files inline (`<card>/mcp-servers/<id>.json`) using the exact same schema.

### 4.4 Layering interaction with the existing harness

Existing concepts (skills, MCP servers, extensions, machine defaults) are unchanged in shape and ingestion. What changes:

- `~/.agents/library/` and `~/.agents/packages/skills/` fold into the store at `~/.agents/bgng/mcp-servers/` (with the file-shape change above) and `~/.agents/bgng/skills/` via the one-shot migration in §4.5.
- `~/.agents/bgng/config.json` (the legacy machine-defaults file) is renamed to `~/.agents/bgng/machine.json`; the role is preserved.
- All other existing CLI commands keep their current behavior. `bgng scan` is preserved as a non-card discovery surface (orthogonal to cards; cards-specific discovery uses `bgng card list` / `bgng card show`).

### 4.5 Migration semantics

The pre-cards layout (`~/.agents/library/mcp-servers.json`, `~/.agents/packages/skills/`, `~/.agents/bgng/config.json`) cannot coexist with the cards-era layout. Migration is an **explicit one-shot command** that produces the new layout atomically.

#### 4.5.1 Trigger and detection

At the start of every `bgng` command, the CLI checks for legacy state:

```text
LEGACY ⇔ ( ~/.agents/bgng/config.json exists  OR
            ~/.agents/library/           exists  OR
            ~/.agents/packages/skills/   exists )
        AND
          ~/.agents/bgng/store.json    does not exist
```

When LEGACY holds, the CLI prints a single line to stderr and proceeds with the *legacy* path resolvers (which remain functional during the M1 milestone, removed at M2's end):

```text
WARNING: pre-cards layout detected. Run `bgng store migrate` to upgrade.
```

There is no silent auto-migration in v1. The migration command is documented in §6.4 and detailed below.

#### 4.5.2 `bgng store migrate` algorithm

```text
1. Validate readability of all source paths (library/, packages/, bgng/config.json).
   Abort with a clear error if any required source is unreadable.

2. Create staging directory:
     ~/.agents/bgng.staging-<ISO-timestamp>/

3. Build the new layout in staging:
   3a. Copy ~/.agents/bgng/config.json → <staging>/machine.json (rename).
   3b. Read ~/.agents/library/mcp-servers.json. For each (id, definition) in
       the `servers` map, write <staging>/mcp-servers/<id>.json. Preserve every
       field exactly. The top-level `version` from the source migrates into
       <staging>/store.json as `schemaVersion`.
   3c. Move ~/.agents/packages/skills/ tree → <staging>/skills/
       (rename if same filesystem; hardlink otherwise; copy as last resort).
   3d. Generate <staging>/store.json with:
       { "schemaVersion": 1, "initAt": "<ISO-timestamp>" }
   3e. Create empty <staging>/cards/, <staging>/sources/, <staging>/cache/,
       <staging>/generated/.

4. Validate the staging tree:
   - Every source file has a destination.
   - Counts match (mcp-servers files = keys in old map; skills dirs preserved).
   - Every produced JSON parses.
   - No orphans in either direction.
   Abort and preserve staging on any failure.

5. Move ~/.agents/bgng/ → ~/.agents/bgng.archive-<timestamp>/

6. Move ~/.agents/library/ and ~/.agents/packages/ into the same archive directory.

7. Rename ~/.agents/bgng.staging-<timestamp>/ → ~/.agents/bgng/

8. Print:
     Migration complete.
     Pre-cards layout archived to ~/.agents/bgng.archive-<timestamp>/.
     Verify your harness still works, then remove the archive:
       rm -rf ~/.agents/bgng.archive-<timestamp>
```

#### 4.5.3 Failure recovery

| Failure point | State on disk | Recovery |
|---|---|---|
| Before step 5 | Old layout fully intact; staging preserved | `rm -rf ~/.agents/bgng.staging-*` and retry |
| Between steps 5 and 7 | Archive directory present; new `bgng/` missing | Manual: `mv ~/.agents/bgng.archive-<ts>/bgng ~/.agents/bgng` (the `bgng/` sub-folder inside the archive). A future `bgng store repair` command will automate this. |
| After step 7 | Migration complete | No recovery needed — any subsequent error is unrelated |

#### 4.5.4 Legacy orphan cleanup (opt-in)

Pre-cards `bgng` populated `~/.claude/skills/` and `~/.codex/skills/` directly. After project-local materialization lands (§4.1, §8.3), those global directories may contain symlinks bgng created but no longer references. They are not auto-deleted — `bgng store migrate --cleanup-legacy-orphans` enables the additional step:

```text
9. Scan ~/.claude/skills/ and ~/.codex/skills/ for symlinks whose realpath
   resolves into:
   - the archive directory (~/.agents/bgng.archive-<ts>/)
   - the new store (~/.agents/bgng/skills/, ~/.agents/bgng/cards/)
   These are unambiguously bgng-owned.

10. Prompt (or use --yes to suppress) for each candidate; remove on confirmation.

Symlinks pointing into the harness repo (e.g., your local checkout's skills/
directory) are bgng-owned but kept by default — many users want global
access to repo-native skills. Use --cleanup-repo-orphans to include these too.
```

This step is separate from the core migration because some users will want to keep the global `~/.claude/skills/` populated for tools that read from it; the cleanup is an explicit opt-in.

---

## 5. Schemas

The four schemas are presented in the order an implementer encounters them:

1. **Write-record** — the materialization-state contract; without it, drift detection and cleanup cannot run safely.
2. **Card manifest** — what a card declares.
3. **Project config** — how a project consumes cards.
4. **Lockfile** — what was resolved.

### 5.1 Write-record — `<project>/.agents/bgng/write-record.json` (project scope) or `~/.agents/bgng/global-write-record.json` (machine scope)

```json
{
  "writeRecordVersion": 1,
  "lastWriteAt": "2026-05-18T10:00:00Z",
  "lastWriteHarnessVersion": "0.6.0",
  "managedPaths": [
    {
      "path": ".claude/skills/parallel-web-search",
      "kind": "symlink",
      "target": "/Users/.../store/cards/@me/baseline/1.2.0/skills/parallel-web-search"
    },
    {
      "path": ".claude/settings.json",
      "kind": "managed-fields",
      "fields": ["mcpServers"],
      "fieldHashes": { "mcpServers": "sha256-abc..." }
    },
    {
      "path": ".codex/skills/research-deep-dive",
      "kind": "symlink",
      "target": "/Users/.../store/cards/@me/extras/2.0.3/skills/research-deep-dive"
    },
    {
      "path": ".cursor/mcp.json",
      "kind": "symlink",
      "target": ".agents/bgng/generated/cursor-mcp.json"
    }
  ]
}
```

Notes:

- **Gitignored.** Per-machine, regenerable, never committed. `bgng init` writes a `.gitignore` line for it alongside the project config.
- **Atomic writes.** The CLI writes to `write-record.json.tmp`, fsyncs, and renames. Never directly overwrites. Same convention applies to `card.lock`.
- **Missing or corrupt fallback.** If the file is absent, malformed JSON, or fails schema validation, bgng treats it as empty (no record of prior writes). The next `bgng write`:
  1. Cannot detect drift (no prior hashes to compare against).
  2. Cannot safely remove existing on-disk paths (no record of ownership).
  3. Prints a one-line warning: `no prior write-record; treating existing on-disk state as user-owned for this write`.
  4. Proceeds with materialization; subsequent writes recover normal semantics.
- **Doctor validation.** `bgng doctor` validates the write-record: every `managedPaths[]` entry must exist on disk and match its recorded `kind`/`target`. Mismatches are reported as drift.

Write-record is the **basis for both drift detection (§8.4) and cleanup (§8.5).** It is not optional polish.

### 5.2 Card manifest — `card.json`

```json
{
  "$schema": "https://schemas.bgng.dev/card/1.json",

  "name": "@me/backend-service",
  "version": "1.2.0",
  "description": "Backend service harness baseline",
  "license": "MIT",

  "harness": {
    "minVersion": "0.6.0"
  },

  "bundles": {
    "@example/research-skills": "^1.0.0"
  },

  "skills": {
    "include": ["parallel-web-search", "beads-task-tracking", "research-deep-dive"]
  },
  "servers": {
    "context7": { "enabled": true }
  },
  "extensions": {
    "beads":    { "enabled": true, "includeSkill": true },
    "parallel": { "enabled": true, "skills": true, "mcp": false }
  },
  "targets": {
    "claude": { "enabled": true },
    "codex":  { "enabled": true },
    "cursor": { "enabled": false }
  }
}
```

Notes:

- `name`: npm-style `@scope/name` (preferred) or unscoped (allowed, discouraged).
- `version`: strict semver; rejected at `publish` if it doesn't parse.
- `harness.minVersion`: backstop. Apply fails loudly if installed bgng (reported by Clipanion's built-in `bgng --version`, which prints `package.json:version`) is older.
- `bundles`: standalone skill-bundle dependencies. Resolved per §7.4 and §7.7; materialized under `~/.agents/bgng/skills/`.
- `skills.include`: **explicit** list. Inline skills shipped at `<card>/skills/<name>/` are *not* implicitly enabled; the author lists every desired skill by name. Explicit > implicit.
- **No `skills.exclude`** at the card level. A card is a baseline; there is nothing yet to exclude from. Excludes only make sense in the project overlay.
- **No `mcpBundles` field in v1.** MCP server *definitions* are resolved through a fixed three-layer order (§5.2.1). If real demand emerges for npm-distributed MCP server bundles, an `mcpBundles` field analogous to `bundles` can be added without breaking the v1 schema.

#### 5.2.1 MCP server definition resolution

The `servers` field of a card uses keys (`"context7": { "enabled": true }`) — toggle semantics. The *definition* of the server (transport, command, args, etc.) resolves through this fixed precedence:

1. **Card-inline** — `<card>/mcp-servers/<id>.json` (a per-server file shipped in the card). When multiple cards in the project's `cards[]` ship an inline definition for the same id, the last card wins; if the definitions are structurally different, §7.6's multi-card conflict warning fires.
2. **User library** — `~/.agents/bgng/mcp-servers/<id>.json` (post-migration user overlay; preserves today's user-overrides-packaged-baseline behavior).
3. **Packaged baseline** — `<harness-repo>/registry/mcp-servers.json` (the file shipped with the harness; contains the well-known servers like `context7`, `chrome-devtools`, etc.).

The project overlay's `servers` field applies last (highest precedence overall), preserving today's dual semantics: `{ "enabled": <bool> }` toggles an existing server; a full definition adds a project-local server.

Toggling a server that resolves to no definition in any layer ⇒ `bgng doctor` flags it as "unknown server reference"; `bgng write` skips it with a warning.

### 5.3 Project config — `<project>/.agents/bgng/config.json`

```json
{
  "version": 1,
  "cards": [
    "@me/baseline@^1.0.0",
    "@me/backend-extras@^2.0.0"
  ],

  "skills": {
    "include": ["frontend-design"],
    "exclude": ["legacy-skill"]
  },
  "servers": {
    "context7": { "enabled": false }
  },
  "extensions": {
    "markitdown": { "enabled": true, "skills": true }
  },
  "targets": {
    "cursor": { "enabled": false }
  }
}
```

Notes:

- `version: 1`: insurance for future schema evolution.
- `cards`: ordered array of specifiers. Merge order is declared order — **last wins on conflict**.
  - Array-only form. No singular `card:` shorthand. One shape to teach.
  - Specifiers: `@scope/name@<range>` (semver range), `@scope/name` (implicit `*`), `file:<path>` (local development).
  - May be `[]` (overlay-only project; merge stack contains only built-ins + user library + overlay).
- `skills` / `servers` / `extensions` / `targets`: the project overlay, applied last in the merge.
- `bgng init` writes the minimal `{ "version": 1 }`; all other fields are optional with sensible defaults.

### 5.4 Lockfile — `<project>/.agents/bgng/card.lock`

```json
{
  "lockfileVersion": 1,
  "harness": {
    "version": "0.6.0",
    "resolvedAt": "2026-05-18T10:00:00Z"
  },
  "cards": [
    {
      "spec": "@me/baseline@^1.0.0",
      "name": "@me/baseline",
      "version": "1.2.0",
      "origin": "store",
      "integrity": "sha256-abc123...",
      "path": "cards/@me/baseline/1.2.0"
    },
    {
      "spec": "@me/backend-extras@^2.0.0",
      "name": "@me/backend-extras",
      "version": "2.0.3",
      "origin": "npm:https://registry.npmjs.org/@me/backend-extras/-/backend-extras-2.0.3.tgz",
      "integrity": "sha256-def456...",
      "path": "cards/@me/backend-extras/2.0.3"
    }
  ],
  "bundles": [
    {
      "spec": "@example/research-skills@^1.0.0",
      "name": "@example/research-skills",
      "version": "1.3.0",
      "origin": "npm:https://registry.npmjs.org/@example/research-skills/-/research-skills-1.3.0.tgz",
      "integrity": "sha256-ghi789...",
      "path": "skills/@example/research-skills/1.3.0"
    }
  ]
}
```

Notes:

- One `cards[]` entry per `cards[]` element in the project config, preserving declared order. Each entry carries everything needed to re-fetch and verify.
- `origin: "store"` means the card was published locally and didn't come from an external source. A teammate without access to your store will fail loudly at `write` — a signal you forgot to publish to a shared location (or that you intended the card to be local-only).
- No `resolved` summary field. Effective state is computed on the fly during `write`; the lockfile is for *pinning*, not for *summarizing*.
- **Git-tracked.** The lockfile is the reproducibility contract; gitignoring it defeats the point.
- Bundle conflicts across cards: see §7.7.

---

## 6. CLI Surface

### 6.1 Design philosophy

**Noun-first canonical, verb-first aliases for the daily-driver hot path only.** Every command reachable via its noun-namespaced canonical form (`bgng card apply`, `bgng extensions add`). A tiny set of verb-first aliases covers operations users perform daily (`bgng apply`, `bgng update`); the bar for the alias set is "verb must be unambiguous in project context." The alias set never grows past ~3 entries.

### 6.2 Top-level commands (verb-first; daily drivers + singletons)

| Command | Purpose |
|---|---|
| `bgng init` | Scaffold `<project>/.agents/bgng/config.json` |
| `bgng status` | Overall harness state (machine + project, all layers) |
| `bgng write [--dry-run]` | Materialize state into downstream tools |
| `bgng doctor` | Health checks (extended for cards) |
| `bgng apply <ref>` | Alias for `bgng card apply <ref>` |
| `bgng update [<name>]` | Alias for `bgng card update [<name>]` |

### 6.3 `bgng card` namespace

| Canonical | Verb-alias | Purpose |
|---|---|---|
| `bgng card new <name>` | — | Scaffold a card source. Flags: `--from-project`, `--from-card <ref>`, `--no-git` |
| `bgng card publish [name]` | — | Snapshot source → immutable version in store |
| `bgng card deprecate <ref> [--reason "…"]` | — | Mark version deprecated; warns on apply/update |
| `bgng card diff <ref-a> <ref-b>` | — | Structural diff with major/minor/patch classification |
| `bgng card apply <ref>…` | `bgng apply` (single ref) | Replace the project's `cards` array |
| `bgng card add <ref>…` | — | Append to the project's `cards` array |
| `bgng card pin <ref>` | — | Change a single card's constraint by name |
| `bgng card remove <name>…` | — | Remove cards by name |
| `bgng card update [<name>]` | `bgng update` | Re-resolve within existing constraints |
| `bgng card outdated` | — | Read-only: show newer versions available |
| `bgng card detach` | — | Remove all cards from the project |
| `bgng card list [--sources]` | — | List cards in the store |
| `bgng card show <ref>` | — | Detail view of a card version |
| `bgng card status [--explain]` | — | Project's full card lifecycle (lockfile + resolution trail + drift). The deep-dive complement to `bgng status`. |

`bgng status` is the at-a-glance summary across all concerns (machine, project, skills, mcp, extensions, cards, store). `bgng card status` is the card-specific deep-dive (lockfile contents, full resolution trail per card, integrity validation). The split is intentional: cheap default for the daily check, rich detail when needed.

### 6.4 `bgng store` namespace

| Command | Status | Purpose |
|---|---|---|
| `bgng store status` | v1 | Schema version, size, card count, sources count |
| `bgng store migrate [--cleanup-legacy-orphans] [--yes]` | v1 | Run the §4.5 migration. `--cleanup-legacy-orphans` enables the optional step 9; `--yes` skips per-file prompts. |
| `bgng store prune` | v1.5 | Remove unreferenced/old card versions |
| `bgng store repair` | v1.5 | Recover from an interrupted `store migrate` (between steps 5–7) |
| `bgng store remote add <name> <url>` | v2 | Configure sync remote |
| `bgng store remote remove <name>` | v2 | |
| `bgng store push` | v2 | Sync local store → remote |
| `bgng store pull` | v2 | Sync remote → local store |

### 6.5 Existing namespaces

`bgng skills`, `bgng mcp`, `bgng extensions`, `bgng library` are unchanged in behavior. Two additions and one preservation:

- `bgng extensions add <name>` is the canonical form for adding an extension to the user library. The previous top-level `bgng add extension <name>` does not exist in the cards release (clean cut).
- `bgng scan` is preserved as a non-mutating local discovery surface, orthogonal to cards. Cards-specific discovery uses `bgng card list` and `bgng card show`.
- The CLI gap fixes from `27_cli_help_gap_analysis.md` land in M0 alongside cards prep: `--project` orphan flag removed from `search mcp` and `search skill`; `--json` added to `skills curate` and `skills uncurate`; `usage.details` and `usage.examples` populated on `init`, `extensions add`, and every new card/store command.

### 6.6 Universal flags

| Flag | Applies to | Meaning |
|---|---|---|
| `--dry-run` | All mutating commands | Preview without writing |
| `--write` | `apply`, `add`, `pin`, `remove`, `update`, top-level aliases | Chain into `bgng write` after the operation (no rollback; see below) |
| `--json` | All commands with structured output | Machine-readable output |
| `--explain` | `bgng card status`, `bgng status` | Dump full resolution trail |
| `--why <category>:<name>` | `bgng status` | Dump resolution trail for a single concern. Bare `--why <name>` searches all categories; ambiguous matches abort with a disambiguation hint. |
| `--force` | `bgng write` | Overwrite drift in managed regions (see §8.4) |

#### 6.6.1 `--why` syntax

The `--why` flag accepts `<category>:<name>` to address the cross-category ambiguity that arises when names overlap. Categories are: `skill`, `server`, `extension`, `target`, `card`.

```text
bgng status --why skill:parallel-web-search       # explicit
bgng status --why parallel-web-search             # search all; ok if unique
bgng status --why context7
  → Ambiguous: matches both:
      skill:context7
      server:context7
    Disambiguate with: --why skill:context7
```

#### 6.6.2 `--write` chaining contract

`--write` chains `bgng write` after a successful mutating operation. **There is no rollback.** If the mutation succeeds and the chained write fails:

- The project config and lockfile remain mutated.
- The command exits with the chained-write's exit code.
- The user fixes the underlying write issue and re-runs `bgng write`.

This is documented in every `--write`-supporting command's help text:

> "On success, runs `bgng write`. On chained-write failure, the mutation is preserved; rerun `bgng write` after addressing the issue."

### 6.7 Diagnostics extension via section builders

`bgng status` and `bgng doctor` are extended to surface cards/store/write-record information. The diagnostics layer (`cli/core/diagnostics.ts`) is refactored from monolithic `buildStatusReport` / `buildDoctorReport` functions into a section-builder pattern: each conceptual section (`machine`, `skills`, `mcp`, `extensions`, `cards`, `store`, `project`) is a self-contained typed builder. New sections plug in by writing a new builder; the top-level functions compose them.

This refactor is implementation-internal (no CLI surface change), but it is the substrate on which `--explain` and `--why` operate: a `--why skill:foo` invocation triggers the skills section builder's "explain trail for foo" branch.

---

## 7. Versioning Semantics

### 7.1 Structural change classification

| Change | Classification |
|---|---|
| Remove a skill from `skills.include` | Major |
| Disable a server that prior version had enabled (or remove a server definition) | Major |
| Disable an extension that prior version had enabled, or flip an extension's `skills`/`mcp` sub-flag off | Major |
| Disable a target that prior version had enabled | Major |
| Raise `harness.minVersion` above prior | Major |
| Remove or downgrade a `bundles` dependency in a way that drops content | Major |
| Add a skill to `skills.include` | Minor |
| Enable a previously absent or disabled server/extension/target | Minor |
| Add a `bundles` dependency, or widen its range | Minor |
| Change `description` / `license` / other metadata | Patch |
| Refine inline content (skill SKILL.md, MCP definition body) | Flagged for author judgment |

Reduces to: **structural removal/disable is major; structural addition/enable is minor; metadata-only is patch.** Inline content edits surface explicitly via `bgng card diff` rather than being auto-classified.

### 7.2 `bgng card diff` output

```text
$ bgng card diff @me/backend@1.0.0 @me/backend@1.1.0

Classification: minor

Skills:
  + added:    research-deep-dive
  unchanged:  parallel-web-search, beads-task-tracking

Servers:
  enabled:    context7 (unchanged)
  + enabled:  notion

Extensions:
  + enabled:  markitdown (skills: true)
  unchanged:  beads, parallel

Targets:
  unchanged:  claude, codex, cursor (disabled in both)

Metadata:
  harness.minVersion: 0.6.0 → 0.6.0 (unchanged)
  bundles: 1 unchanged

Inline content:
  3 files unchanged
  ⚠ 1 file modified: skills/parallel-web-search/SKILL.md (5 lines changed)
    Author judgment required — re-run with --inline-diff to inspect.
```

### 7.3 Publish-time guardrail

When `bgng card publish` detects that the declared bump is *smaller* than the structural classification, it warns and asks for confirmation. A larger-than-classified bump never warns (always harmless). A `--no-warn` flag is available for scripted publishing.

### 7.4 Update resolution algorithm

Given a project pinned to `@me/backend@^1.2.0`:

1. For each entry in `cards[]` with a non-`file:` specifier, parse name and range.
2. Discover available versions: union of local store (`cards/<scope>/<name>/`) and registry origins recorded in the prior lockfile.
3. For new entries (no prior lockfile presence), fetch registry version list only if the card isn't found in the local store at any matching version.
4. Filter available versions by range using npm-style semver matching.
5. Exclude deprecated versions unless they are the only match (then warn and proceed).
6. Pick the highest remaining version. Record `spec`, `version`, `origin`, `integrity`, `path` in the lockfile.
7. **Resolve `bundles[]` constraints across all cards** (see §7.7).

Prereleases excluded unless the constraint opts in (`^1.2.0-beta`). `file:` specifiers skip steps 2–6 and resolve to whatever the on-disk manifest declares now (integrity computed but not enforced across runs).

### 7.5 Deprecation surfacing

Deprecation is a soft signal — warns on apply/add/update/status, never refuses. Pinned reproducibility is absolute.

### 7.6 Multi-card conflict warnings (server/extension/target)

When `bgng card apply`/`add`/`update`/`write` produces a configuration where two cards declare the same server/extension/target with *different definitions* (not merely toggling enabled), the resolution proceeds (last-wins) and emits a warning identifying the conflicting fields. Silent overrides are debugging traps; surfacing them prevents that class of confusion.

### 7.7 Bundle conflict resolution

When two or more cards in the project's `cards[]` declare the same `bundles[]` entry with different ranges, the resolver:

1. Collects all range constraints across the cards.
2. Computes the intersection of the ranges (`semver.intersects`-style).
3. From the union of available versions in the local store and registry, picks the highest version satisfying the intersection.
4. **If the intersection is empty**, fails at `apply`/`update` with the following error shape:

```text
Bundle conflict: @x/research-skills
  card @me/baseline declares ^1.0.0 (via cards[0])
  card @me/extras   declares ^2.0.0 (via cards[1])
No version satisfies both ranges.

Resolutions:
  - bump @me/baseline to a version that uses @x/research-skills@^2.0.0
  - or remove one of the cards
```

The lockfile records the single resolved version (one `bundles[]` entry per bundle name). Provenance — which cards contributed which ranges — is computed on demand from the manifests, not stored, to keep the lockfile compact.

---

## 8. Materialization

### 8.1 Merge algorithm

```text
effective = { skills: Set(), servers: Map(), extensions: Map(), targets: Map() }

# Phase 1: cards in declared order, last-wins on conflict
for card in lockfile.cards:                       # array order from manifest
  manifest = read(card.path + "/card.json")
  effective.skills.addAll(manifest.skills.include)
  effective.servers.merge(manifest.servers)
  effective.extensions.merge(manifest.extensions)
  effective.targets.merge(manifest.targets)

# Phase 2: project overlay applied last
overlay = projectConfig
effective.skills.addAll(overlay.skills.include ?? [])
effective.skills.removeAll(overlay.skills.exclude ?? [])
effective.servers.merge(overlay.servers ?? {})
effective.extensions.merge(overlay.extensions ?? {})
effective.targets.merge(overlay.targets ?? {})
```

Servers in the overlay preserve today's dual semantics: `{ "enabled": <bool> }` toggles an existing server; a full definition adds a project-local server.

### 8.2 `bgng write` step-by-step

```text
1. Scope   → determine project-vs-machine from .agents/bgng/config.json ancestry
2. Verify  → lockfile present; integrity passes for every locked card
3. Resolve → merge cards in declared order; apply project overlay last
4. Plan    → diff desired state against prior write-record
5. Detect  → hand-edits in managed regions → drift
6. Execute → symlinks + managed-field updates + generated files (or print under --dry-run)
7. Record  → write-record captures what we did, for the next run's diff
```

### 8.3 Three materialization mechanisms

bgng owns three distinct kinds of on-disk artifacts. Each has its own mechanism; mixing them was an open question in v1 and is now resolved.

#### 8.3.1 Skills — directory symlinks

```text
<scope>/.claude/                        # <scope> = <project> or homeDir
├── CLAUDE.md                           # user-owned; bgng never touches
├── skills/
│   ├── parallel-web-search → ~/.agents/bgng/cards/@me/baseline/1.2.0/skills/parallel-web-search
│   ├── research-deep-dive  → ~/.agents/bgng/cards/@me/extras/2.0.3/skills/research-deep-dive
│   └── beads-task-tracking → ~/.agents/bgng/skills/@scope/beads-pkg/1.0.0/skills/beads-task-tracking
```

- One directory symlink per skill, pointing at an immutable card-version (or bundle-version) directory in the store.
- Absolute targets; broken-link detection via `readlink` + `stat`.
- Idempotency: `realpath(linkPath) === realpath(targetPath)` ⇒ skip.

#### 8.3.2 Claude settings.json and Codex config.toml — `_bgng` meta-block

These files have user content (user keys in `settings.json`; user TOML sections in `config.toml`) coexisting with bgng-managed content. Field-level management preserves user content while letting bgng own its keys.

**Claude `settings.json`:**

```json
{
  "_bgng": {
    "version": 1,
    "managedKeys": ["mcpServers"],
    "fieldHashes": { "mcpServers": "sha256-abc123..." },
    "lastWriteAt": "2026-05-20T10:00:00Z"
  },
  "mcpServers": { ... },
  "model": "...",
  "anyUserKey": "preserved verbatim"
}
```

**Codex `config.toml`:**

```toml
[_bgng]
version = 1
managedSections = ["mcp_servers"]
sectionHashes = { mcp_servers = "sha256-xyz..." }
lastWriteAt = "2026-05-20T10:00:00Z"

[mcp_servers.context7]
command = "..."
args = [...]

[user_section]
preserved = "verbatim"
```

**Write algorithm:**

1. Read existing file (if present); parse; extract `_bgng` block (or empty if first write).
2. For each managed key/section, compute the current hash from the file's content; compare with the stored hash.
3. **Hash mismatch ⇒ drift.** Refuse write with the §8.4 message; offer `--force`.
4. Compute new values from effective state; hash them.
5. If new hashes match stored hashes (no source change) AND on-disk hashes match stored hashes (no drift): **skip the write entirely** (idempotency).
6. Otherwise: write the file. Layout = managed keys/sections + non-managed keys/sections (preserved verbatim) + updated `_bgng` block.

#### 8.3.3 Cursor `.cursor/mcp.json` — generated-file-plus-symlink

Cursor reads a standalone JSON file. There is no user content to coexist with — the file is fully bgng-owned. The cleanest mechanism is the one in use today:

```text
<scope>/.agents/bgng/generated/cursor-mcp.json   # bgng writes this
<scope>/.cursor/mcp.json → ../.agents/bgng/generated/cursor-mcp.json
```

- bgng writes the rendered JSON to the generated path.
- `.cursor/mcp.json` is a symlink to it.
- **No `_bgng` block** in `cursor-mcp.json` — the file is fully bgng-owned. Cursor's UI is not asked to render a meta-block it doesn't recognize.
- Drift detection: is `.cursor/mcp.json` still a symlink to where we recorded? If the user replaced it with a real file, treat as drift; refuse with `--force` (restoring the symlink overwrites the user's replacement).

This mechanism does *not* extend to `settings.json` / `config.toml` because those files have user content that must coexist with bgng-managed regions — a symlink would force-own the whole file.

### 8.4 Drift handling

`bgng write` refuses by default when managed regions have been hand-edited:

```text
$ bgng write
Drift detected in managed regions:
  .claude/settings.json
    mcpServers — content differs from last write (sha256 mismatch)

Resolutions:
  - To discard the hand-edits and rewrite from card+overlay:
      bgng write --force
  - To preserve the hand-edits as project-specific intent:
      move them into .agents/bgng/config.json's `servers` field, then re-run write
```

For symlink-based targets (skills, cursor):

```text
Drift detected:
  .cursor/mcp.json — replaced with a regular file (was a symlink)

Resolutions:
  - To restore the symlink and overwrite:
      bgng write --force
  - To preserve the file as project-specific intent:
      move its content into .agents/bgng/config.json, then re-run write
```

Files bgng doesn't own (e.g. a `<project>/.claude/skills/custom-skill/` directory the user created) are *never* deleted. Doctor reports them as unmanaged.

### 8.5 Cleanup across transitions

When a card is removed or its skill list changes, the next `write` cleans up safely using the write-record:

```text
1. Build the *desired* set of materialized paths from the new effective state.
2. Read the *previous* set from write-record.json.
3. to_remove = previous - desired
   to_add    = desired - previous
   to_verify = previous ∩ desired
4. For symlinks in to_remove:
     unlink only if the path is still a symlink to the recorded target.
     If a user replaced it with their own content, leave it and warn.
5. For managed fields in to_remove:
     restore to default (often: remove from parent object), only if the
     on-disk hash matches the last recorded write-record hash.
6. For generated-file-plus-symlink targets in to_remove:
     remove the generated file; restore .cursor/mcp.json to whatever was
     there before (if recorded), or remove the symlink.
7. Re-record write-record.json with the new managedPaths[].
```

Safe cleanup requires both ends of the diff to be present: write-record (for `previous`) and effective state (for `desired`). If write-record is missing or corrupt (§5.1), cleanup degrades to a no-op for that run with a warning.

### 8.6 Disabled targets and `file:` cards

- A target disabled in the overlay (e.g. `targets: { cursor: { enabled: false } }`) skips materialization. Pre-existing `<scope>/.cursor/` stays on disk; doctor can flag.
- `file:` cards: on every `bgng write`, the integrity hash is recomputed; if different from lockfile, the lockfile is updated with a one-line note. Drift detection on the materialized side still applies. Users iterating on a `file:` card should expect lockfile churn in their git working tree.

### 8.7 Idempotency invariant

Running `bgng write` twice in a row with no card or overlay changes between them produces zero disk writes on the second invocation. This is the property that makes the system safe to run in postinstall hooks, CI, scripts. It is **tested explicitly** at §11.4.

---

## 9. Distribution

| Channel | v1 | v2 |
|---|---|---|
| npm registry (`@scope/name@<range>`) | ✓ | ✓ |
| Local file path (`file:<path>`) | ✓ | ✓ |
| Git URL (`git+ssh://...`, `git+https://...#tag`) | — | ✓ |
| Remote store sync (`bgng store push/pull` to any git remote) | — | ✓ |

The lockfile records the resolved origin URL + integrity hash for each card, so a teammate cloning a project can re-fetch from the recorded source without ambiguity. No central registry service is ever built — npm and existing git hosts handle distribution; the local store handles authoritative content.

---

## 10. Resolved Open Questions

| Question | Resolution |
|---|---|
| Single card vs many per project | **Many.** `cards: []` is an ordered array; merge last-wins. |
| Card content: pure manifest or with inline content | **Manifest + optional inline content.** A card npm package can ship its own skills / MCP defs. |
| Card layering with machine defaults | **Card replaces machine defaults for adopting projects.** No four-layer merge. |
| Distribution channels v1 | **npm + `file:`.** Git URLs in v2. |
| Project file shape | **Single manifest (`config.json`) + sibling lockfile (`card.lock`) + sibling write-record (`write-record.json`).** |
| Store substrate | **pnpm-style immutable versioned directories.** No git in the store; optional git at source level (`sources/<scope>/<name>/`). |
| Authoring location convention | **`~/.agents/bgng/sources/<scope>/<name>/`.** |
| Write-record naming | **`write-record.json`** (not `write-manifest.json` — avoid overload with "card manifest"). |
| Default `bgng card status` verbosity | **Summary.** `--explain` dumps the full trail; `--why <category>:<name>` for a single concern. |
| `bgng store prune` cache-eviction | **v1.5,** after observing real disk-usage patterns. |
| Multi-card same-server-different-definition | **Flag with warning.** Last-wins resolves; silent overrides are debugging traps. |
| Multi-card same-bundle-different-range | **Intersect ranges, pick highest; fail on empty intersection.** §7.7. |
| Inline content validation at publish | **SKILL.md frontmatter parsed and validated;** MCP definitions checked for non-empty only. |
| `publishedBy` identity in cards | **Not by default.** Optional behind a future `--with-identity` flag if needed. |
| Materialization scope | **Project-scoped writes for projects** (`<project>/.claude/` etc.); global writes for outside-any-project use. |
| Schema versioning | **`version: 1` field in project config** as forward-looking insurance. |
| Single-card shorthand | **Dropped.** Array form only. One shape to teach. |
| `bgng add extension` (legacy) | **Gone.** Replaced by `bgng extensions add`; no deprecation period (clean cut). |
| `bgng scan` (legacy placeholder) | **Preserved as-is** as a non-card discovery surface. Cards-specific discovery uses `bgng card list` / `bgng card show`. |
| MCP server definition resolution under cards | **Three-layer:** card-inline > user library > packaged baseline. No `mcpBundles` in v1. (§5.2.1) |
| Cursor materialization mechanism | **Generated-file-plus-symlink** (preserved from current behavior). No `_bgng` in cursor's mcp.json. (§8.3.3) |
| `_bgng` meta-block field name | **`_bgng`** (one underscore prefix; minimizes collision with tool-owned keys). |
| `--why` ambiguity | **`<category>:<name>` syntax** with bare-name fallback that searches all and aborts on ambiguity. (§6.6.1) |
| `--write` chaining rollback semantics | **No rollback.** Mutation is preserved on chained-write failure; user reruns `bgng write`. (§6.6.2) |
| Card source git initialization | **Yes by default,** with `--no-git` opt-out. |
| Card author scope assignment | **Persisted in `machine.json` under `authoring.scope`;** prompt on first `bgng card new` if absent. |

### 10.1 Schema URL hosting

The `$schema` URL in card manifests is `https://schemas.bgng.dev/card/1.json`. Hosting decision: ship the schema files in the npm package (under `schemas/`) and host them via a thin redirect from the schemas.bgng.dev domain. The redirect handles version routing (`/card/1.json` → `https://unpkg.com/bgng@latest/schemas/card/1.json` or equivalent). Editors that resolve `$schema` URLs get the validation; the canonical source remains the npm package.

---

## 11. Testing Strategy

### 11.1 Unit-level (TDD targets)

| Module | What gets tested |
|---|---|
| Manifest validator | Well-formed accept; malformed reject |
| Lockfile validator | Round-trip; integrity hash format; origin shape |
| Project config validator | Schema with `cards` array; overlay fields; defaults |
| Write-record validator | Schema; missing/corrupt fallback; atomic-write fault injection |
| Specifier parser | `@scope/name@range`, `@scope/name`, `file:path` |
| Semver range matcher | npm-style ranges incl. prereleases |
| **Merge algorithm** | Cards in declared order; last-wins; overlay applies last |
| **Structural diff classifier** | Major/minor/patch detection per §7.1 |
| **MCP server resolution** | Three-layer precedence per §5.2.1 |
| **Bundle conflict resolver** | Intersection algorithm per §7.7 |
| Content hash | Stable across runs; sensitive to any change |
| Managed-field hash | Stable across reparse cycles; insensitive to key ordering |
| Write-plan computer | `diff(desired, previous) → ops list` |

### 11.2 Integration-level (filesystem + CLI, mocked network)

Coverage of every authoring command (`new`, `publish`, `deprecate`, `diff`), every consumer command (`apply`, `add`, `remove`, `pin`, `update`, `outdated`, `detach`), every inspection command (`list`, `show`, `status`), and full `write` lifecycle (initial materialization, transition cleanup, drift detection, drift recovery, three-mechanism materialization, scope discrimination).

### 11.3 End-to-end (real CLI in tempdirs)

- Author journey: `new` → edit → `publish` → `diff` → `deprecate`
- Consumer journey: `init` → `apply` → `add` → `write` → modify overlay → `write` → `update` → `write`
- Migration journey: pre-cards fixture → `store migrate` → cards journey on the migrated layout → `store migrate --cleanup-legacy-orphans` after first project write
- `file:` development loop
- Drift recovery (Claude/Codex managed fields, cursor symlink replacement)
- Card replacement (full transition)

### 11.4 Property/invariant tests

| Invariant | Statement |
|---|---|
| Immutability | Published version V never gets overwritten. |
| **Idempotency** | `bgng write` twice in a row → zero `result.changes` entries on the second invocation. Tested at fixture level for: empty project, project with one card, project with multiple cards, project with overlay-only, machine scope. |
| Reproducibility | Same lockfile + same store = byte-identical effective state. |
| Cleanup completeness | After `bgng card remove X`, no bgng-owned path under the scope's materialized dirs traces to X. |
| Lockfile completeness | Lockfile applied from scratch on a fresh store fetches and resolves exactly. |
| Scope isolation | `bgng write` inside a project never modifies paths under `~/.claude/`, `~/.codex/`, `~/.cursor/`; `bgng write` outside any project never modifies paths under any project's `.claude/`, etc. |
| Migration atomicity | Failure between any two steps of §4.5.2 leaves recoverable state (either old layout intact or archive available). |
| Bundle conflict surfacing | Disjoint range constraints across cards always produce the error message of §7.7 (never silent resolution). |

### 11.5 Negative tests

Invalid manifest at publish; unknown specifier scheme at apply; lockfile integrity mismatch; `harness.minVersion` exceeded; remove of unknown name; add of duplicate; drift refused without `--force`; deprecated version warning surface; broken `file:` target; corrupt write-record fallback; toggling an undefined MCP server.

### 11.6 Test infrastructure

- **Tempdir store + project.** Tests use the existing `AGENTS_HOME_DIR` / `AGENTS_DIR` environment variables already wired through `cli/context.ts` and `test/helpers.ts`; the store lives at `<AGENTS_DIR>/bgng/`.
- **No new store-root env var in v1.** Do not introduce `BGNG_STORE_ROOT`; it duplicates `AGENTS_DIR` and would create two competing isolation paths in tests.
- **Mocked registry.** File-system-backed fixture registry. No real network in CI.
- **Platform expectations.** macOS + Linux symlink path tested fully; Windows runs a reduced suite until v2 ships a copy fallback.

### 11.7 What we don't test

That npm works; that the filesystem supports symlinks; that Claude / Codex / Cursor correctly read what we write; internal implementation details of existing namespaces beyond their surface contracts.

---

## 12. Genuinely Open Questions

These require a call during implementation but do not block the next iteration of the architecture or the M0 milestone.

1. **Claude Code / Codex / Cursor per-project read verification.** Section §8.3 commits to project-local materialization on the assumption that each of these tools reads `<project>/.claude/skills/`, `<project>/.codex/skills/`, `<project>/.cursor/mcp.json` natively when run from the project. This is the documented behavior today but a third-party contract; **before M6 lands, verify the current read semantics empirically against each tool's docs** and document in `02_per-project-config-guide.md`.
2. **Default port/sort order in `bgng card list`.** Alphabetical by name? Most-recently-published first? Most-frequently-applied first? Lean: alphabetical by `@scope/name`; future flags for alternative sorts.
3. **`bgng card outdated` exit code.** Lean: zero by default (it's informational); `--check` flag for CI semantics that returns non-zero when updates exist.
4. **Extension versioning.** Cards are versioned. Bundles are versioned. Extensions (`markitdown`, `beads`, `parallel`) are not. Lean: keep extensions un-versioned in v1; revisit at v2 if real demand for versioned-extension semantics emerges.

---

## 13. v2 Roadmap (Deferred Deliberately)

| Feature | Trigger to revisit |
|---|---|
| Git URL specifiers | Users without npm access |
| Store remote sync (`bgng store push/pull`, `bgng store remote …`) | Multi-machine users hit pain |
| Windows project-scoped writes via copy fallback | Windows usage becomes non-trivial |
| Transitive card deps (cards depending on cards) | Users want composition inside cards, not just at project level |
| `bgng card move` for reordering | Reordering becomes frequent in practice |
| Card parameters (Helm-like values) | Real demand for parameterized cards that overlay can't express |
| Built-in starter cards | New-user onboarding shows friction |
| Card publishing identity / signing | Mixed-trust distribution environments |
| `mcpBundles` field on cards | Real demand for npm-distributed MCP server definitions |
| Auto-migration on first invocation | Adoption metrics show users delaying `bgng store migrate` |
| `bgng store repair` automated recovery | Migration failure rate justifies the surface |
| Content-addressable store deduplication (`~/.agents/bgng/blobs/<sha256>/`) | Disk usage from many card versions with overlapping inline content becomes a real cost (per `analyses/32_…` R3) |
| `--strict` flag for `bgng card apply` / `add` (escalate multi-card warnings to refusals) | Users running cards in CI want hard guarantees rather than warnings (per `analyses/32_…` R4) |
| SLSA-style provenance attestation (`bgng card publish --with-provenance`, `bgng card apply --verify-provenance`) | Mixed-trust distribution environments need supply-chain assurance beyond `npm + sha256` (per `analyses/32_…` R7) |
| Optional Flox bridge (`runtime.flox` manifest field, `bgng card apply --emit-flox`) | Adoption shows users layering Flox alongside cards and manually syncing `manifest.toml` (per `analyses/32_…` R10) |

Principle: defer everything that can be added without breaking the v1 schema or store layout.

---

## 14. Surface Summary and Behavior Changes

### 14.1 Additive surface

What the introduction of cards adds:

- **2 new namespaces:** `bgng card`, `bgng store`
- **2 new top-level aliases:** `bgng apply`, `bgng update`
- **1 new command in an existing namespace:** `bgng extensions add`
- **1 renamed file:** `~/.agents/bgng/config.json` → `~/.agents/bgng/machine.json`
- **2 new project-local files:** `.agents/bgng/card.lock` (git-tracked), `.agents/bgng/write-record.json` (gitignored)
- **1 new machine-scope file:** `~/.agents/bgng/global-write-record.json`
- **3 new directories in the store:** `cards/`, `sources/`, `generated/` (the last preserved from current location, moved into the store)
- **2 folded-in directories with shape change:** `~/.agents/library/mcp-servers.json` (single file) → `~/.agents/bgng/mcp-servers/<id>.json` (directory of per-server files); `~/.agents/packages/skills/` → `~/.agents/bgng/skills/`
- **1 new universal flag:** `--why <category>:<name>` (`bgng status`)
- **1 new mutating-command flag pattern:** `--write` chaining (no rollback)

### 14.2 Behavior changes for existing users (the cuts)

The clean-cut release breaks behavior in four ways. Each is intentional; none is auto-mitigated by a deprecation shim.

1. **Materialization scope shifts from global to project-local** for any directory with `.agents/bgng/config.json` in its ancestry. `bgng write` in a project no longer touches `~/.claude/skills/`, `~/.codex/skills/`, `~/.cursor/mcp.json`. Tools running from the project read project-local state; tools running from the user's home (outside any project) read machine-scope state.
2. **`bgng write` refuses on drift** in regions it manages. Hand-edits to `mcpServers` (in `settings.json` or `config.toml`) are surfaced. The user either re-runs with `--force` to overwrite, or promotes the change into the project config to keep it.
3. **`bgng add extension` is removed without a deprecation period.** Replaced by `bgng extensions add`. Any user automation calling the old form breaks on upgrade.
4. **Legacy global skill directories (`~/.claude/skills/`, `~/.codex/skills/`) are not auto-cleaned.** Pre-cards bgng materialized them; project-local materialization leaves them stale. `bgng doctor` flags them; `bgng store migrate --cleanup-legacy-orphans` is the explicit removal path.

These are the cuts. They are the right call for a pre-1.0 tool — carrying schema-branching, dual-write code paths, and deprecation shims for years to spare a handful of users a one-time `bgng store migrate` would be the worse failure mode. Section 15's milestones sequence the work so each cut lands with a tested recovery path.

---

## 15. Implementation Milestones

Eight PR-able milestones, each with explicit dependencies and the strategies it lands. Aligned with `28_harness-cards-architecture-assessment.md` Appendix §A3.

| Milestone | Lands | Depends on |
|---|---|---|
| **M0 — Cards prep + CLI gap fixes** | Orphan flag removal (`search mcp`/`skill`); `--json` parity on `skills curate`/`uncurate`; `details`/`examples` template on `init`. Architecture-doc revision (this document) finalized. | — |
| **M1 — Store schema + path resolvers + migration** | New store layout in `cli/core/store-paths.ts`; legacy resolvers remain only for migration input and are marked deprecated; `bgng store migrate` command; `store.json`; `mcp-servers.json` → `mcp-servers/*.json` shape change; `AGENTS_DIR`-based test isolation; legacy-trigger warning. | M0 |
| **M2 — Write-record + idempotency test + cleanup engine** | `write-record.json` schema, atomic writes, corruption fallback; cleanup logic using write-record; idempotency property test. Old path resolvers removed at end of M2. | M1 |
| **M3 — `_bgng` meta-block for Claude/Codex; preserved Cursor pattern** | Hash-tracked managed-key/section writes; drift refusal with `--force`; Cursor mechanism preserved with the symlink-drift check. | M2 |
| **M4 — Card manifest + lockfile + author commands** | `card.json` schema, validator; `card.lock`; `bgng card new/publish/diff/deprecate`; structural diff classifier. | M2 (no card-side write yet, so doesn't strictly depend on M3) |
| **M5 — Card consumer commands + MCP resolution + bundle conflict** | `bgng card apply/add/pin/remove/update/outdated/detach/list/show/status`; top-level `apply`/`update` aliases; three-layer MCP resolution; bundle conflict algorithm; `--write` chaining. | M3, M4 |
| **M6 — Project-local materialization** | `resolveToolPaths(scope)` discriminated union; `syncRepository` scope-aware; legacy-orphan scan during migration. Re-run idempotency tests on new fixtures. | M5 |
| **M7 — Extended `status`/`doctor` with `--explain` / `--why`** | Diagnostics refactor into section builders; cards/store sections; `--why <category>:<name>` syntax; ambiguity hints. | M6 |

---

## 16. Next Steps

1. **Keep this document as the authoritative v1 architecture revision.** Archive `26_harness-cards-target-architecture.md` to `analyses/26_archive/` per `.ai/rules/00_docs_usage.md` during the docs portion of M0.
2. **Keep `.ai/tasks/14_harness-cards-implementation-plan.md` in sync with this document.** The task plan owns execution granularity; this document owns target architecture.
3. **Begin with an M0 baseline-sync PR, not a from-scratch M0 PR.** The current working tree already contains several M0 code changes; M0 now verifies and completes that baseline, then lands the missing command rename and docs lifecycle work.
4. **Verify per-project read semantics** for Claude Code, Codex, Cursor (per §12 question 1) before M6 begins. Document in `02_per-project-config-guide.md`.

---

## Appendix

### A1. Cross-reference to the assessment strategies

| Section in this document | Strategy in `28_harness-cards-architecture-assessment.md` |
|---|---|
| §4.3, §4.5 (store layout shape + migration) | S1, S7 |
| §4.1, §14.2 #1 (materialization scope shift) | S2 |
| §8.3 (three mechanisms) | S3 |
| §5.1, §8.4, §8.5 (write-record + drift + cleanup) | S4 |
| §5.2.1 (three-layer MCP resolution) | S5, revised in v1.1 to preserve user-overrides-baseline behavior |
| §7.7 (bundle conflict) | S6 |
| §6.6.1 (`--why` syntax) | S8 |
| §6.7 (diagnostics extension) | S9 |
| §4.4, §6.5 (`bgng scan` preserved) | S10 |
| §6.6.2 (`--write` no rollback) | S11 |
| §6.5, §15 M0 (CLI gap fixes in M0) | S12 |
| §8.7, §11.4 (idempotency property test) | S13 |
| §11.6 (`AGENTS_DIR` test isolation; no new store-root env var) | S14 course-correction |
| This document as a whole | S15 |

### A2. Document lifecycle

- **v1 draft** (`26_harness-cards-target-architecture.md`, 2026-05-18): superseded by this document on adoption.
- **v1.1** (this document, 2026-05-20): final architecture revision for the Harness Cards v1 implementation.
- **Future revisions:** if the architecture changes again before v1 ships, increment the file number rather than editing in place (`30_…`, `31_…`); archive superseded versions to `analyses/<N>_archive/` per the docs-usage rule.
