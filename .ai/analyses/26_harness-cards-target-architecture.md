# Harness Cards: Target Architecture

Status: target architecture design, handoff-ready. Outcome of a full brainstorming pass; ready for implementation planning.

Date: 2026-05-18

Related artifacts:
- `.ai/knowledges/02_per-project-config-guide.md` — current per-project config model that this design builds on.
- `.ai/knowledges/03_npm-skill-bundles-guide.md` — current skill-bundle ingestion model that influences the store layout.

## 1. Executive Summary

Harness Cards introduce a new abstraction to `bgng`: **named, semver-versioned, reusable bundles of harness intent** that a project can pin to. A card declares which skills, MCP servers, extensions, and downstream targets a project should run on. Cards are immutable once published, stored locally under `~/.agents/bgng/cards/<scope>/<name>/<version>/`, and reference-able from any project's `.agents/bgng/config.json`.

The design is **clean-cut**: no backward-compatibility layer, one canonical schema, one canonical CLI surface, one materialization path. Existing project configs without a `cards` field remain valid (degenerate case: empty cards array), but every project benefits from the same new behaviors — project-scoped writes, integrity-checked materialization, drift detection.

Distribution leans on existing infrastructure: npm in v1, git URLs in v2, no custom registry service ever. The local store is the source of truth; remotes are sync targets.

