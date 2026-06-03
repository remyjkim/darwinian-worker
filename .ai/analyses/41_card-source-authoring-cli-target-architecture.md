# Harness Cards: Card Source Authoring CLI - Target Architecture

**Date**: 2026-05-27
**Status**: Draft
**Author**: Claude + Remy
**References**: [analyses/29_harness-cards-target-architecture-v1_1.md, analyses/36_harness-cards-bundle-resolver-target-architecture.md, analyses/38_bharness-agent-skills.md, knowledges/02_per-project-config-guide.md, cli/core/card-store.ts, cli/commands/card/*.ts]

---

## 1. Executive Summary

The current `bgng` card architecture is strong on the **consumer** side and weak
on the **authoring** side.

Consumer-side workflows are first-class:

- `bgng apply`
- `bgng card add`
- `bgng card pin`
- `bgng card remove`
- `bgng card update`
- `bgng card outdated`
- `bgng write`
- `bgng doctor`

Author-side workflows are not:

- `bgng card new` creates an empty source skeleton
- `bgng card publish` snapshots the source into the immutable store
- everything between those two steps is mostly manual filesystem editing

That gap is now meaningful because cards are no longer an experimental wrapper.
They are the canonical reusable packaging unit for project harness intent, and
card-bundled skills are authoritative for materialization.

This document proposes a new authoring namespace:

```text
bgng card source ...
```

The key design decision is to make **card source editing first-class and
semantic**, while preserving the current split:

- `bgng card source ...` → editable source authoring
- `bgng card publish/show/diff/deprecate` → published immutable versions
- `bgng apply/card add/pin/remove/update/...` → project consumption

Recommendation:

- keep `bgng card new` as the entry point that creates a source
- add a dedicated `bgng card source ...` namespace for source mutation and
  validation
- do **not** overload the existing `bgng card ...` consumer commands
- use **copy semantics**, not symlink semantics, when adding skill content into
  a card source

This architecture is the smallest clean extension that turns card authoring into
an actual product surface without destabilizing the published-card and
project-consumer workflows.

---

## 2. Problem Statement

Today, adding a skill to a project is semantic:

```bash
bgng add skill <name>
bgng write
```

Today, adding a skill to a card source is not semantic. The author must:

1. locate the card source directory under `~/.agents/bgng/sources/...`
2. create or copy `skills/<name>/`
3. edit `card.json`
4. ensure `skills.include` matches the on-disk directories
5. publish

That has four concrete problems:

1. **Asymmetry.** Projects have a first-class skill-add flow; card sources do
   not.
2. **Error-proneness.** It is easy to update `card.json` but forget the skill
   directory, or copy the directory but forget `skills.include`.
3. **Agent UX gap.** Agentic wrappers can safely drive consumer workflows, but
   card authoring still degrades into ad hoc file surgery.
4. **No source-level inspection surface.** The current CLI lacks a clean way to
   ask: "What is in this card source, what is missing, and what will publish?"

The architecture already distinguishes clearly between:

- source: `~/.agents/bgng/sources/<scope>/<name>/`
- published: `~/.agents/bgng/cards/<scope>/<name>/<version>/`
- consumed: `<project>/.agents/bgng/config.json` + `card.lock`

The CLI should expose that distinction explicitly.

---

## 3. Goals and Non-Goals

### 3.1 Goals

1. Make source authoring a first-class CLI surface.
2. Let authors add or remove bundled skills semantically, without manual JSON
   edits for common paths.
3. Let authors manage basic card manifest metadata semantically.
4. Provide a read-only source inspection and diagnostics surface.
5. Preserve the existing source/publish/consume split.
6. Keep published cards self-contained and immutable.
7. Keep the design safe for agent-driven use:
   - predictable
   - previewable where possible
   - explicit about blast radius

### 3.2 Non-Goals

1. No redesign of published-card or project-consumer commands.
2. No remote registry work.
3. No solver or dependency graph between cards.
4. No editor/interactive TUI authoring surface in v1.
5. No symlink-backed published card content model.
6. No full arbitrary JSON-patch command for manifests in v1.

---

## 4. Design Alternatives

### Option A: Extend `bgng card ...` directly

Examples:

- `bgng card add-skill ...`
- `bgng card remove-skill ...`
- `bgng card set-description ...`

Pros:

- short commands
- minimal namespace growth

Cons:

- mixes editable source mutation with published-card inspection and
  project-consumer operations
- `bgng card add` already means "add a card to the current project"
- creates ambiguity about whether a command touches source, published store, or
  project config

Verdict: not recommended.

### Option B: Add `bgng card source ...`

Examples:

- `bgng card source show`
- `bgng card source doctor`
- `bgng card source add-skill`
- `bgng card source remove-skill`
- `bgng card source add-mcp`
- `bgng card source remove-mcp`
- `bgng card source set`

Pros:

- maps exactly onto the current architecture
- keeps source mutation separate from publish and consume
- scales cleanly to broader authoring operations
- easy to teach to humans and agents

Cons:

- slightly more verbose

Verdict: recommended.

### Option C: Add a generic `bgng card edit <name>`

Pros:

- short and friendly

Cons:

- too magical
- difficult to automate
- unclear mutation contract
- poor fit for non-interactive agent workflows

Verdict: reject.

---

## 5. Architecture Decision

Adopt **Option B**:

```text
bgng card source ...
```

The full card lifecycle becomes:

```text
bgng card new                        -> create editable source
bgng card source ...                -> mutate/inspect the source
bgng card publish                   -> snapshot source into immutable store
bgng card show/diff/deprecate       -> inspect published versions
bgng apply / bgng card add / ...    -> consume cards from projects
```

This preserves the architecture defined in
`29_harness-cards-target-architecture-v1_1.md` while filling the authoring gap
that document left intentionally manual.

---

## 6. Proposed CLI Surface

### 6.1 Read-only commands

#### `bgng card source list [--json]`

Lists editable card sources under `~/.agents/bgng/sources/`.

Human output:

```text
name                             version  path
@beginning/harness-skills        0.1.0    ~/.agents/bgng/sources/@beginning/harness-skills
@beginning/workspace-experimental 0.1.0   ~/.agents/bgng/sources/@beginning/workspace-experimental
```

JSON output:

```json
[
  {
    "name": "@beginning/harness-skills",
    "version": "0.1.0",
    "path": "/Users/.../.agents/bgng/sources/@beginning/harness-skills"
  }
]
```

#### `bgng card source show <name> [--json]`

Shows:

- source path
- parsed `card.json`
- optional `package.json`
- bundled skills discovered under `skills/`
- bundled MCP server files discovered under `mcp-servers/`
- a mismatch summary

This is the source-level analogue of `bgng card show`.

#### `bgng card source doctor [name] [--json]`

Validates source integrity without publishing.

Checks:

- `card.json` parses and validates
- `package.json` name/version match when present
- every `skills.include` entry has `skills/<name>/SKILL.md`
- every `mcp-servers/*.json` parses
- every skill dir not listed in `skills.include` is reported as orphaned bundled
  content

This is explicitly read-only and should be the pre-publish safety surface for
agents.

### 6.2 Skill mutation commands

#### `bgng card source add-skill <card> <skill> [--from <source>] [--replace] [--dry-run] [--json]`

Purpose:

- copy a skill into the card source
- add the skill name to `card.json.skills.include`

`<source>` resolution:

1. explicit filesystem path if provided
2. exact repo-native skill by name
3. exact local library skill by name
4. exact package-backed skill by name

Ambiguity is an error.

Behavior:

- destination is always `~/.agents/bgng/sources/<card>/skills/<skill-name>/`
- content is copied, never symlinked
- if the skill already exists:
  - default: fail
  - `--replace`: overwrite the bundled copy from the resolved source
- append to `skills.include` if absent
- preserve order of existing entries; new skill appends at the end

`--dry-run`:

- no files written
- show planned filesystem copies and manifest mutation

#### `bgng card source remove-skill <card> <skill> [--keep-files] [--dry-run] [--json]`

Purpose:

- remove a bundled skill from the card source

Default behavior:

- delete `skills/<skill>/`
- remove `<skill>` from `skills.include`

`--keep-files`:

- remove from `skills.include`
- keep the directory on disk
- useful for staged/incomplete refactors

This makes the destructive behavior explicit instead of forcing authors into
manual rm + JSON edits.

### 6.3 MCP source mutation commands

The architecture docs already give cards a place for per-server MCP files under
`mcp-servers/`, even though the current implementation still primarily consumes
`manifest.servers`.

To keep the authoring surface aligned with the store layout, add:

#### `bgng card source add-mcp <card> <server-id> [--from <source>] [--replace] [--dry-run] [--json]`

Behavior:

- resolve the MCP definition from:
  1. explicit file path
  2. local user MCP library
- copy it into `mcp-servers/<server-id>.json`
- optionally, in v1, mirror the definition into `card.json.servers[server-id]`
  so current consumers can still use the manifest path

Recommendation:

- v1 should keep `card.json.servers` as the canonical consumption path
- `mcp-servers/` is still worthwhile as authoring content because it matches the
  target store layout and future architecture
- source doctor should warn if `mcp-servers/<id>.json` and `card.json.servers[id]`
  diverge

#### `bgng card source remove-mcp <card> <server-id> [--keep-files] [--dry-run] [--json]`

Behavior:

- remove `card.json.servers[server-id]`
- remove `mcp-servers/<server-id>.json` unless `--keep-files`

### 6.4 Manifest mutation commands

#### `bgng card source set <card> [flags...] [--dry-run] [--json]`

This is the semantic manifest editor for common fields.

Initial flags:

- `--description <text>`
- `--version <semver>`
- `--license <spdx-or-text>`
- `--harness-min-version <semver>`

Deliberately out of scope for v1:

- arbitrary JSON patch
- extension mutation
- target mutation
- bundle-range mutation

Those can be added later once the high-value authoring paths are proven.

### 6.5 Publish integration

`bgng card publish` remains the same command, but its ergonomics improve because
authors now have:

- `card source show`
- `card source doctor`
- `card source add-skill`
- `card source remove-skill`
- `card source add-mcp`
- `card source remove-mcp`
- `card source set`

before publish.

This keeps publish as a snapshot operation, not an editing surface.

---

## 7. File Semantics

### 7.1 Copy, never symlink

This is the most important implementation rule.

When adding a skill to a card source, the CLI must:

- copy files into the source directory
- never create a symlink back to the repo or library

Reasons:

1. Published cards are supposed to be self-contained and immutable.
2. Integrity hashing is over actual published file content.
3. Symlink-backed source content makes publish behavior less obvious and weakens
   reproducibility.
4. Copy semantics are easier to explain and safer for agents.

### 7.2 Manifest/directory synchronization

The source-authoring commands should maintain these invariants automatically:

1. every listed `skills.include` entry has a skill dir with `SKILL.md`
2. `package.json.name` matches `card.json.name` when present
3. `package.json.version` matches `card.json.version` when present

Commands should mutate both the filesystem and manifest together.

### 7.3 Stable ordering

To keep diffs predictable:

- do not auto-sort `skills.include`
- preserve existing order
- append new skills
- remove only the named entry

The card author controls semantic ordering.

---

## 8. Agent-Safety Contract

The new surface should be friendlier for agents than the current manual
filesystem workflow.

Recommended contract:

- every mutating `card source` command supports `--dry-run`
- every mutating `card source` command supports `--json`
- `show` and `doctor` are read-only
- destructive operations (`remove-skill`, `remove-mcp`) say exactly what files
  will be removed

This closes the exact gap surfaced by the new agent-skills work:

- today agents can safely consume cards
- after this change they can also safely author them

---

## 9. Example Workflows

### 9.1 Create a new reusable skill card

```bash
bgng card new @beginning/harness-skills --no-git
bgng card source add-skill @beginning/harness-skills bootstrap-project --dry-run --json
bgng card source add-skill @beginning/harness-skills bootstrap-project
bgng card source add-skill @beginning/harness-skills inspect-harness
bgng card source set @beginning/harness-skills --description "Stable card for Beginning Harness operator skills."
bgng card source doctor @beginning/harness-skills --json
bgng card publish @beginning/harness-skills
```

### 9.2 Refresh a bundled skill from the canonical repo copy

```bash
bgng card source add-skill @beginning/harness-skills inspect-harness --replace --dry-run --json
bgng card source add-skill @beginning/harness-skills inspect-harness --replace
bgng card source doctor @beginning/harness-skills
bgng card publish @beginning/harness-skills
```

### 9.3 Remove an experimental skill from a source

```bash
bgng card source remove-skill @beginning/harness-skills organize-workspace --dry-run --json
bgng card source remove-skill @beginning/harness-skills organize-workspace
```

---

## 10. Interaction With Existing Commands

This design preserves existing meanings:

- `bgng card add` still means add a card to the current project
- `bgng add skill` still means add a skill to the current project overlay
- `bgng card publish` still means snapshot a source into the immutable store

That separation is valuable and should not be blurred.

The mental model becomes:

| Layer | Command family |
| --- | --- |
| Project skill activation | `bgng add skill ...` |
| Card source authoring | `bgng card source ...` |
| Published card lifecycle | `bgng card publish/show/diff/deprecate` |
| Project card consumption | `bgng apply`, `bgng card add/pin/remove/update/...` |

---

## 11. Implementation Notes

### 11.1 Suggested module split

- `cli/commands/card/source/*.ts`
- `cli/core/card-source.ts`

Suggested core helpers:

- `listCardSources(agentsDir)`
- `readCardSource(agentsDir, name)`
- `doctorCardSource(agentsDir, name?)`
- `addSkillToCardSource(agentsDir, cardName, sourceSpec, options)`
- `removeSkillFromCardSource(agentsDir, cardName, skillName, options)`
- `addMcpToCardSource(agentsDir, cardName, serverId, options)`
- `removeMcpFromCardSource(agentsDir, cardName, serverId, options)`
- `setCardSourceFields(agentsDir, cardName, patch, options)`

### 11.2 Reuse existing validation

Do not invent a parallel validator.

Reuse:

- `assertValidCardManifest`
- source path resolvers from `store-paths.ts`
- existing library resolution logic for skills and MCP definitions

### 11.3 Publish-time validation remains necessary

Even with new authoring commands, `bgng card publish` must keep its source
validation. The source-authoring layer improves UX; it does not replace publish
as the final correctness gate.

---

## 12. Testing Strategy

### 12.1 Command tests

Add CLI tests for:

- `card source list`
- `card source show --json`
- `card source doctor --json`
- `card source add-skill --dry-run --json`
- `card source add-skill`
- `card source add-skill --replace`
- `card source remove-skill`
- `card source set --dry-run --json`
- `card source add-mcp`
- `card source remove-mcp`

### 12.2 End-to-end tests

Minimum e2e chain:

1. `card new`
2. `card source add-skill`
3. `card source doctor`
4. `card publish`
5. `apply`
6. `write --dry-run`

### 12.3 Regression targets

Protect against:

- manifest entry added without directory
- directory copied without manifest update
- symlink creation instead of copy
- package.json/card.json name-version drift
- card source mutation accidentally touching published versions

---

## 13. Recommendation

The current CLI architecture does **not** need a major redesign. It needs one
missing layer completed.

That missing layer is:

```text
editable card source authoring as a semantic CLI surface
```

Recommendation:

1. Add `bgng card source ...`
2. Start with:
   - `list`
   - `show`
   - `doctor`
   - `add-skill`
   - `remove-skill`
   - `add-mcp`
   - `remove-mcp`
   - `set`
3. Keep publish and consume commands unchanged
4. Use copy semantics only
5. Require `--dry-run` + `--json` support for all mutating source commands

That is sufficient to turn card authoring from a manual escape hatch into a
first-class part of the product.
