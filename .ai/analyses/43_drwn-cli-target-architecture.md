# drwn CLI Target Architecture

**Date**: 2026-05-29
**Author**: Claude + Remy
**Status**: Draft (revised 2026-05-29 — vocabulary patch propagated from `42_*` v2; see Revision History)
**References**: [analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, analyses/40_drwn-cli-usage-guide.md, analyses/32_harness-cards-vs-flox-and-conda.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/13_library-defaults-config-target-architecture.md, analyses/12_target-cli-ui-architecture.md, analyses/41_card-source-authoring-cli-target-architecture.md, knowledges/01_agents-cli-usage-guide.md, knowledges/02_per-project-config-guide.md]

---

## Revision History

**v2 (2026-05-29)** — Vocabulary patch propagated from analysis `42_*` v2. Two changes throughout this doc:

1. **Materialization verb is `apply`, not `sync`.** Matches kubectl/terraform/ansible/chezmoi convention. The old `drwn write` becomes `drwn apply`; the old `drwn apply <card>` (which mutated config) is gone — that role moved to `drwn use <card>`. The mental model is two-phase (intent → materialization); `apply` is the conventional verb for the second phase.
2. **`drwn card` namespace is retained for card-as-artifact operations.** v1 of this doc flattened card authoring/inspection to top-level (`drwn new`, `drwn publish`, `drwn source`, etc.). v2 puts them back under `drwn card new` / `drwn card publish` / `drwn card source` / `drwn card deprecate` / `drwn card show` / `drwn card diff`. Project-composition verbs (`use`/`add`/`pin`/`remove`/`clear`) stay top-level. Two distinct surfaces for two distinct concerns: daily project composition vs. occasional card-as-artifact authoring.

**Still open** (not patched in v2): the broader structural question raised earlier about whether `drwn projects` (tracked projects namespace), `drwn project adopt`, and `link:<project>:<skill>` are the right primitives, or whether they could collapse into the existing `drwn card source` / `file:` mechanics. That discussion is separate from this patch.

---

## Executive Summary

This document consolidates the target architecture for the `drwn` CLI in the post-rename era (`darwinian-harness`). It is the unified picture across the four design tracks that have surfaced in recent analyses:

1. **Vocabulary cleanup** (from `42_*`) — single materialization verb, top-level composition verbs, enhanced status.
2. **Presets and profiles** (from `42_*`) — named snapshots at project level (preset) and machine level (profile).
3. **Cards composition** (settled in `29_*`, `32_*`, M0–M7 shipped) — multi-card per project, last-wins merge, lockfile-pinned, filesystem materialization.
4. **Local asset management (new in this doc)** — first-class support for tracked projects, scan/discovery of scattered skills and MCP servers, project-local skill content, and cross-project linking without npm publishing.

The architecture organizes everything into a **five-layer mental model**: Built-in → Library → Project → Curated → Downstream. The Library layer is significantly expanded: it now encompasses skill bundles, MCP definitions, cards (versioned + sources), tracked projects, profiles, and a cached index of where each asset lives. The Project layer gains first-class project-local skill content and cross-project `link:` references. The vocabulary across all layers is cleaned up so each action has exactly one verb and each verb has exactly one meaning.

Crucially, this is **not** a model rewrite. Cards' filesystem materialization (three mechanisms: symlinks, `_bgng`/`_drwn` meta-block, generated-file-plus-symlink) is unchanged. The lockfile is unchanged. The downstream contract with Claude / Codex / Cursor is unchanged. What changes is the user-facing surface and the asset management primitives — additive on top of the proven core.

The Flox/Conda activation model is explicitly rejected. The argument from `32_*` stands: the consumer tools don't read PATH, so there is nothing to activate. Cards' per-directory environment + lockfile + content store already deliver Flox-equivalent reproducibility; the materialization mechanism is what differs, and it must.

---

## 1. Context and Scope

### 1.1 What this document is

The single source of truth for the **target** shape of `drwn`. It supersedes nothing — earlier analyses (13, 26, 29, 32, 40, 42, 41) remain authoritative for their specific sub-systems. This document is the consolidated view that those sub-systems compose into.

### 1.2 What this document is not

- Not an implementation plan. Each section ends with a "Target state" picture; implementation tasks for each section go into `.ai/tasks/` separately.
- Not a rebrand spec. Task 28 handles the `beginning-harness` → `darwinian-harness` and `bgng` → `drwn` rename. This document assumes the rename has landed.
- Not a card spec update. The cards model is settled in `29_*` and shipped through M0–M7.
- Not a docs site spec. Task 27 handles the `docs-docusaurus/` build-out.

### 1.3 The four design tracks this consolidates

| Track | Origin | Status in this doc |
|---|---|---|
| Vocabulary cleanup | `42_*` R1 | adopted in §6 |
| Project presets | `42_*` R2 | adopted in §4 |
| User profiles (snapshot variant) | `42_*` R3 / C1 | adopted in §3 |
| Local asset management | this doc §5 | new design |

### 1.4 What's deliberately out of scope

- Per-shell scope or PATH-style activation
- Remote profile/preset registries
- Multi-machine sync via a hosted service
- A new card distribution channel beyond npm (v1) and git (v2)
- Sandboxing of skill execution
- SLSA-style provenance attestation (deferred per `32_*` §6.6)

---

