# drwn CLI Vocabulary Cleanup and Multi-Env Composition Design

**Date**: 2026-05-29
**Author**: Claude + Remy
**Status**: Draft (revised 2026-05-29 — see Revision History below)
**References**: [analyses/32_harness-cards-vs-flox-and-conda.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/40_drwn-cli-usage-guide.md, analyses/41_card-source-authoring-cli-target-architecture.md, analyses/13_library-defaults-config-target-architecture.md, knowledges/01_agents-cli-usage-guide.md, knowledges/02_per-project-config-guide.md, cli/commands/card/, cli/core/card-project.ts]

---

## Revision History

**v2 (2026-05-29)** — Two changes after follow-up discussion:

1. **Materialization verb is `apply`, not `sync`.** Matches kubectl/terraform/ansible/chezmoi convention where `apply` means "reconcile desired state with actual state." `drwn write` becomes `drwn apply`. The mental model is two-phase (intent → materialization), and `apply` is the conventional verb for the second phase in every adjacent tool.
2. **`drwn card` namespace is retained for card-as-artifact operations.** v1 of this doc flattened `card new`/`publish`/`deprecate`/`source`/`show`/`diff` to top level. v2 keeps them under `drwn card` to separate "what I'm doing in this project right now" (top-level composition verbs) from "what I'm doing with cards as artifacts" (the `card` namespace). Authoring verbs cluster under `drwn card --help` rather than getting mixed with daily composition verbs.

The previous-apply (the one that set `cards[]`) is gone — it becomes `drwn use <card>...`. That frees the `apply` verb for its conventional role.

---

## Executive Summary

The current cards model is architecturally correct and should not change. The user-facing **vocabulary**, however, is confusing — verb overlap between `apply` / `write` / `add` / `card add` / `card apply` is real, and multi-card composition is under-surfaced in the CLI. A coworker proposal to adopt a Flox/Anaconda-style stateful environment-activation framework would be a category error: Claude Code, Codex, and Cursor do not consult `PATH` or env vars; they read files on disk. There is nothing for shell-scope activation to act on. Doc 32 already established this; its argument stands.

What is worth doing now, in priority order:

- **(a) Vocabulary cleanup** — pick one materialization verb, kill verb-noun ambiguity between project-level cards commands and library-level add/remove, replace `detach` with something honest, and make `drwn status` surface the full composition. Cheap to do, high readability return.
- **(b) Project-local presets** — named snapshots of the project's `cards[]` + overlay, switchable via `drwn preset use <name>`. This gives flox/conda's "switch configurations for the same project" UX without changing the underlying model. Additive, low-risk.
- **(c) User-level profiles** — named machine-wide harness configurations. Worth doing **only in the snapshot variant** (save/restore/list/delete around `machine.json`). The "active profile pointer" variant adds state and confuses the layer model for little additional value. Recommended subject to your sign-off on the scope.

What is explicitly **not** worth doing:

- Adopting Flox/Conda's PATH-activation model. Structurally impossible for the agent-tool consumer space.
- Renaming "cards" to "envs." The pnpm-for-harnesses tagline is well-positioned. Cards is the unit of reuse; presets and profiles are convenience layers over them.
- Per-shell scoping of any kind. The consumers don't observe shell state.

---

## Context

This analysis was prompted by a perception that the current CLI is "a bit confusing" because it supports multi-card-per-project, combined with a coworker proposal to adopt a Flox/Anaconda-like stateful environment management framework.

The investigation confirmed three things:

1. **The cards model already supports multi-card composition.** Projects record `cards: [...]` in `<project>/.agents/drwn/config.json`. Cards merge in declared order, last-wins. Project overlay applies last. Lockfile-pinned reproducibility via `card.lock`. All shipped through milestones M0–M7.
2. **Doc 32 already analyzed the Flox/Conda framing rigorously.** Its position: cards is closest to "Flox's package-manager-with-store-and-lockfile model" composed with "stow/chezmoi's symlink-and-merge materialization layer." The divergence in materialization mechanism is **forced by the problem space**, not aesthetic.
3. **The signal "the CLI is confusing" is real, but the cause is vocabulary, not model.** Specific evidence:
   - `drwn apply` (replaces cards array) vs `drwn card apply` (alias for same) vs `drwn card add` (appends) — three commands, two semantics, one noun.
   - `drwn write` for materialization — verb does not communicate the action.
   - `drwn card detach` — semantically "empty the cards array, keep the overlay." Non-discoverable.
   - `drwn skills curate` / `uncurate` — non-standard verbs in any adjacent package-manager domain.
   - No single command surfaces "what does my effective harness look like right now, contributed by what."

The user confirmed (a) and (b) as desired directions and asked for more design depth on (c) before committing. This document delivers detailed design for (a) and (b), and options-with-trade-offs for (c).

---

## Investigation

### 1. The Current Surface — Where the Friction Actually Is

Mapping every current verb against its semantic, sorted by friction:

| Current command | Semantic | Friction |
|---|---|---|
| `drwn apply <card>` | replace `cards[]` with `[<card>]` (variadic supported) | name implies idempotent materialization (kubectl/terraform sense); actually mutates project config |
| `drwn card apply <card>` | same as above | duplicate surface |
| `drwn card add <card>` | append to `cards[]` | `add` is well-known but adjacent to `apply`, semantics aren't obvious from name |
| `drwn card pin <card>@<version>` | upsert exact version | `pin` in npm/pip usually means "freeze current resolution"; here it's "force a specific version" — overloaded |
| `drwn card remove <name>` | remove one card from array | fine |
| `drwn card detach` | empty `cards[]`, keep overlay | unique, undiscoverable verb |
| `drwn card update` | re-resolve all cards, rewrite lock | fine, matches npm `update` |
| `drwn card outdated` | list cards with newer versions | fine, matches npm |
| `drwn card list` | list project's current cards | fine |
| `drwn card status` | inspection | redundant with `drwn status` and `drwn card list` |
| `drwn write` | materialize effective state to `~/.claude` etc. | verb doesn't say "to where" or "what kind" |
| `drwn write --dry-run` | preview materialization | fine flag, awkward verb |
| `drwn write --skills-only` | partial materialization | fine flag, awkward verb |
| `drwn add skill <name>` | add a skill ref to project config | different noun, same verb as `card add` |
| `drwn add mcp <name>` | add an MCP server ref to project config | ditto |
| `drwn skills curate <name>` | symlink built-in/bundled skill into `~/.agents/skills` | "curate" is product-internal jargon |
| `drwn skills uncurate <name>` | reverse | ditto |
| `drwn library add skill <pkg>` | install a skill bundle to `~/.agents/drwn/skills` | nested noun-verb-noun, mouthful |
| `drwn library defaults add skill <name>` | promote to machine default | four-level nested command |
| `drwn status` | print summary of what's active | OK today; doesn't show *composition* |
| `drwn doctor` | report drift and missing pieces | fine |

Three patterns emerge:

**Pattern 1: Multiple verbs for "change the cards array."** `apply`, `card apply`, `card add`, `card pin`, `card remove`, `card detach` are six commands that all mutate `cards[]`. A new user has to learn what each one does in isolation.

**Pattern 2: `write` is unspecific.** What is being written? Where? In what mode? The flag set (`--skills-only`, `--mcp-only`, `--target=claude`, `--dry-run`) is doing the real work of communicating intent.

**Pattern 3: No single status surface shows the composition.** Today, `drwn status` shows counts (skills, MCP servers, defaults). It doesn't show "card A contributed skill X, card B replaced it with Y, your overlay overrode that with Z." The merge semantics are invisible.

### 2. (a) Vocabulary Cleanup Design

The cleanup keeps every existing semantic. It only renames and consolidates. No model change.

#### Verb taxonomy

Pick exactly **one** verb per action class:

| Action class | Verb | Why |
|---|---|---|
| Materialize effective state to downstream tools | **`apply`** | Matches kubectl, terraform, ansible, chezmoi convention: `apply` means "reconcile desired state with actual state." This is the second phase of drwn's two-phase model (intent → materialization). `drwn write` becomes `drwn apply`. |
| Mutate project config (cards, overlay) — first phase | **`use` / `add` / `remove` / `pin` / `clear`** | `use` for "set the composition" (replaces); `add`/`remove` for incremental; `pin` for version-locking and upsert; `clear` for emptying. These verbs modify intent; `apply` materializes it. |
| Inspect | **`status` / `list` / `show` / `diff` / `outdated` / `doctor` / `why`** | Already mostly correct; consolidate around these. |
| Initialize / scaffold | **`init`** | Already correct. |
| Card-as-artifact (authoring + inspection) | **`drwn card`** namespace | Authoring (`new`, `source`, `publish`, `deprecate`) and abstract inspection (`show`, `diff`) group under one namespace, separate from daily project-composition verbs. |
| Manage user-level inventory | **`library`** subcommands kept; trim depth where possible | |

#### Specific renames