The mental model is **"uv/pnpm for harnesses"** with one refinement — the store is *local-authoritative* (the user's own published cards live there as canonical), not merely a download cache.

## 2. Motivation

The current `bgng` model has three layers of intent: machine defaults (`~/.agents/bgng/config.json`), project overlay (`<project>/.agents/bgng/config.json`), and named extensions. This works for a single configuration per machine, but breaks down for two real use cases:

1. **Reuse across projects.** A user with a "backend service" harness setup wants to apply the same setup to a new project without retyping. Today's only mechanism is hand-copying overlay JSON between repos.
2. **Versioned improvement.** A user iterating on their harness wants to capture "the way I had it working in March" so they can either roll back or compare to "the way it works now." Today's only mechanism is git history of the config file.

Cards solve both. A card is the named, versioned, immutable unit. Projects pin to versions; authors publish new versions; the local store keeps history of releases.

## 3. Vocabulary

| Term | Meaning |
|---|---|
| **Card** | A named, versioned bundle of harness intent (manifest + optional inline content). |
| **Store** | The local-authoritative content layer at `~/.agents/bgng/`. Holds published cards, in-progress card sources, standalone skill bundles, MCP server definitions, machine state. |
| **Source** | An editable card under `~/.agents/bgng/sources/<scope>/<name>/`. Authoring happens here. |
| **Published card** | An immutable directory under `~/.agents/bgng/cards/<scope>/<name>/<version>/`. Created by `publish`. |
| **Manifest** | The user-edited declaration: a card's `card.json` or a project's `.agents/bgng/config.json`. |
| **Lockfile** | The system-generated `<project>/.agents/bgng/card.lock` recording exact resolved versions + integrity hashes. |
| **Overlay** | The project-specific deviation from cards: `skills`/`servers`/`extensions`/`targets` fields in the project config, applied last in the merge stack. |
| **Apply** | The project-side act of pinning to a card version and producing a lockfile. Mutates project files only. |
| **Publish** | The author-side act of snapshotting a source into the store as an immutable version. |
| **Write** | The materialization step that pushes effective state into the project's `.claude/`, `.codex/`, `.cursor/` directories. |
| **Write-record** | Generated `<project>/.agents/bgng/write-record.json` recording what `bgng write` last materialized; used for drift detection and cleanup. |
| **Effective state** | The merged result of cards (in declared order) and the project overlay; the input to `write`. |

## 4. Architectural Overview

### 4.1 The merge stack

For projects with cards:

```text
built-in defaults  →  user library (standalone skills/MCP)  →  cards (in declared order)  →  project overlay
```

`bgng write` materializes the resulting effective state into project-local directories. Machine defaults (the legacy `~/.agents/bgng/` config) **are not in the stack** for projects — they apply only to materialization that happens outside any project (when `bgng write` is run from a directory that has no `.agents/bgng/config.json` in its ancestry).

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

The three novel properties — local-authoritative content, separate materialization, per-project overlay — are what distinguish this from a pure package-manager analogy.

### 4.3 Store layout

```text
~/.agents/bgng/
├── cards/                              # published immutable versions
│   ├── @me/
│   │   └── backend-service/
│   │       ├── 1.0.0/
│   │       │   ├── card.json
│   │       │   ├── skills/             # optional inline content
│   │       │   ├── mcp-servers/        # optional inline content
│   │       │   └── .integrity          # sha256 of directory tree
│   │       ├── 1.1.0/
│   │       └── versions.json           # { "latest": "1.1.0", "available": [...], "deprecated": {} }
│   └── third-party/...                 # cards fetched from npm
├── sources/                            # editable card sources
│   └── @me/
│       └── backend-service/            # author iterates here; optional .git/
├── skills/                             # standalone skill bundles (was ~/.agents/packages/skills/)
│   └── @scope/<pkg>/<version>/
├── mcp-servers/                        # standalone MCP definitions (was ~/.agents/library/)
├── cache/                              # transient: fetched tarballs, http payloads
├── machine.json                        # machine-wide state (active default card for project-less use, etc.)
└── store.json                          # store metadata: schema version, init timestamp
```

The store is **not** a git repo. Versioning is by directory (immutable releases); history of *authoring* a card is the author's concern (typically `git init` inside `sources/<scope>/<name>/` if they want it).

### 4.4 Layering interaction with the existing harness

Existing concepts (skills, MCP servers, extensions, machine defaults) are unchanged in shape and ingestion. What changes:

- `~/.agents/library/` and `~/.agents/packages/skills/` fold into the store at `~/.agents/bgng/skills/` and `~/.agents/bgng/mcp-servers/` via a one-shot first-run migration.
- `~/.agents/bgng/config.json` (the legacy machine-defaults file) is renamed to `~/.agents/bgng/machine.json`; the role is preserved.
- All other existing CLI commands keep their current behavior.

## 5. Schemas

### 5.1 Card manifest — `card.json`

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
- `harness.minVersion`: backstop. Apply fails loudly if installed bgng is older.
- `bundles`: standalone skill-bundle dependencies. Resolved like card dependencies but materialized under `~/.agents/bgng/skills/`.
- `skills.include`: explicit list. Inline skills shipped at `<card>/skills/<name>/` are *not* implicitly enabled; the author lists every desired skill by name. Explicit > implicit.
- **No `skills.exclude`** at the card level. A card is a baseline; there is nothing yet to exclude from. Excludes only make sense in the project overlay.

### 5.2 Project config — `<project>/.agents/bgng/config.json`

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

### 5.3 Lockfile — `<project>/.agents/bgng/card.lock`

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

- One `cards[]` entry per `cards[]` element, preserving declared order. Each entry carries everything needed to re-fetch and verify.
- `origin: "store"` means the card was published locally and didn't come from an external source. A teammate without access to your store will fail loudly at `write` — a signal you forgot to publish to a shared location.
- No `resolved` summary field. Effective state is computed on the fly during `write`; the lockfile is for *pinning*, not for *summarizing*.
- **Git-tracked.** The lockfile is the reproducibility contract; gitignoring it defeats the point.

### 5.4 Write-record — `<project>/.agents/bgng/write-record.json`

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
    }
  ]
}
```

Notes:

- **Gitignored.** Per-machine, regenerable, never committed.
- Enables clean diffs across writes, drift detection in managed fields, and orphan-symlink cleanup across card transitions.

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
| `bgng card new <name>` | — | Scaffold a card source. Flags: `--from-project`, `--from-card <ref>` |
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
| `bgng card status [--explain]` | — | Project's card state. `--explain` dumps full resolution trail for every effective decision. |

### 6.4 `bgng store` namespace

| Command | Status | Purpose |
|---|---|---|
| `bgng store status` | v1 | Schema version, size, card count, sources count |
| `bgng store migrate` | v1 | Upgrade store layout when `store.json` schema is behind |
| `bgng store prune` | v1.5 | Remove unreferenced/old card versions |
| `bgng store remote add <name> <url>` | v2 | Configure sync remote |
| `bgng store remote remove <name>` | v2 | |
| `bgng store push` | v2 | Sync local store → remote |
| `bgng store pull` | v2 | Sync remote → local store |

### 6.5 Existing namespaces

`bgng skills`, `bgng mcp`, `bgng extensions`, `bgng library` are unchanged in behavior. One addition under the clean-cut policy:

- `bgng extensions add <name>` is the canonical form for adding an extension to the user library. The previous top-level `bgng add extension <name>` does not exist in the cards release.

### 6.6 Universal flags

| Flag | Applies to | Meaning |
|---|---|---|
| `--dry-run` | All mutating commands | Preview without writing |
| `--write` | `apply`, `add`, `pin`, `remove`, `update`, top-level aliases | Chain into `bgng write` after the operation |
| `--json` | All commands with structured output | Machine-readable output |
| `--explain` | `bgng card status`, `bgng status` | Dump full resolution trail |
| `--why <name>` | `bgng status` | Dump resolution trail for a single skill/server/extension |

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

Prereleases excluded unless the constraint opts in (`^1.2.0-beta`). `file:` specifiers skip steps 2–6 and resolve to whatever the on-disk manifest declares now (integrity computed but not enforced across runs).

### 7.5 Deprecation surfacing

Deprecation is a soft signal — warns on apply/add/update/status, never refuses. Pinned reproducibility is absolute.

### 7.6 Multi-card conflict warnings

When `bgng card apply`/`add`/`update`/`write` produces a configuration where two cards declare the same server/extension/target with *different definitions* (not merely toggling enabled), the resolution proceeds (last-wins) and emits a warning identifying the conflicting fields. Silent overrides are debugging traps; surfacing them prevents that class of confusion.

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
1. Verify  → lockfile present; integrity passes for every locked card
2. Resolve → merge cards in declared order; apply project overlay last
3. Plan    → diff desired state against prior write-record
4. Detect  → hand-edits in managed regions → drift
5. Execute → symlinks + managed-field updates (or print under --dry-run)
6. Record  → write-record captures what we did, for the next run's diff
```