## 2. The Five-Layer Mental Model

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 5: Downstream                                                  │
│   ~/.claude/, ~/.codex/, ~/.cursor/                                  │
│   <project>/.claude/, <project>/.codex/, <project>/.cursor/          │
│   (Materialized by drwn apply — three mechanisms unchanged)          │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ drwn apply (materialize)
                              │
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 4: Curated                                                     │
│   Active machine baseline (skills enabled, MCPs active)              │
│   ~/.agents/skills/  (publication layer)                             │
│   ~/.agents/drwn/machine.json  (current active profile content)      │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ drwn skills enable / library defaults / profile use
                              │
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 3: Project                                                     │
│   <project>/.agents/drwn/config.json   (cards + overlay)             │
│   <project>/.agents/drwn/card.lock     (resolution)                  │
│   <project>/.agents/drwn/skills/       (project-local skill content) │
│   <project>/.agents/drwn/presets/      (named project snapshots)     │
│   <project>/.agents/drwn/write-record.json                           │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ drwn use / drwn add / drwn pin / drwn preset use
                              │
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 2: Library                                                     │
│   ~/.agents/drwn/skills/         (package-backed skill bundles)      │
│   ~/.agents/drwn/mcp-servers/    (MCP server defs)                   │
│   ~/.agents/drwn/cards/          (versioned, immutable card store)   │
│   ~/.agents/drwn/sources/        (editable card sources)             │
│   ~/.agents/drwn/profiles/       (named machine snapshots)           │
│   ~/.agents/drwn/projects.json   (tracked projects registry)         │
│   ~/.agents/drwn/scan-paths.json (discovery glob patterns)           │
│   ~/.agents/drwn/index.json      (cached cross-project asset index)  │
│   ~/.agents/drwn/global-write-record.json                            │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ drwn library add | drwn scan | drwn projects track
                              │
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 1: Built-in (packaged or checkout harness source)              │
│   <repo>/skills/shared/          (built-in shared skills)            │
│   <repo>/registry/               (built-in MCP servers, extensions)  │
│   Distributed via npm package or accessed via checkout               │
└──────────────────────────────────────────────────────────────────────┘
```

Reading rules:

- Composition is bottom-up: each higher layer is a function of the lower layers plus its own state.
- Materialization is one-way down to Layer 5; layer 5 never feeds back upward except via drift detection (`drwn doctor`).
- The cards model in Layer 3 is the unit of *packaged* harness intent. Project-local skills (also Layer 3) are the unit of *unpackaged* harness intent.
- The Library (Layer 2) is now the umbrella for everything the user **owns** that isn't shipped with the package and isn't project-bound.

The big shift from `13_library-defaults-config-target-architecture.md`: the Library is no longer just package-backed bundles. It now includes profiles, tracked projects, and a cross-project asset index. This is what unlocks the "manage assets scattered across my projects" workflow.

---

## 3. Layer 2: The Library Expanded

The library is the user's local control plane for assets they personally curate. Its sub-namespaces:

### 3.1 Skill bundles — `~/.agents/drwn/skills/`

Unchanged from current. Package-backed bundles installed via `drwn library add skill <pkg>`. Content stays npm-versioned and immutable per bundle version.

### 3.2 MCP server definitions — `~/.agents/drwn/mcp-servers/<id>.json`

Unchanged from current. Registered via `drwn library add mcp <json> --as <id>`. One file per server. Discoverable for projects via `drwn add mcp <id>`.

### 3.3 Cards — `~/.agents/drwn/cards/` (versioned) + `~/.agents/drwn/sources/` (editable)

Unchanged from current cards architecture (`29_*`). The version store under `cards/` is content-immutable; `sources/` holds editable card source trees (`41_*`). Both are user-owned.

### 3.4 Profiles — `~/.agents/drwn/profiles/<name>.json` *(new)*

Named snapshots of the machine-wide harness baseline (`machine.json`). Designed in `42_*` §4 (C1 snapshot variant). One JSON file per profile. Schema:

```json
{
  "profileVersion": 1,
  "name": "work",
  "createdAt": "2026-05-29T11:42:00Z",
  "createdBy": "drwn profile save work",
  "description": "Corporate work baseline",
  "machine": {
    "version": 1,
    "skills": { "defaults": ["code-review", "ai-pair-programmer"] },
    "servers": { "defaults": ["github", "context7"] },
    "extensions": { "defaults": ["parallel"] },
    "targets": { "claude": true, "codex": true, "cursor": false }
  }
}
```

The active profile is implicit: whichever profile's `machine` field matches the current contents of `~/.agents/drwn/machine.json` (canonical-hash compare). No active-profile pointer.

### 3.5 Tracked projects — `~/.agents/drwn/projects.json` *(new)*

A registry of project paths drwn knows about. Used by `drwn scan`, `drwn projects status`, cross-project link resolution, and the library index.

```json
{
  "registryVersion": 1,
  "projects": [
    {
      "name": "myproject",
      "path": "/Users/pureicis/dev/myproject",
      "trackedAt": "2026-05-29T11:42:00Z"
    },
    {
      "name": "inf-minds",
      "path": "/Users/pureicis/dev/inf-minds",
      "trackedAt": "2026-05-15T09:00:00Z"
    }
  ]
}
```

`name` is the user-chosen handle (defaults to basename of `path`, must be unique). `path` is the absolute path to the project root (the directory containing `.agents/drwn/` or one drwn would scaffold into).

Tracked projects are how cross-project references resolve by name (e.g., `link:myproject:code-review`).

### 3.6 Scan paths — `~/.agents/drwn/scan-paths.json` *(new)*

Glob patterns for broad discovery without explicit tracking. Used by `drwn scan` to find projects that should be candidates for tracking.

```json
{
  "version": 1,
  "include": [
    "~/dev/*",
    "~/Projects/**"
  ],
  "exclude": [
    "**/node_modules/**",
    "**/.git/**"
  ]
}
```

Scan paths are complementary to tracked projects: scan paths find candidates, tracking promotes them to first-class.

### 3.7 Library index — `~/.agents/drwn/index.json` *(new, cached)*

A cache of every skill and MCP server drwn knows about across all layers, regenerated by `drwn scan`. Powers `drwn library list` (showing everything, not just bundles) and `drwn search`.

```json
{
  "indexVersion": 1,
  "indexedAt": "2026-05-29T11:42:00Z",
  "skills": [
    {
      "name": "code-review",
      "source": "library:bundle",
      "bundle": "@me/skills-core",
      "version": "1.2.0",
      "path": "~/.agents/drwn/skills/@me/skills-core/1.2.0/skills/code-review"
    },
    {
      "name": "code-review",
      "source": "project",
      "project": "myproject",
      "path": "/Users/pureicis/dev/myproject/.agents/drwn/skills/code-review"
    },
    {
      "name": "code-review",
      "source": "project",
      "project": "inf-minds",
      "path": "/Users/pureicis/dev/inf-minds/.claude/skills/code-review"
    },
    {
      "name": "scratch-bench",
      "source": "builtin",
      "path": "<repo>/skills/shared/scratch-bench"
    }
  ],
  "mcp": [ ... similar ... ],
  "cards": [ ... similar ... ]
}
```

The index is **a cache**, not a source of truth. It can be regenerated from disk at any time. Commands that mutate the library (`library add`, `projects track`) trigger incremental updates; periodic `drwn scan` rebuilds it fully.

### 3.8 Write records — `~/.agents/drwn/global-write-record.json`

Unchanged from current. Records drwn-owned materialization for machine-scope writes.

### 3.9 Target storage layout

```text
~/.agents/
├── skills/                                # curated publication layer (Layer 4)
└── drwn/                                  # the library (Layer 2)
    ├── machine.json                       # active machine baseline (Layer 4 input)
    ├── projects.json                      # NEW: tracked projects registry
    ├── scan-paths.json                    # NEW: discovery globs
    ├── index.json                         # NEW: cross-project asset index (cache)
    ├── global-write-record.json
    ├── skills/                            # package-backed skill bundles
    │   └── @scope/pkg/<version>/...
    ├── mcp-servers/                       # MCP server definitions
    │   └── <id>.json
    ├── cards/                             # versioned card store
    │   └── @scope/name/<version>/...
    ├── sources/                           # editable card sources
    │   └── @scope/name/...
    └── profiles/                          # NEW: machine snapshots
        ├── work.json
        ├── personal.json
        └── research.json