| Today | Proposed | Notes |
|---|---|---|
| `drwn write [flags]` | `drwn apply [flags]` | flags kept verbatim; matches kubectl/terraform/chezmoi convention. The previous `drwn apply` (which mutated `cards[]`) becomes `drwn use`, freeing `apply` for its conventional materialization role. |
| `drwn apply <card>...` | `drwn use <card>...` | "use these cards" reads as composition declaration |
| `drwn card apply` | **removed** | duplicate of `drwn use` |
| `drwn card add <card>` | `drwn add <card>` | promoted to top level (project composition is daily-use); first positional disambiguates (card refs match `@scope/name` shape) |
| `drwn card pin <card>` | `drwn pin <card>` | promoted to top level |
| `drwn card remove <name>` | `drwn remove <name>` | promoted to top level |
| `drwn card detach` | `drwn clear` | emptier connotation, project-level |
| `drwn card update` | `drwn update` | already aliased at top level; keep |
| `drwn card outdated` | `drwn outdated` | promoted |
| `drwn card list` | `drwn cards` (top-level shortcut) + `drwn card list` (under namespace) | `drwn cards` is the daily-use plural noun; `drwn card list` remains for completeness under the card namespace |
| `drwn card show <ref>` | unchanged | kept under `drwn card` namespace for artifact inspection |
| `drwn card status` | **removed** | replaced by enhanced `drwn status` |
| `drwn card diff <a> <b>` | unchanged | kept under `drwn card` namespace |
| `drwn card publish <ref>` | unchanged | kept under `drwn card` namespace (authoring lifecycle) |
| `drwn card deprecate <ref>` | unchanged | kept under `drwn card` namespace (authoring lifecycle) |
| `drwn card new <name>` | unchanged | kept under `drwn card` namespace (authoring lifecycle) |
| `drwn card source ...` | unchanged | kept under `drwn card source ...` (authoring sub-namespace from task 41) |
| `drwn skills curate <name>` | `drwn skills enable <name>` | normalized verb |
| `drwn skills uncurate <name>` | `drwn skills disable <name>` | normalized verb |
| `drwn skills packages add` | `drwn library add skill` | already exists as alias; consolidate |
| `drwn add skill <name>` | unchanged | adds skill to project (verb already correct, different noun than card) |
| `drwn add mcp <name>` | unchanged | adds MCP to project |
| `drwn extensions setup <ext>` | unchanged | the verb here is right |

#### Disambiguation: how does `drwn add` know if it's a card or a skill?

The first positional argument shape is unambiguous:

- `@scope/name`, `@scope/name@version`, or `file:./path/to/card-source` → card reference
- `skill <name>` → skill (literal second positional)
- `mcp <name>` → MCP server

```text
drwn add @me/backend@^1.0.0   # card
drwn add skill code-review     # skill
drwn add mcp github            # MCP server
```

Implementation: a clipanion router that inspects the first arg shape. Fall-through clear error message ("unrecognized add target") if neither matches.

#### Enhanced `drwn status`

The single most valuable change in (a). Today's `status` is a flat summary. Proposed: layered composition view.

```text
$ drwn status
Project: /Users/pureicis/dev/myproject
Branch: dev/my-feature

Effective composition (last-wins):
  1. @me/baseline@1.2.0          (5 skills, 3 MCP, 1 extension)
  2. @team/observability@2.0.3   (2 skills, 1 MCP)
  3. [project overlay]           (1 skill: project-runner, 1 MCP override: github)
  → 8 active skills, 5 active MCP servers, 1 extension

Downstream materialization (last apply: 2026-05-29 11:42):
  ~/.claude/         [up to date]
  ~/.codex/          [up to date]
  ~/.cursor/         [up to date]

Drift: none
```

The composition section maps **conceptually** to what flox/conda users get from `conda env list` + `conda list`: "what's installed, where did it come from." Doc 32 §6 framing applies: cards is the layer 8 unit; status is the inspection of layer 8's effective state.

#### `drwn status --why <thing>`

Already specified in `40_drwn-cli-usage-guide.md`. Keep verbatim. This is the targeted-explain surface.

#### Migration cost

Near-zero. Nothing has been published. No users have muscle memory. The rename is a strict win because it lands before the public release.

Documentation cost: rewrite the `docs-docusaurus/` reference pages with new verbs from the start (per task 27, these are stubs today). The README is rewritten anyway per task 28. The rebrand PR is the natural moment to land the verb cleanup.

### 3. (b) Project-Local Presets Design

#### Use case

A developer working in one project wants to switch between configurations without retyping. Examples:

- **"Reading mode"**: minimal cards, no heavy MCP servers, fast.
- **"Heavy work mode"**: full card stack with Beads, Parallel, MarkItDown, telemetry.
- **"Demo mode"**: clean overlay, just the cards needed to show the project.

Today (with vocabulary cleanup applied): edit `cards[]` in `config.json` by hand or via `drwn use ...`; re-run `drwn apply`. Tedious if you switch often. Error-prone if you forget what was in the previous config.

Goal: name a snapshot, switch back to it in one command.

#### Conceptual model

A **preset** is a named snapshot of the project's `cards[]` plus its overlay (`skills`, `servers`, `extensions`, `targets`). Switching a preset rewrites `<project>/.agents/drwn/config.json` to match, then triggers an apply (or prompts the user to).

Presets are stored per-project, in `<project>/.agents/drwn/presets/<name>.json`. They are git-committable so teammates can share presets.

#### Storage layout

```
<project>/.agents/drwn/
├── config.json                     # active state
├── card.lock                       # lock for active state
├── presets/
│   ├── reading.json
│   ├── heavy-work.json
│   └── demo.json
└── write-record.json
```

Preset file schema (`<project>/.agents/drwn/presets/<name>.json`):