### 8.3 Materialization targets

```text
<project>/.claude/
├── CLAUDE.md                           # user-owned; bgng never touches
├── skills/
│   ├── parallel-web-search → ~/.agents/bgng/cards/@me/baseline/1.2.0/skills/parallel-web-search
│   ├── research-deep-dive  → ~/.agents/bgng/cards/@me/extras/2.0.3/skills/research-deep-dive
│   └── beads-task-tracking → ~/.agents/bgng/skills/@scope/beads-pkg/1.0.0/skills/beads-task-tracking
└── settings.json                       # bgng owns specific fields; rest is user-owned
```

Two distinct mechanisms:

- **Directory symlinks for skills.** One symlink per skill, pointing at an immutable card-version directory in the store. Absolute targets; broken-link detection via `readlink` + `stat`.
- **Field-level management for settings files.** A `_bgng` meta-field declares which top-level keys are managed; bgng rewrites only those fields, leaving the rest of the file untouched. JSON for Claude/Cursor settings; TOML's `[_bgng]` table for Codex.

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

Files bgng doesn't own (e.g. a `<project>/.claude/skills/custom-skill/` directory the user created) are *never* deleted. Doctor reports them as unmanaged.

### 8.5 Cleanup across transitions

When a card is removed or its skill list changes, the next `write` cleans up:

1. Build the *desired* set of materialized paths from the new effective state.
2. Read the *previous* set from `write-record.json`.
3. `to_remove = previous - desired`; `to_add = desired - previous`; `to_verify = previous ∩ desired`.
4. For symlinks in `to_remove`: `unlink` only if the file is still a symlink to the same store path recorded. If a user replaced it with their own content, leave it and warn.
5. For managed fields in `to_remove`: restore to default (often: remove from parent object), only if the hash matches the last write.
6. Re-record `write-record.json`.