```

---

## 4. Layer 3: Project

### 4.1 Project config — `<project>/.agents/drwn/config.json`

Unchanged in schema. Contains `cards: []`, `skills: { include, exclude }`, `servers: {}`, `extensions: {}`, `targets: {}`. The cards array drives composition.

### 4.2 Card lock — `<project>/.agents/drwn/card.lock`

Unchanged. Records exact resolved versions and integrity hashes for cards declared in config.

### 4.3 Project-local skill content — `<project>/.agents/drwn/skills/<name>/` *(new first-class)*

Today, a project can `include` a skill but the content must live somewhere drwn already knows about (built-in, bundle, curated, card). Project-local skill *content* is not first-class.

**Target:** `<project>/.agents/drwn/skills/<name>/` is a first-class skill location. A skill placed here:

- Is discovered automatically when `drwn scan` runs in or near this project.
- Resolves from `skills.include: ["<name>"]` in this project's config without any further setup.
- Is materialized to `<project>/.claude/skills/<name>/` etc. via the same symlink mechanism cards use.
- Is **not** materialized to machine scope unless the user explicitly imports it to the library.
- Is git-committable (it's inside the project tree).

Disambiguation rule: when `skills.include` references a skill name that exists in multiple sources, project-local always wins over library bundle, which wins over built-in. The full precedence:

```
project-local > project's cards (last-wins among them) > library bundle > built-in
```

This rule generalizes the cards last-wins rule to include project-local content as the highest layer.

### 4.4 Cross-project skill references — `link:<project>:<skill>` *(new)*

A project can reference a skill that lives in another tracked project, without copying. Syntax inspired by npm `link:./path` but resolves by tracked-project name:

```json
{
  "version": 1,
  "skills": {
    "include": [
      "code-review",                       // resolved via standard precedence
      "link:myproject:internal-runner"     // resolved from tracked project "myproject"
    ]
  }
}
```

Resolution:
- `link:myproject:internal-runner` looks up `myproject` in `~/.agents/drwn/projects.json`.
- Reads from `<projects.myproject.path>/.agents/drwn/skills/internal-runner/`.
- If the target project is not tracked or the skill doesn't exist there, `drwn doctor` reports it; `drwn apply` errors or warns based on flags.

Materialization: project-local skills from another tracked project are **symlinked** into the consuming project's `<project>/.claude/skills/`. The symlink target is the source project's skill directory, so edits in the source project propagate without re-running anything (subject to consumer caching).

Trade-off: brittle if the source project moves on disk. Mitigation: `drwn projects relocate <name> <new-path>` updates the registry and recomputes any affected materialized symlinks.

This is the answer to "share a skill across projects without publishing to npm." Friction-light, project-aware, version-tracked through the source project's git history rather than through a separate semver lifecycle.

### 4.5 Project presets — `<project>/.agents/drwn/presets/<name>.json` *(new)*

Designed in `42_*` §3. Named snapshots of `cards[]` + overlay. Schema:

```json
{
  "presetVersion": 1,
  "name": "heavy-work",
  "createdAt": "2026-05-29T11:42:00Z",
  "createdBy": "drwn preset save heavy-work",
  "cards": ["@me/baseline@^1.2.0", "@team/observability@^2.0.3"],
  "overlay": {
    "skills": { "include": ["project-runner"], "exclude": [] },
    "servers": { "github": { ... } },
    "extensions": { "beads": { "enabled": true, "includeSkill": true } },
    "targets": { "claude": true, "codex": true, "cursor": false }
  }
}
```

Active preset is implicit (canonical-hash compare to `config.json`).

### 4.6 Project write record — `<project>/.agents/drwn/write-record.json`

Unchanged. Tracks drwn-owned files materialized into this project's downstream paths.

### 4.7 Target storage layout

```text
<project>/.agents/drwn/
├── config.json                           # cards + overlay (active)
├── card.lock                             # resolved card versions
├── write-record.json                     # drwn-owned downstream files
├── skills/                               # NEW: project-local skill content
│   └── <name>/
│       └── SKILL.md + assets
└── presets/                              # NEW: project snapshots
    ├── reading.json
    ├── heavy-work.json
    └── demo.json