```json
{
  "presetVersion": 1,
  "name": "heavy-work",
  "createdAt": "2026-05-29T11:42:00Z",
  "createdBy": "drwn preset save heavy-work",
  "cards": [
    "@me/baseline@^1.2.0",
    "@team/observability@^2.0.3"
  ],
  "overlay": {
    "skills": { "include": ["project-runner"], "exclude": [] },
    "servers": { "github": { ... } },
    "extensions": { "beads": { "enabled": true, "includeSkill": true } },
    "targets": { "claude": true, "codex": true, "cursor": false }
  }
}
```

Note: presets snapshot the **declaration** (card specs, overlay), not the resolution (`card.lock`). On switch, the user re-resolves against the local store. This matches how npm dependency declarations and lockfiles work; presets are like `package.json` snapshots, not `package-lock.json` snapshots.

#### Commands

```text
drwn preset save <name> [--overwrite]
drwn preset list [--json]
drwn preset show <name> [--json]
drwn preset use <name> [--no-apply]
drwn preset diff <name>
drwn preset delete <name>
drwn preset rename <old> <new>
```

Semantics:

- **`drwn preset save <name>`** — snapshot current `config.json` (cards + overlay) into `presets/<name>.json`. Refuses to overwrite without `--overwrite`. Warns if a preset with the same content already exists under a different name.
- **`drwn preset use <name>`** — rewrite `config.json` from `presets/<name>.json`. By default, immediately runs `drwn apply` after; `--no-apply` skips, leaving the user to inspect with `drwn status` or `drwn apply --dry-run`. Re-resolves card refs (writes a new `card.lock`).
- **`drwn preset list`** — table of preset name, card count, last-modified, current-active marker. Active = `config.json` matches preset content exactly.
- **`drwn preset show <name>`** — dump preset content (human-readable, or `--json`).
- **`drwn preset diff <name>`** — show diff between current `config.json` and the named preset. Useful before `use`.
- **`drwn preset delete <name>`** — remove preset file. Refuses if it is currently active unless `--force`.
- **`drwn preset rename <old> <new>`** — rename the file.

#### Interaction with cards array

Presets are sugar over `cards[]` + overlay. They don't introduce a separate state machine. The active state always lives in `config.json`; presets are saved declarations that can be restored. This keeps the layered model intact:

```
built-in → machine → project config (cards + overlay) → curated → downstream
                          ↑
                          preset save/use mutates this in place
```

#### Edge cases

- **Preset references a card that's no longer in the store.** `drwn preset use` resolves against the store; if a card is missing, the command errors with the same message users see today on a `cards.lock` miss. Hint: `drwn card show <ref>` to verify, or update the preset.
- **Preset's overlay references a skill that doesn't exist.** Same behavior as today's overlay validation. The preset is just another way to populate `config.json`.
- **Two teammates have divergent presets.** Presets are git-committable, so they're shared via the repo. Conflict resolution is git-level, not drwn-level.
- **Preset name collides with a card name.** No risk: namespaces are different. Preset names are flat strings (`reading`, `heavy-work`); card refs are `@scope/name`.

#### `drwn status` integration

When a preset is active (current `config.json` content exactly matches one of the presets), `drwn status` adds a line:

```text
Active preset: heavy-work
```

When the active state is a mutation of a preset (cards added/removed since), the line becomes:

```text
Active preset: heavy-work (modified)
```

When no preset matches, the line is omitted.

#### Why not just use git branches?

This is the natural counter-question: "Can't I just `git checkout` a branch where `config.json` has the heavy-work composition?" Yes, you can, and that's fine for some workflows. Presets are nicer when:

- You want to switch quickly without changing branches (e.g., in the middle of a long-running feature branch).
- You want presets to be orthogonal to git branches (e.g., "demo mode" works regardless of which feature branch you're on).
- You want presets that aren't committed (e.g., personal experiment presets — gitignore `presets/*.local.json` by convention).

Presets and branches compose; they don't conflict.

#### Scope summary for (b)

- 7 commands, all under `drwn preset`
- 1 new directory under `<project>/.agents/drwn/`
- 1 new schema
- 1 enhancement to `drwn status`
- 0 changes to the cards array model, the lockfile, or the materialization layer

Implementation difficulty: low. Estimated effort 1–2 sessions for a competent executor, mostly schema + file IO + status integration.

### 4. (c) User-Level Profiles Design

#### Use case

A developer wants multiple machine-wide default harnesses, switchable. Examples:

- **"Work harness"**: heavy default with corporate extensions, work MCP servers, productivity skills.
- **"Personal harness"**: lighter, weekend-project default.
- **"Research harness"**: experimental, frequent skill churn, latest cards.
- **"Before-experiment snapshot"**: backup of current default before trying something risky.

Today: there is exactly one machine-wide overlay at `~/.agents/drwn/machine.json`. To switch baselines, you edit it. No named saves, no easy restore.

The question is whether this use case is **common enough and clean enough** to justify another layer of state.

#### Two design options

##### Option C1: Profiles as snapshots (no active pointer)

`machine.json` remains the single active machine-wide config. Profiles are saved copies stored at `~/.agents/drwn/profiles/<name>.json`. Switching means restoring a profile **into** `machine.json`.

```
~/.agents/drwn/
├── machine.json              # the one active machine-wide config
├── profiles/
│   ├── work.json
│   ├── personal.json
│   └── research.json
├── skills/                   # package-backed skill bundles
├── cards/                    # store-backed cards
└── sources/                  # editable card sources
```

Commands:

```text
drwn profile save <name> [--overwrite]
drwn profile list [--json]
drwn profile show <name> [--json]
drwn profile use <name>
drwn profile diff <name>
drwn profile delete <name>
drwn profile rename <old> <new>
drwn profile export <name> > work-profile.json
drwn profile import work-profile.json [--as <name>]
```

Semantics:

- **`drwn profile save <name>`** — snapshot current `machine.json` to `profiles/<name>.json`.
- **`drwn profile use <name>`** — replace `machine.json` content with `profiles/<name>.json`. Re-resolves card-equivalent state at machine level (e.g., machine-default skill refs).
- **`drwn profile export`** / **`import`** — JSON I/O for sharing across machines. The export format is the same schema as the in-place file.

Active-state tracking: implicit. The "active profile" is whichever profile's content currently matches `machine.json`. If `machine.json` has been edited since a profile was loaded, it's "modified" — same UX as presets.

##### Option C2: Profiles as named envs with an active pointer

`machine.json` becomes a pointer file. The actual machine-wide config lives in `profiles/<name>.json`. A pointer says which is active.

```
~/.agents/drwn/
├── machine.json              # { "version": 1, "activeProfile": "work" }
├── profiles/
│   ├── work.json
│   ├── personal.json
│   └── research.json
└── ...
```

Commands: same surface as C1, but `drwn profile use <name>` rewrites only the pointer. No content is copied; the resolver reads from `profiles/<active>.json` instead of `machine.json`.

#### Comparison

| Dimension | C1 (snapshots) | C2 (active pointer) |
|---|---|---|
| State shape | `machine.json` + N optional profile files | pointer + N profile files |
| Switch operation | copy profile → `machine.json` | rewrite pointer |
| What "active" means | content of `machine.json` matches a profile | `activeProfile` field names a profile |
| Backward compatibility | machine.json semantics unchanged | machine.json structure changes; migration needed |
| Idempotency of switch | yes (copy is deterministic) | yes (pointer flip) |
| Failure modes | profile file corrupt → `machine.json` corrupt after restore | active profile file missing → degraded mode |
| Diff complexity | always compare files to `machine.json` | always compare files to `profiles/<active>.json` |
| Implementation effort | low (just IO + schema + status) | medium (resolver indirection + migration + pointer handling) |
| Mental model load | "snapshot and restore" — familiar | "named envs with an active one" — requires understanding the pointer |
| Coupling to existing code | additive, peripheral | invasive, changes machine resolution path |
| Affordance for "experimentation without losing default" | strong (save first, then edit, then restore) | strong (switch back) |
| Affordance for "share my harness" | strong (export/import) | strong (same) |
| Affordance for "two profiles active simultaneously" | impossible (one `machine.json`) | impossible (one pointer) |
| Risk of "ghost env" confusion | low — there is no env, only files | medium — pointer suggests env semantics that don't exist |

**Recommendation: Option C1.** Reasons:

1. **The use cases identified are all served by snapshots.** Save/restore for experimentation, export/import for sharing, named recall for switching. The pointer adds no new capability.
2. **Lower implementation risk.** No changes to the resolver, no migration of existing `machine.json` files, no degraded-mode handling for missing profile files.
3. **Honest naming.** "Profile" in C1 means "saved configuration I can restore." In C2 it would mean "named env that I activate," which gestures at semantics the system doesn't actually provide (no shell scope, no env activation, no isolation).
4. **C2's only structural advantage** — that you can edit a profile and have changes immediately reflected without "applying" — is also a foot-gun. Editing the inactive profile would silently fail; editing the active one would silently take effect. The snapshot model's "save → restore" loop is clearer.

#### C1 design details

##### Storage schema

`~/.agents/drwn/profiles/<name>.json`:

```json
{
  "profileVersion": 1,
  "name": "work",
  "createdAt": "2026-05-29T11:42:00Z",
  "createdBy": "drwn profile save work",
  "description": "Default for corporate work; optional, set via --description",
  "machine": {
    "version": 1,
    "skills": { "defaults": [...] },
    "servers": { "defaults": [...] },
    "extensions": { "defaults": [...] },
    "targets": { "claude": true, "codex": true, "cursor": false }
  }
}
```

The `machine` field is the literal contents of `machine.json` at save time. `name` and metadata wrap it.

##### Sharing format

`drwn profile export <name>` outputs the profile JSON to stdout. `drwn profile import <file> [--as <name>]` reads it back, validates the schema, optionally renames, and writes to `profiles/`. This gives the "share my harness" use case without standing up any infrastructure.

##### Interaction with project presets (b)

Presets and profiles compose cleanly. Profiles are machine-level (the baseline); presets are project-level (the composition on top of the baseline). The full status surface:

```text
$ drwn status
Active profile: work
Active preset: heavy-work
Project: /Users/pureicis/dev/myproject

Effective composition:
  1. [machine defaults from profile: work]
  2. @me/baseline@1.2.0
  3. @team/observability@2.0.3
  4. [project overlay from preset: heavy-work]
  → 8 active skills, 5 active MCP servers, 1 extension
```

Switching profiles is a machine-level event that affects every project. Switching presets is a project-level event. Users may want a `drwn profile use work && drwn preset use heavy-work` ritual; both commands could short-circuit if the state is already that.

##### `drwn status` integration

Already drafted above. Add:

```text
Active profile: <name> [(modified)]
```

near the top, parallel to the active-preset line.

##### Edge cases

- **No profiles defined.** `drwn profile list` returns empty; `drwn status` omits the profile line. Behavior unchanged from today.
- **Active profile name unrecorded.** Same as preset: implicit comparison. If `machine.json` matches `profiles/work.json` byte-for-byte (or canonically), it is the active profile.
- **Profile schema drift.** Add a `profileVersion: 1` field for forward compatibility. Future migration via `drwn profile migrate` if needed.
- **Profile references a skill bundle not installed.** Same as today's missing-skill behavior: `drwn doctor` reports it; `drwn apply` warns or refuses depending on flags.

#### When NOT to implement (c)

If the use cases above are speculative (i.e., the user has not actually hit the pain), defer. Profiles add three new commands, one new directory, one new schema. That's not free in cognitive load, even if individual commands are cheap. Implement only if at least one of the following is true:

- Remy regularly experiments with the machine-level harness and wants safe backup/restore.
- A scenario exists where Remy or a teammate wants to share a complete machine-wide harness identity in one file (rather than reproducing it step-by-step).
- Multi-machine setup (e.g., laptop vs desktop) where syncing a profile is more ergonomic than reproducing `library defaults add ...` calls.

If none of these hold, skip (c) for now and revisit when the use case surfaces organically.

#### Scope summary for (c)

- 9 commands under `drwn profile`
- 1 new directory under `~/.agents/drwn/`
- 1 new schema
- 1 enhancement to `drwn status` (already mostly in scope from (b))
- 0 changes to the cards array model, the project overlay model, the lockfile, or the materialization layer

Implementation difficulty: low-to-medium. Estimated effort 2–3 sessions, mostly schema + file IO + export/import + status integration.

### 5. Combined Surface After All Three

The CLI top-level command listing after (a)+(b)+(c), grouped by purpose:

```
Project composition (top-level — daily-use verbs that change intent)
  drwn init
  drwn use <card>...                    # set cards array (replace)
  drwn add <card> | skill <name> | mcp <name>   # incremental
  drwn remove <name>                    # remove a card/skill/mcp
  drwn pin <card>[@version]             # upsert by name; version-lock
  drwn clear                            # empty cards array, keep overlay
  drwn update                           # re-resolve all cards, refresh card.lock
  drwn outdated                         # list cards with newer versions
  drwn cards                            # list this project's cards (shortcut for `drwn card list`)

Materialization (the second phase; matches kubectl/terraform/chezmoi)
  drwn apply [--dry-run | --target=... | --skills-only | --mcp-only | --force]

Status & diagnostics
  drwn status [--json | --explain | --why <category>:<name>]
  drwn doctor [--json]

Card-as-artifact (drwn card namespace — authoring + abstract inspection)
  drwn card list                        # same as `drwn cards` shortcut
  drwn card show <ref>                  # inspect any card
  drwn card diff <a> <b>                # diff two card versions
  drwn card new <name> [--scope | --no-git]
  drwn card source list | show | doctor | add-skill | remove-skill | set | add-mcp | remove-mcp
  drwn card publish <ref>
  drwn card deprecate <ref>

Project presets   (new from this analysis)
  drwn preset save <name> [--overwrite]
  drwn preset use <name> [--no-apply]
  drwn preset list
  drwn preset show <name>
  drwn preset diff <name>
  drwn preset delete <name>
  drwn preset rename <old> <new>

User profiles   (new from this analysis, pending sign-off)
  drwn profile save <name> [--overwrite]
  drwn profile use <name>
  drwn profile list
  drwn profile show <name>
  drwn profile diff <name>
  drwn profile delete <name>
  drwn profile rename <old> <new>
  drwn profile export <name>
  drwn profile import <file> [--as <name>]

Inventory (library)
  drwn library list [skills | mcp]
  drwn library show <id>
  drwn library add skill <pkg-or-path>
  drwn library add mcp <json> --as <id>
  drwn library defaults add | remove skill <name>
  drwn library defaults add | remove mcp <name>

Skills (curation across machine)
  drwn skills enable <name>             # was: curate
  drwn skills disable <name>            # was: uncurate
  drwn skills list

MCP
  drwn mcp list
  drwn mcp apply [--target=... | --dry-run]   # was: mcp sync; subset of `drwn apply --mcp-only`

Extensions
  drwn extensions list
  drwn extensions show <ext>
  drwn extensions status [<ext>]
  drwn extensions doctor [<ext>]
  drwn extensions setup <ext>           # parallel, beads, markitdown

Search & discovery
  drwn search skill <query>             # --library | --catalog
  drwn search mcp <query>

Store
  drwn store status

Scan (placeholder)
  drwn scan
```

Reading this surface end-to-end gives a clear two-tier mental model:

- **Top-level verbs** are about the current project: declare intent (`use`/`add`/`pin`/`remove`/`clear`), materialize it (`apply`), or inspect it (`status`/`cards`/`doctor`).
- **`drwn card` namespace** is about cards as artifacts: their lifecycle (`new` → `source` → `publish` → `deprecate`) and inspection in the abstract (`show`/`diff` against any ref, not just the current project's).

Verb-count after cleanup: ~45 distinct commands across 13 verb-families. Today's count is ~50 distinct commands across more families. Net reduction with no semantic loss — and the daily-use verbs are flat at the top.

### 6. What This Analysis Deliberately Does Not Do

- Does not propose flox-style PATH activation. Doc 32's argument stands; the consumers don't honor PATH.
- Does not propose renaming "cards." The pnpm-for-harnesses tagline is well-positioned.
- Does not propose per-shell scope. Shells don't observe agent-tool config; that's filesystem.
- Does not propose deleting any existing commands beyond duplicates. Semantic-preserving rename only.
- Does not propose changes to the lockfile, the materialization mechanisms, or the merge algorithm.
- Does not propose a remote profile registry. Export/import via files is enough until proven otherwise.

---

## Findings

1. The cards model is architecturally settled and correct for the agent-tool problem space. Doc 32's analysis remains authoritative.
2. The CLI vocabulary is the genuine source of the "confusing" feedback. Verb overlap (`apply`/`card apply`/`card add`), unspecific verbs (`write`), and non-discoverable verbs (`detach`, `curate`) are concrete frictions that compound.
3. Multi-card composition is real but invisible at the CLI surface. `drwn status` does not show it. Users learn about composition only by reading source or docs.
4. Named project presets are the right ergonomic answer to "I want to switch between configurations for the same project." Strictly additive over the cards model.
5. Named user-level profiles are a viable answer to "I want named machine-wide harness identities." Worth doing in the snapshot variant (C1); the active-pointer variant (C2) is not worth the structural change.
6. The Flox/Conda activation model adds nothing usable to this problem space. Cards already has Flox-equivalent per-directory environments, content-store, lockfile, and composition; it cannot use Flox's PATH-activation primitive and gains nothing by pretending to.
7. The migration cost of (a) is near-zero because nothing has shipped publicly. The rebrand PR (task 28) is the natural moment to land vocabulary cleanup.

---

## Recommendations

- **R1** — **Adopt vocabulary cleanup as specified in §2.** Single materialization verb (`apply` — matches kubectl/terraform/ansible/chezmoi convention; communicates the second phase of the two-phase intent → materialization model). Top-level project-composition verbs (`use`/`add`/`remove`/`pin`/`clear`/`update`/`outdated`). Card-as-artifact under `drwn card` namespace (`new`/`source`/`publish`/`deprecate`/`show`/`diff`/`list`). Enhanced `drwn status` with composition view. Land alongside task 28 (rebrand) or immediately after.
- **R2** — **Implement project presets per §3.** Storage at `<project>/.agents/drwn/presets/<name>.json`, 7 commands under `drwn preset`, no model changes.
- **R3** — **Implement user-level profiles in the C1 (snapshot) variant per §4, subject to Remy's confirmation that at least one driving use case is real.** 9 commands under `drwn profile`, no resolver changes.
- **R4** — **Reject the Flox/Conda activation model.** Document the rejection inline in `40_drwn-cli-usage-guide.md` (or its successor) so the question doesn't get re-litigated.
- **R5** — **Update `drwn status` to show the full layered composition (profile → cards → preset → overlay → downstream)** as designed in §2 and §4. This is the single highest-value UX change in the whole package.
- **R6** — **Ship R1, R2, R3 in separate PRs, in that order.** R1 is the prerequisite (other commands assume the new vocabulary). R2 is independent. R3 is independent of R2 but easier to motivate after R2 ships and the preset pattern is established.

---

## Open Questions

1. **Naming for the cards-array unit.** This analysis uses "preset" for project-level and "profile" for user-level. Alternatives: "deck" (cards metaphor, project-level), "stack" (composition metaphor, project-level), "kit" (purpose-bound, project-level), "identity" (user-level alternative to profile). Decision is purely aesthetic but worth being deliberate.
2. **Should `drwn preset use` auto-apply?** Default proposed: yes. Argument for: most users want the new state materialized immediately. Argument against: explicit-is-better. `--no-apply` flag covers the explicit case; defaulting to auto-apply is the right ergonomic call.
3. **Should profiles ship in v1?** Open per Remy's confirmation of use cases (§4 "When NOT to implement"). If skipped now, the design here remains as a reference for future implementation.
4. **Is `drwn profile export | import` enough, or do we want a registry?** Files-only is recommended for v1. Registry can come later if there's demand.
5. **What happens to `drwn write` for users who have it in muscle memory?** Three options: (i) keep as alias for `drwn apply`, (ii) error with "renamed to apply" hint, (iii) remove. Since nothing is public, option (iii) is acceptable. Option (ii) is friendlier if even one developer (Remy) types it from habit during transition. Same question applies to the previous `drwn apply <card>` (which now means something different): an error-with-hint is the safest landing because the old usage was actively misleading.
6. **Should presets and profiles share a single `drwn snapshots` namespace?** They're structurally similar. Argument for unifying: less surface, one mental model. Argument against: project-level and machine-level are different scopes and conflating them invites confusion ("did I save a profile or a preset?"). Recommended: keep separate.

---

## Appendix

### A. "Deck" vs "Preset" Terminology

The cards metaphor naturally suggests "deck" for a project's composition. Pros: thematic, cute, distinct from the noun used elsewhere. Cons: a bit twee, and presets-as-decks doesn't extend to user-level profiles (where the metaphor stops being apt).

Recommendation: **"preset" for project-level, "profile" for user-level.** Both are familiar across other developer tools (VS Code presets, AWS profiles, Firefox profiles, etc.). The cost of the cards-deck metaphor not extending to user level is small; the cost of forcing "deck" everywhere is larger.

If Remy prefers "deck," the alternative renaming is:

| Layer | Recommended | Alternative |
|---|---|---|
| Project-level composition snapshot | preset | deck |
| User-level machine snapshot | profile | profile (no good cards metaphor) |

### B. `drwn status` Wireframe — Full Composition View

```text
$ drwn status
Project: /Users/pureicis/dev/myproject
Branch: dev/my-feature
Active profile: work (modified — 1 skill added since last save)
Active preset: heavy-work

Layered composition (last-wins resolution):
  1. machine defaults (profile: work)
     skills: code-review, ai-pair-programmer
     mcp:    github, context7
  2. card: @me/baseline@1.2.0
     skills: +project-runner, +error-explainer
     mcp:    +parallel-search
  3. card: @team/observability@2.0.3
     skills: +tracing-helper
     mcp:    +honeycomb (overrides server settings from baseline)
  4. project overlay (preset: heavy-work)
     skills: +scratch-bench
     mcp:    +github (overrides creds from profile)
     extensions: beads (enabled, includeSkill)

Effective state:
  6 skills, 5 MCP servers, 1 extension

Downstream (last apply: 2026-05-29 11:42):
  ~/.claude/         up to date
  ~/.codex/          up to date
  ~/.cursor/         up to date (1 skill overridden by user — preserved)

Drift: none
Doctor: clean
```

### C. Decision Matrix: Cost vs Value

| Recommendation | Cost | Value | Reversibility |
|---|---|---|---|
| R1 vocabulary cleanup | medium (rewrite docs + tests + help strings) | high (UX clarity for every user from day one) | low (would require deprecation cycle to undo post-publish) |
| R2 presets | low (additive feature) | high (real workflow improvement) | high (drop the commands, keep the data) |
| R3 profiles (C1) | low-to-medium (additive feature) | medium (depends on use case) | high (drop the commands, keep the data) |
| R3 profiles (C2) | medium (resolver change + migration) | low (no capability over C1) | low (resolver change is sticky) |
| R5 enhanced `drwn status` | low (one command rewrite) | very high (single command resolves most "what's happening" confusion) | high (revert command) |

### D. Why This Analysis is in `.ai/analyses/` Not `.ai/tasks/`

Per `.ai/rules/00_docs_usage.md`, analyses are "in-depth investigations, architectural analysis, technical research." This document evaluates a proposal, makes recommendations, and surfaces open questions. It is not a step-by-step implementation plan. Implementation plans for R1, R2, R3 belong in `.ai/tasks/` when each is greenlit.

### E. Relationship to Other Active Plans

- **Task 27 (docusaurus docs site)**: the new docs use forward-looking naming from day one. If R1 is approved, the docs should also use the new vocabulary from day one — `apply` instead of `write` (materialization), `use` instead of the old `apply` (project composition), and the `drwn card` namespace for authoring/inspection. Avoid landing docs that immediately need a refresh.
- **Task 28 (rebrand)**: the natural moment to bundle R1. Rebrand + vocabulary cleanup land together as a single coherent "new identity" event.
- **Task 41 (card source authoring CLI)**: just shipped `drwn card source ...` subcommands. R1 **keeps these under `drwn card source ...`** (the card-as-artifact namespace), so this task's surface lands unchanged after R1. An earlier draft of this doc proposed promoting `card source` to top-level `drwn source`; the v2 revision retracts that.
- **Task 26 (card source authoring implementation)**: pre-dates this analysis; the implementation it landed assumes the current vocabulary. R1 will touch its command surface for the `card add`/`pin`/`remove` → top-level `add`/`pin`/`remove` move, but `card source` stays.