### 8.6 Disabled targets and `file:` cards

- A target disabled in the overlay (e.g. `targets: { cursor: { enabled: false } }`) skips materialization. Pre-existing `<project>/.cursor/` stays on disk; doctor can flag.
- `file:` cards: on every `bgng write`, the integrity hash is recomputed; if different from lockfile, the lockfile is updated with a one-line note. Drift detection on the materialized side still applies.

### 8.7 Idempotency invariant

Running `bgng write` twice in a row with no card or overlay changes between them produces zero disk writes on the second invocation. This is the property that makes the system safe to run in postinstall hooks, CI, scripts.

## 9. Distribution

| Channel | v1 | v2 |
|---|---|---|
| npm registry (`@scope/name@<range>`) | ✓ | ✓ |
| Local file path (`file:<path>`) | ✓ | ✓ |
| Git URL (`git+ssh://...`, `git+https://...#tag`) | — | ✓ |
| Remote store sync (`bgng store push/pull` to any git remote) | — | ✓ |

The lockfile records the resolved origin URL + integrity hash for each card, so a teammate cloning a project can re-fetch from the recorded source without ambiguity. No central registry service is ever built — npm and existing git hosts handle distribution; the local store handles authoritative content.

## 10. Resolved Open Questions

| Question | Resolution |
|---|---|
| Single card vs many per project | **Many.** `cards: []` is an ordered array; merge last-wins. |
| Card content: pure manifest or with inline content | **Manifest + optional inline content.** A card npm package can ship its own skills / MCP defs. |
| Card layering with machine defaults | **Card replaces machine defaults for adopting projects.** No four-layer merge. |
| Distribution channels v1 | **npm + `file:`.** Git URLs in v2. |
| Project file shape | **Single manifest (`config.json`) + sibling lockfile (`card.lock`).** |
| Store substrate | **pnpm-style immutable versioned directories.** No git in the store; optional git at source level (`sources/<scope>/<name>/`). |
| Authoring location convention | **`~/.agents/bgng/sources/<scope>/<name>/`.** |
| Write-record naming | **`write-record.json`** (not `write-manifest.json` — avoid overload with "card manifest"). |
| Default `bgng card status` verbosity | **Summary.** `--explain` dumps the full trail; `--why <name>` for a single decision. |
| `bgng store prune` cache-eviction | **v1.5,** after observing real disk-usage patterns. |
| Multi-card same-server-different-definition | **Flag with warning.** Last-wins resolves; silent overrides are debugging traps. |
| Inline content validation at publish | **SKILL.md frontmatter parsed and validated;** MCP definitions checked for non-empty only. |
| `publishedBy` identity in cards | **Not by default.** Optional behind a future `--with-identity` flag if needed. |
| Materialization scope | **Project-scoped writes for projects** (`<project>/.claude/` etc.); global writes for outside-any-project use. |
| Schema versioning | **`version: 1` field in project config** as forward-looking insurance. |
| Single-card shorthand | **Dropped.** Array form only. One shape to teach. |
| `bgng add extension` (legacy) | **Gone.** Replaced by `bgng extensions add`; no deprecation period (clean cut). |

## 11. Testing Strategy

### 11.1 Unit-level (TDD targets)

| Module | What gets tested |
|---|---|
| Manifest validator | Well-formed accept; malformed reject |
| Lockfile validator | Round-trip; integrity hash format; origin shape |
| Project config validator | Schema with `cards` array; overlay fields; defaults |
| Specifier parser | `@scope/name@range`, `@scope/name`, `file:path` |
| Semver range matcher | npm-style ranges incl. prereleases |
| **Merge algorithm** | Cards in declared order; last-wins; overlay applies last |
| **Structural diff classifier** | Major/minor/patch detection per §7.1 |
| Content hash | Stable across runs; sensitive to any change |
| Write-plan computer | `diff(desired, previous) → ops list` |

### 11.2 Integration-level (filesystem + CLI, mocked network)