```

---

## 5. Asset Management: Discovery, Tracking, Promotion

This is the section that closes the gap surfaced by the user's question. Cards solve packaged, versioned, shareable harness intent. Project-local skills (§4.3) solve unpackaged in-project intent. Cross-project links (§4.4) solve ad-hoc sharing. But the user still needs **inspection and curation** of what they have scattered across their machine.

### 5.1 The scattered reality

A real developer has skills and MCP servers in:

- `~/.claude/skills/` — personal home skills, possibly hand-edited
- `~/.codex/skills/`, `~/.cursor/skills/` — same per tool
- `<projectA>/.claude/skills/foo/` — hand-authored, project-only
- `<projectB>/.claude/skills/foo/` — same skill, slightly different (drift)
- `<projectC>/.agents/drwn/skills/internal-runner/` — drwn-managed project-local
- `<projectD>/.claude/settings.json` mcpServers block — hand-edited MCP config
- `~/.agents/drwn/skills/@me/personal/<v>/skills/...` — package-backed library
- `~/.agents/drwn/mcp-servers/github.json` — registered MCP
- `~/.agents/drwn/cards/@me/baseline/1.2.0/...` — published card

The user wants to:

1. **See it all** — one inventory across every source
2. **Find duplicates** — same skill name, divergent content
3. **Promote** — pull a great project-local skill into the library
4. **Link** — use one project's skill in another without copying
5. **Audit** — find skills that exist nowhere drwn-known (drwn doesn't know about that `.claude/skills/foo` in projectA)
6. **Migrate** — bring hand-managed `.claude/` content under drwn management

### 5.2 The two primitives that unlock this

**Primitive 1: Tracked projects** (§3.5). The user explicitly registers project paths drwn should know about. Cheap, deliberate, named.

**Primitive 2: Scan paths** (§3.6). Glob patterns drwn walks to find untracked projects. Discovery-only; promotes nothing without user action.

These two compose: scan paths help you find projects to track; tracked projects are the set drwn operates on.

### 5.3 The scan command

`drwn scan` (today a placeholder per `40_*`) becomes the discovery engine. Modes:

```bash
drwn scan                          # full scan: tracked projects + scan paths
drwn scan --json                   # structured output
drwn scan <path>                   # scan a specific path ad-hoc (doesn't track)
drwn scan --tracked-only           # skip scan-paths discovery
drwn scan --refresh-index          # rebuild index.json from scan results
drwn scan --untracked              # only show projects matched by scan paths but not tracked
```

What scan reports:

- **Skills found across all sources** — name, source (library / project / built-in), path, content hash, simple summary line
- **MCP servers found** — name, source, transport, summary
- **Skills present in multiple places with diverging content** — `code-review` exists in projectA and projectB with different hashes; both surface, conflict flagged
- **Skills hand-managed outside drwn** — found in a project's `.claude/skills/` but not in `.agents/drwn/skills/` and not referenced from `.agents/drwn/config.json`; surfaced as "unmanaged"
- **Projects matched by scan paths but not tracked** — candidates for `drwn projects track`

Side effect: scan writes `~/.agents/drwn/index.json`. Otherwise non-mutating. No promotion happens automatically.

### 5.4 The projects namespace

```bash
drwn projects track <path> [--name <handle>]    # register a project
drwn projects list [--json]                     # show tracked projects + health
drwn projects show <name>                       # inspect one project
drwn projects untrack <name>                    # remove from registry
drwn projects relocate <name> <new-path>        # path changed
drwn projects status [--json]                   # status across all tracked projects (materialization state, drift)
drwn projects rename <old> <new>                # change handle, paths unchanged
```

Semantics:

- `track` adds to `projects.json`. Name defaults to basename of path; must be unique. Idempotent.
- `relocate` updates the path. If any other tracked project has a `link:<this-name>:...` reference, its materialized symlinks get re-pointed on next `drwn apply`.
- `status` aggregates: for each tracked project, is its `<project>/.agents/drwn/` present, is its last apply recent, does it have drift, etc. The "view your whole machine at once" command.

### 5.5 The library import / promote workflow

The other half of asset management is **promotion** — moving a great project-local skill into the library so it becomes broadly reusable.

```bash
# Promote a skill from a tracked project into the library
drwn library import skill <path-or-ref> [--name <new-name>] [--bundle <bundle-name>]

# Same for MCP server
drwn library import mcp <project-path> --server-id <id>

# Inverse: extract a library skill back into a project for editing
drwn library extract skill <name> --to <project>

# Inspect where a skill lives across all known sources
drwn library where skill <name>

# Diff two skill instances by source
drwn library diff skill <name> --left <source-a> --right <source-b>
```

Example session:

```bash
# Discover what exists
drwn scan
# → "skill code-review: 3 instances (library:bundle@1.2.0, project:myproject, project:inf-minds)"
# → "skill code-review has divergent content between myproject and inf-minds"

# Compare
drwn library diff skill code-review --left project:myproject --right project:inf-minds

# Promote myproject's version to the library
drwn library import skill project:myproject:code-review --bundle @me/skills-personal

# Now any project can: drwn add skill code-review
```

The `<path-or-ref>` argument shape for `library import skill`:

- `project:<name>:<skill>` — pull from a tracked project's `.agents/drwn/skills/`
- `project:<name>:<skill>@<.claude|.codex|.cursor>` — pull from a tracked project's downstream tool directory (handles the "this is hand-managed, drwn doesn't manage it" case)
- `~/path/to/skill/` — absolute filesystem path
- `link:<project>:<skill>` — promotes the link reference to a copied library entry

What "import" does:

- Copy the skill content into a library bundle directory at `~/.agents/drwn/skills/<bundle>/skills/<name>/`
- If `--bundle` doesn't exist, create a new local bundle (no npm publish needed; drwn supports local bundles)
- Register it in the library index
- Optionally output the `drwn add skill <name>` command needed to use it in the current project

This gives the user a friction-light alternative to npm publishing for skills they want broadly available but don't want to release publicly.

### 5.6 The "unmanaged skill" case

A common reality: a project has `<project>/.claude/skills/foo/` that was hand-authored and never went through drwn. `drwn scan` reports it as "unmanaged: present in downstream but not in drwn config."

Two responses are useful:

```bash
# Bring it under drwn management (moves it into project-local drwn skills)
drwn project adopt skill foo --from <project>