Coverage of every authoring command (`new`, `publish`, `deprecate`, `diff`), every consumer command (`apply`, `add`, `remove`, `pin`, `update`, `outdated`, `detach`), every inspection command (`list`, `show`, `status`), and full `write` lifecycle (initial materialization, transition cleanup, drift detection, drift recovery).

### 11.3 End-to-end (real CLI in tempdirs)

- Author journey: `new` → edit → `publish` → `diff` → `deprecate`
- Consumer journey: `init` → `apply` → `add` → `write` → modify overlay → `write` → `update` → `write`
- `file:` development loop
- Drift recovery
- Card replacement (full transition)

### 11.4 Property/invariant tests

| Invariant | Statement |
|---|---|
| Immutability | Published version V never gets overwritten. |
| Idempotency | `bgng write` twice in a row → zero disk writes on second run. |
| Reproducibility | Same lockfile + same store = byte-identical effective state. |
| Cleanup completeness | After `bgng card remove X`, no bgng-owned path under project's materialized dirs traces to X. |
| Lockfile completeness | Lockfile applied from scratch on a fresh store fetches and resolves exactly. |

### 11.5 Negative tests

Invalid manifest at publish; unknown specifier scheme at apply; lockfile integrity mismatch; `harness.minVersion` exceeded; remove of unknown name; add of duplicate; drift refused without `--force`; deprecated version warning surface; broken `file:` target.

### 11.6 Test infrastructure

- **Tempdir store + project.** `BGNG_STORE_ROOT` env var redirects the store; tests run in isolated tempdirs.
- **Mocked registry.** File-system-backed fixture registry. No real network in CI.
- **Platform expectations.** macOS + Linux symlink path tested fully; Windows runs a reduced suite until v2 ships a copy fallback.

### 11.7 What we don't test

That npm works; that the filesystem supports symlinks; that Claude / Codex / Cursor correctly read what we write; internal implementation details of existing namespaces beyond their surface contracts.

## 12. Genuinely Open Questions

Things still requiring a call during implementation:

1. **Exact field name for `_bgng` meta-block** inside settings files — `_bgng`, `__bgng__`, `bgngManaged`, etc. Pick a convention that minimizes collision with tool-owned keys.
2. **Schema URL hosting.** `$schema` in card manifests points at `https://schemas.bgng.dev/card/1.json` in this design. Decision needed: do we host this domain, ship schemas in the npm package only, or both?
3. **Default port/sort order in `bgng card list`.** Alphabetical by name? Most-recently-published first? Most-frequently-applied first?
4. **`bgng card outdated` exit code.** Zero (it's informational) or non-zero when updates exist (CI-friendly)? Lean: zero by default, `--check` flag for CI semantics.

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

Principle: defer everything that can be added without breaking the v1 schema or store layout.

## 14. Surface Summary

What the introduction of cards changes:

- **2 new namespaces:** `bgng card`, `bgng store`
- **2 new top-level aliases:** `bgng apply`, `bgng update`
- **1 new command in an existing namespace:** `bgng extensions add`
- **1 renamed file:** `~/.agents/bgng/config.json` → `~/.agents/bgng/machine.json`
- **2 new project-local files:** `.agents/bgng/card.lock` (git-tracked), `.agents/bgng/write-record.json` (gitignored)
- **2 new directories in the store:** `cards/`, `sources/`
- **2 folded-in directories:** `~/.agents/library/` → `~/.agents/bgng/mcp-servers/`; `~/.agents/packages/skills/` → `~/.agents/bgng/skills/`
- **Materialization scope shifts from global to project-local for any directory with `.agents/bgng/config.json` in its ancestry.**
- **Clean-cut release:** no deprecation surface, no v1/v2 schema branching, no back-compat shims.

## 15. Next Steps

1. Convert this design into an implementation plan (writing-plans skill) with discrete, testable milestones.
2. Decide host/URL strategy for `$schema` and ship the schema files.
3. Land an initial PR introducing the store schema (`store.json`), the migration from `~/.agents/library/` and `~/.agents/packages/skills/`, and the renamed `machine.json` — no card surface yet.
4. Build out the card surface incrementally, TDD-style, per the testing strategy in §11.