# Or import it into the library so other projects can use it
drwn library import skill <project>:foo@.claude
```

`drwn project adopt skill foo` does:

- Move `<project>/.claude/skills/foo/` → `<project>/.agents/drwn/skills/foo/`
- Add `foo` to `<project>/.agents/drwn/config.json` `skills.include`
- Re-materialize `<project>/.claude/skills/foo/` as a symlink to the new location
- Record the move in the write record

After adoption, the skill is drwn-managed: `drwn apply` keeps it materialized, drift is detected, and the user can choose to promote to library later.

### 5.7 Target asset-management surface summary

```text
Discovery
  drwn scan [--tracked-only | --untracked | --refresh-index]

Project tracking
  drwn projects track <path>
  drwn projects list
  drwn projects show <name>
  drwn projects status
  drwn projects untrack <name>
  drwn projects relocate <name> <new-path>
  drwn projects rename <old> <new>

Library import / inspect
  drwn library import skill <ref>
  drwn library import mcp <ref>
  drwn library extract skill <name> --to <project>
  drwn library where skill <name>
  drwn library diff skill <name> --left <a> --right <b>

Project adoption
  drwn project adopt skill <name> --from <project-or-downstream>
  drwn project adopt mcp <name> --from <project-or-downstream>
```

---

## 6. Layer 4 and 5: Curated and Downstream

Unchanged from the current architecture (`32_*` §5 for materialization, `29_*` §8 for write records, `13_*` for curated). Summarized for completeness.

### 6.1 Curated (Layer 4)

- `~/.agents/skills/` is the publication layer. Skills must be **enabled** (formerly "curated") to appear here.
- `drwn skills enable <name>` symlinks a skill from the library or built-in into the curated layer.
- `drwn skills disable <name>` removes the symlink. Downstream symlinks pointing into it get cleaned by the next apply.
- The curated layer is what downstream materialization reads from (along with cards, project-local, and machine config).

### 6.2 Downstream (Layer 5)

- The three materialization mechanisms from `32_*` §5 are unchanged:
  - **Directory symlinks** for skills
  - **`_drwn` meta-block** in `settings.json` / `config.toml` for managed-field rewrites (note: the meta-block name changes from `_bgng` to `_drwn` in the rebrand)
  - **Generated-file-plus-symlink** for `.cursor/mcp.json`
- Write records track drwn-owned files for clean removal on subsequent applies.
- Drift detection flags hand-edits to drwn-managed regions; `--force` overrides.

### 6.3 The materialization verb is `apply`, not `write`

Per vocabulary cleanup (`42_*` R1, v2). `drwn apply` is the single materialization verb across all scopes — matches the kubectl/terraform/ansible/chezmoi convention and reads as the second phase of the two-phase intent → materialization model:

```bash
drwn apply                       # materialize effective state to downstream
drwn apply --dry-run             # preview
drwn apply --json
drwn apply --target=claude       # one downstream
drwn apply --skills-only
drwn apply --mcp-only
drwn apply --force               # overwrite drift in drwn-managed regions
```

The previous `drwn apply <card>` (which mutated `cards[]`) is gone — that role moved to `drwn use <card>`. This frees `apply` for its conventional materialization role.

---

## 7. The Target CLI Surface

The consolidated command list, grouped by purpose. Every command lands at the top level unless it's clearly a sub-namespace.

### 7.1 Initialization

```
drwn init [--non-interactive | --minimal | --force]
```

### 7.2 Project composition (cards array + overlay)

```
drwn use <card>...               # set cards[] to provided refs (variadic)
drwn add <card> | skill <name> | mcp <name>    # add to project (shape-dispatched)
drwn remove <card-or-name>
drwn pin <card>[@version]
drwn clear                       # empty cards[], keep overlay
drwn update                      # re-resolve all cards, refresh card.lock
drwn outdated                    # list cards with newer versions
drwn cards                       # list current project's cards
drwn cards show <ref>            # inspect one card
drwn cards diff <ref-a> <ref-b>
```

### 7.3 Materialization

```
drwn apply [--dry-run | --target=... | --skills-only | --mcp-only | --force]
```

### 7.4 Status & diagnostics

```
drwn status [--json | --explain | --why <category>:<name>]
drwn doctor [<scope>] [--json]
```

Enhanced `drwn status` shows the full layered composition (per §2 and `42_*` Appendix B):

```text
$ drwn status
Project: /Users/pureicis/dev/myproject
Active profile: work
Active preset: heavy-work

Composition (last-wins):
  1. machine defaults (profile: work)
  2. card: @me/baseline@1.2.0
  3. card: @team/observability@2.0.3
  4. project overlay (preset: heavy-work)
  5. project-local skills: project-runner

Effective: 6 skills, 5 MCP servers, 1 extension
Downstream: up to date (last apply: 2026-05-29 11:42)
Drift: none
```

### 7.5 Project presets

```
drwn preset save <name> [--overwrite]
drwn preset use <name> [--no-apply]
drwn preset list
drwn preset show <name>
drwn preset diff <name>
drwn preset delete <name>
drwn preset rename <old> <new>
```

### 7.6 User profiles

```
drwn profile save <name> [--overwrite] [--description <text>]
drwn profile use <name>
drwn profile list
drwn profile show <name>
drwn profile diff <name>
drwn profile delete <name>
drwn profile rename <old> <new>
drwn profile export <name>       # stdout JSON
drwn profile import <file> [--as <name>]
```

### 7.7 Library (inventory)

```
drwn library list [skill | mcp | card]
drwn library show <id>
drwn library add skill <pkg-or-path>
drwn library add mcp <json-file> --as <id>
drwn library import skill <ref>                  # NEW
drwn library import mcp <ref>                    # NEW
drwn library extract skill <name> --to <project> # NEW
drwn library where skill <name>                  # NEW
drwn library diff skill <name> --left <a> --right <b>  # NEW
drwn library defaults list
drwn library defaults add | remove skill <name>
drwn library defaults add | remove mcp <name>
```

### 7.8 Tracked projects (new namespace)

```
drwn projects track <path> [--name <handle>]
drwn projects list
drwn projects show <name>
drwn projects status
drwn projects untrack <name>
drwn projects relocate <name> <new-path>
drwn projects rename <old> <new>
```

### 7.9 Scan / discovery (new, real)

```
drwn scan [<path>] [--tracked-only | --untracked | --refresh-index] [--json]
```

### 7.10 Project adoption (new, for the "unmanaged" case)

```
drwn project adopt skill <name> --from <project-or-downstream>
drwn project adopt mcp <name> --from <project-or-downstream>
```

### 7.11 Skills (curation across machine)

```
drwn skills enable <name>        # was: curate
drwn skills disable <name>       # was: uncurate
drwn skills list
```

### 7.12 MCP

```
drwn mcp list
drwn mcp apply [--target=... | --dry-run]   # subset of drwn apply --mcp-only
```

### 7.13 Extensions

```
drwn extensions list
drwn extensions show <ext>
drwn extensions status [<ext>]
drwn extensions doctor [<ext>]
drwn extensions setup <ext>   # parallel, beads, markitdown
```

### 7.14 Search

```
drwn search skill <query> [--library | --catalog]
drwn search mcp <query>
```

### 7.15 Card-as-artifact (`drwn card` namespace — authoring + abstract inspection)

The card namespace handles operations on cards-as-objects, distinct from project-composition. Authoring lifecycle (`new` → `source` → `publish` → `deprecate`) and abstract inspection (`show`/`diff`/`list`) live here. Project-composition verbs (`use`/`add`/`remove`/`pin`/`clear`) stay top-level because they're the daily-use surface.

```
drwn card list                                   # same as bare `drwn cards`
drwn card show <ref>                             # inspect any card by ref
drwn card diff <a> <b>                           # diff two card versions
drwn card new <name> [--scope | --no-git]
drwn card source list | show | doctor | add-skill | remove-skill | set | add-mcp | remove-mcp
drwn card publish <ref>
drwn card deprecate <ref>
```

### 7.16 Store / scan / misc

```
drwn store status
```

Total: ~70 commands across 16 verb-families. Despite adding asset management, presets, profiles, and project tracking, the total surface grows only modestly because vocabulary cleanup removes duplicates (`apply` vs `card apply` etc.).

---

## 8. The Five Reuse Paths (Target)

After this architecture, a user has five distinct ways to share harness intent across projects:

| Path | When to use | Friction |
|---|---|---|
| **Project-local skill (§4.3)** | One-off, project-specific, never reused | Lowest. Just write `<project>/.agents/drwn/skills/<name>/` |
| **Cross-project link (§4.4)** | Skill authored in one project, used in 1–2 others, evolving | Low. `drwn projects track` once, then `link:<project>:<skill>` |
| **Library import (§5.5)** | Skill you want broadly available on your machine without npm | Medium. `drwn library import skill <ref>` |
| **Card** (§4.1, `29_*`) | Packaged team or org reuse, versioned, shareable, lockfile-pinned | Higher (publish lifecycle), but proportionate to the value |
| **npm bundle (`13_*`)** | Published, open-source-style distribution | Highest (npm publishing) |

The user picks the path that matches their reuse scope. Today only the last two paths really exist; this architecture adds the first three, closing the friction gap for ad-hoc and personal reuse.

---

## 9. Migration from Current State

### 9.1 What stays

- Cards model (composition, lockfile, materialization)
- Three materialization mechanisms
- Write records, drift detection
- Project / machine / library conceptual split
- Built-in shared skills
- All env vars (`AGENTS_*`)

### 9.2 What changes

| Component | Change | Effort |
|---|---|---|
| Vocabulary | `write` → `apply`, old `apply <card>` → `use <card>`, top-level `add`/`pin`/`remove`/`clear`, card-as-artifact under `drwn card` | medium (touch every command, every doc) |
| `drwn status` | Layered composition view | medium (one command rewrite + tests) |
| `drwn scan` | Placeholder → real discovery engine | medium-high (new feature, walks fs, builds index) |
| `drwn projects` | New namespace | medium (registry file + commands + integration) |
| `drwn preset` | New namespace | medium |
| `drwn profile` | New namespace | medium |
| Project-local skills | First-class location | low (resolve path, add to precedence) |
| Cross-project links | New ref syntax | medium (resolver + materialization integration) |
| Library import/extract/where/diff | New library subcommands | medium |
| Project adopt | New command for "unmanaged" assets | medium |
| Meta-block | `_bgng` → `_drwn` | trivial (rebrand) |

### 9.3 Phasing

Recommended PR ordering (each independent unless noted):

1. **R1 — Vocabulary cleanup** (analysis 42 R1). Land alongside or after task 28 (rebrand). Prerequisite for everything below.
2. **R5 — Enhanced `drwn status`** (analysis 42 R5). Highest leverage per cost.
3. **R2 — Project presets** (analysis 42 R2). Additive, independent.
4. **§4.3 — Project-local skill content as first-class.** Small, additive. Prerequisite for §5.5 promotion paths.
5. **§3.5 + §3.6 — Tracked projects + scan paths.** Prerequisite for cross-project links and library import.
6. **§5.3 — Real `drwn scan`.** Builds on tracked projects.
7. **§4.4 — Cross-project links.** Builds on tracked projects.
8. **§5.5 — Library import/extract/where/diff.** Builds on scan + tracked projects.
9. **§5.6 — Project adoption commands.** Builds on §5.5.
10. **R3 — User profiles (C1 snapshot variant)** (analysis 42 R3). Independent; can land anywhere after R1.

Each PR should land with: test coverage, README update, knowledge doc update, and a CHANGELOG entry. Per-PR task plans go into `.ai/tasks/` as they're greenlit.

### 9.4 Backward compatibility

The CLI surface changes are aggressive. Since the project is not yet published to npm (per task 28 context), backward compatibility is **not required**. The rebrand window is the right moment to land vocabulary cleanup atomically. Users updating their muscle memory across `write` → `apply` and old `apply <card>` → `use <card>` is a one-time cost paid before any public release.

### 9.5 Schema migration

New files (`projects.json`, `scan-paths.json`, `index.json`, `profiles/*.json`, `presets/*.json`) come into existence on first use. No migration of existing `machine.json` or project `config.json` is required — both schemas are unchanged. The `_bgng` → `_drwn` meta-block rename is handled by the rebrand PR (task 28).

---

## 10. Findings

1. The cards model is the right primitive for packaged reuse. It is not the right primitive for *ad-hoc* or *unpackaged* reuse. The architecture needs to grow project-local skill content, cross-project links, and library import to cover those cases.
2. The library today is essentially a thin shell around package-backed bundles and MCP registrations. The user's actual asset reality — skills scattered across N project directories — is invisible. Tracked projects + scan + library index close this gap with three additive primitives.
3. `drwn scan` is the foundational asset-management primitive. Today it's a placeholder; the most leveraged single piece of new work in this architecture is making it real.
4. The vocabulary cleanup (R1 from `42_*`) is genuinely structural, not cosmetic. Without it, every new namespace (`preset`, `profile`, `projects`) compounds the existing verb-overlap problem. Cleanup is a prerequisite, not a polish pass.
5. The five-layer mental model (built-in / library / project / curated / downstream) is the right teaching tool. The current architecture has the layers; what's missing is the *naming* and the *single status command* that exposes them. Both arrive in this target.
6. Flox/Conda activation remains structurally inapplicable. The 8th-layer framing from `32_*` §6.2 holds; cards is a layer-specific tool, not a general environment manager. This architecture deepens cards' fit at its own layer without pretending to be a different category of tool.

---

## 11. Recommendations

- **R1** — **Adopt the five-layer model** as the canonical teaching device. Put the diagram from §2 at the top of the operator guide (`40_*`'s successor) and the README.
- **R2** — **Implement vocabulary cleanup first** (per `42_*` R1). Every other recommendation depends on it.
- **R3** — **Implement enhanced `drwn status`** (per `42_*` R5). Single highest leverage UX change.
- **R4** — **Implement tracked projects + scan paths + real `drwn scan`** as a coherent unit. These three together unlock the asset-management workflows.
- **R5** — **Implement project-local skill content as a first-class location** (§4.3). Small change, large effect on the "ad-hoc skill" use case.
- **R6** — **Implement cross-project `link:` references** (§4.4). Builds on tracked projects.
- **R7** — **Implement library import/extract/where/diff** (§5.5). The promotion workflow.
- **R8** — **Implement project adoption commands** (§5.6). Handles the "bring my hand-managed assets under drwn" case.
- **R9** — **Implement project presets** (`42_*` R2). Independent; can land anywhere.
- **R10** — **Implement user profiles (C1 snapshot variant)** (`42_*` R3). Independent; can land anywhere.
- **R11** — **Do NOT add a remote profile/preset registry** in v1. Files-only export/import is enough.
- **R12** — **Do NOT add per-shell scope or PATH activation.** Doc 32's argument stands.

Each R becomes one (or a small group of) implementation tasks in `.ai/tasks/` when greenlit.

---

## 12. Open Questions

1. **Naming of `link:<project>:<skill>` vs `project:<project>:<skill>`.** Both readable; `link:` borrows npm semantics; `project:` is self-documenting. Lean: `link:` because it parallels npm's link mechanic users may know.
2. **Should `drwn scan` track projects automatically?** Current proposal: scan only *discovers* candidates, user explicitly tracks via `drwn projects track`. Alternative: scan auto-tracks anything matching scan paths. Lean: keep scan non-mutating, require explicit tracking.
3. **How aggressive should `library where <name>` be?** Just list locations, or include a per-location summary (skill description, content hash, last-modified)? Lean: include summary; the command is for human inspection.
4. **`drwn project adopt skill <name>` — what's the source disambiguator when a skill exists in multiple downstream paths in a single project (e.g., `.claude/skills/foo` and `.codex/skills/foo`)?** Either pick `.claude` as default and require flag for others, or require explicit `--from <project>:<skill>@<scope>`. Lean: require explicit; less ambiguity.
5. **Should the library index be per-machine or per-user (XDG-style)?** Today drwn writes to `~/.agents/drwn/`. Future: respect `XDG_DATA_HOME`. Probably defer; XDG migration is a separate concern.
6. **Should `drwn projects status` aggregate diagnostics across tracked projects, or be just a list with health flags?** Lean: list with health flags in v1, deeper aggregation in v2.
7. **Naming: "profile" at user level vs "preset" at project level.** Both fit. Decision logged in `42_*` Appendix A. Confirmed unchanged here.
8. **Should card sources (`~/.agents/drwn/sources/`) and tracked projects overlap?** A card source IS a project-shaped directory. Today they're disjoint namespaces. Maybe future: a tracked project that's also a card source surfaces both ways. Defer.
9. **Should `drwn scan` ever follow git submodules / git worktrees specially?** A worktree is a project. Probably handle on demand if encountered.
10. **`drwn project adopt` — what happens to the user's hand-edited `<project>/.claude/skills/foo/` after adoption?** Moves to `<project>/.agents/drwn/skills/foo/`. Symlinks the original back so consumers don't break. Record in write-record. Confirmed; question is closed.

---

## 13. Appendix

### A. Storage layout — full target

```text
~/.agents/
├── skills/                                  # curated publication layer
│   └── <skill-name>/  (symlink into bundle/builtin/card)
└── drwn/
    ├── machine.json                         # active machine baseline
    ├── projects.json                        # tracked projects
    ├── scan-paths.json                      # discovery globs
    ├── index.json                           # cross-project asset index (cache)
    ├── global-write-record.json
    ├── skills/                              # package-backed skill bundles
    │   └── @scope/pkg/<v>/skills/<name>/
    ├── mcp-servers/                         # MCP definitions
    │   └── <id>.json
    ├── cards/                               # versioned card store
    │   └── @scope/name/<v>/...
    ├── sources/                             # editable card sources
    │   └── @scope/name/...
    └── profiles/                            # machine snapshots
        ├── work.json
        ├── personal.json
        └── research.json

<project>/.agents/drwn/
├── config.json                              # cards + overlay (active state)
├── card.lock                                # resolved card versions
├── write-record.json                        # drwn-owned downstream files
├── skills/                                  # project-local skill content
│   └── <name>/SKILL.md + assets
└── presets/                                 # project snapshots
    ├── <preset>.json
    └── ...

<project>/.claude/, .codex/, .cursor/        # downstream (materialized)
~/.claude/, ~/.codex/, ~/.cursor/            # downstream (machine scope)
```

### B. A day in the life

```bash
# Monday morning: switch from weekend mode to work
drwn profile use work
drwn apply

# Open project, switch to heavy-work preset
cd ~/dev/myproject
drwn preset use heavy-work
# (auto-apply triggered)

# Take stock of skills across all my projects
drwn scan

# Notice "code-review" exists in 3 projects with drift
drwn library diff skill code-review --left project:myproject --right project:inf-minds

# Decide myproject's version is canonical; promote to library
drwn library import skill project:myproject:code-review --bundle @me/personal

# Use it everywhere
cd ~/dev/another-project
drwn add skill code-review
drwn apply

# Author a new skill quickly inside the current project
mkdir -p .agents/drwn/skills/internal-runner
$EDITOR .agents/drwn/skills/internal-runner/SKILL.md
drwn add skill internal-runner
drwn apply

# Want this in another project I'm working in this week, but don't want to publish yet
drwn projects track ~/dev/sibling-project
cd ~/dev/sibling-project
echo 'link:another-project:internal-runner' | ... edit config.json
drwn apply

# Friday: snapshot my current machine state before experimenting
drwn profile save before-experiment
# ... experiment with new defaults ...
# regret it
drwn profile use before-experiment
drwn apply
```

### C. Comparison to current state

| Concern | Today | Target |
|---|---|---|
| One command to see effective state | partial (`status`) | yes (`status` shows full composition) |
| Switch project configurations | manual edit + write | `drwn preset use <name>` |
| Switch machine baselines | edit `machine.json` | `drwn profile use <name>` |
| See assets across all my projects | not possible | `drwn scan` |
| Promote a project-local skill to library | not possible (manual copy) | `drwn library import skill` |
| Use a skill across projects without npm | symlinks (manual) | `link:<project>:<skill>` |
| Adopt hand-managed `.claude/skills/foo` | manual file moves | `drwn project adopt skill foo` |
| Find duplicate skills with drift | not possible | `drwn library where` + `drwn library diff` |
| Cards composition | works | works (unchanged) |
| Materialization | works (three mechanisms) | works (three mechanisms, `_drwn` meta-block) |
| Backward compatibility | n/a (not yet public) | not maintained — clean break |

### D. Why this architecture works for the 8th layer

Per `32_*` §6.2, agent harness state is an 8th layer in the reproducible-environments stack — distinct from runtime, shell, app deps, and other layers. The target architecture:

- **Stays at layer 8.** No attempt to manage layer 4 (shell) or layer 2 (app deps); the user pairs drwn with Flox/Nix/pnpm/etc.
- **Embraces filesystem materialization.** Per `32_*` §5, the consumers don't honor PATH; filesystem is the only viable activation mechanism.
- **Composes with the lower layers.** A project can have a `flake.nix` (layer 4), a `pnpm-lock.yaml` (layer 2), and a `.agents/drwn/config.json` (layer 8) without any of them stepping on each other.
- **Adds the asset-management primitives that other layer-8 tools haven't conceptualized.** Tracked projects, cross-project links, library import — these don't exist in the reference tools because the reference tools weren't designed for "an asset that's the same logical thing but lives in N project directories." That's a layer-8-specific problem.

The doc deliberately doesn't claim cards/drwn is the only thing at layer 8 or always will be. The architecture aims to be a *strong reference implementation* of the layer-8 concept, not a permanent monopoly. Future tools may compete or compose; the design should make either compatible.

### E. Relationship to existing analyses

| Analysis | Status under this target |
|---|---|
| `12_target-cli-ui-architecture.md` | Superseded for command surface; conceptual model retained |
| `13_library-defaults-config-target-architecture.md` | Extended (library now includes profiles, tracked projects, index) |
| `26_*`, `28_*`, `29_*` (cards) | Unchanged; this target adopts them |
| `32_harness-cards-vs-flox-and-conda.md` | Unchanged; this target follows its conclusions |
| `36_*` (bundle resolver) | Unchanged |
| `37_*` (registry pinning) | Unchanged |
| `40_drwn-cli-usage-guide.md` | Will be updated to match the new vocabulary and namespaces |
| `41_card-source-authoring-cli-target-architecture.md` | Surface promoted from `card source` to top-level `source` per `42_*` |
| `42_drwn-cli-vocabulary-and-multi-env-design.md` | Adopted; (a)/(b)/(c) realized in §6/§4.5/§3.4 |

### F. Risks

1. **Surface growth is significant.** ~20 new commands across `preset`, `profile`, `projects`, `scan`, `library import/extract/where/diff`, `project adopt`. Mitigation: each new namespace is small (5–9 commands), familiar (snapshot/restore, list/show, diff), and additive (doesn't break old workflows). Total surface count after vocabulary cleanup is still modestly larger than today.
2. **The library index can drift if not rebuilt.** Mitigation: every mutating library command updates the index incrementally; `drwn scan` rebuilds fully; `drwn doctor` flags stale-index symptoms.
3. **Cross-project links are brittle if a source project moves.** Mitigation: `drwn projects relocate` exists; `drwn doctor` flags broken links; on `drwn apply`, broken links surface as actionable warnings.
4. **Project adoption requires careful state management** (moving files, updating write record, re-symlinking). Mitigation: dry-run mode mandatory; transactional move with rollback on failure.
5. **Tracked projects are a new piece of global state that needs to stay consistent.** Mitigation: a single file (`projects.json`), small, schema-validated; tests cover the lifecycle.
6. **Users may get confused between "library import" (copy in) and "library extract" (copy out).** Mitigation: clear help text, examples in the docs, and `drwn doctor` hints when the user's stated intent doesn't match the command shape.
