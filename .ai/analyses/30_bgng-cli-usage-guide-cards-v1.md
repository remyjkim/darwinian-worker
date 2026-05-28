# BGNG CLI Usage Guide: Cards v1

**Date**: 2026-05-20
**Author**: Remy + Claude
**Status**: Final for implemented local-store cards v1.1
**References**: [analyses/29_harness-cards-target-architecture-v1_1.md, analyses/28_harness-cards-architecture-assessment.md, tasks/14_harness-cards-implementation-plan.md, knowledges/01_agents-cli-usage-guide.md, knowledges/02_per-project-config-guide.md, knowledges/03_npm-skill-bundles-guide.md]

---

## Executive Summary

This guide describes the `bgng` CLI after the Harness Cards v1 architecture has been implemented. It is written as operator documentation: how to initialize a project, apply cards, write downstream tool state, author reusable cards, inspect drift, migrate the store, and diagnose problems.

Implementation note: this revision documents the local-store card lifecycle that
is implemented in this repository. Local immutable card publishing, `file:`
development refs, project lockfiles, project-local materialization, write
records, drift refusal, store migration, and `status --why/--explain` are
implemented and verified. Remote registry fetching and bundle intersection
resolution remain architecture guidance rather than active command behavior.

The core mental model is:

```text
project config + card.lock + local store -> effective harness state -> bgng write -> Claude/Codex/Cursor files
```

Cards are named, semver-versioned bundles of harness intent. A project pins one or more cards in `.agents/bgng/config.json`; `bgng` resolves those constraints into `.agents/bgng/card.lock`; `bgng write` materializes the resolved state into project-local `.claude/`, `.codex/`, and `.cursor/` files when run inside a project.

The most important behavior changes from the pre-cards CLI are:

- `bgng write` inside a project writes project-local tool state, not home-directory tool state.
- `bgng write` refuses to overwrite hand-edited managed regions unless `--force` is used.
- `bgng add extension` is gone; use `bgng extensions add`.
- Legacy store layout is upgraded explicitly with `bgng store migrate`.

---

## 1. What `bgng` Manages

`bgng` is the local control plane for a developer's agent tooling. It manages reusable harness inventory and materializes that inventory into downstream tools.

It can manage:

- shared skills
- MCP server definitions
- named extensions such as `beads`, `parallel`, and `markitdown`
- downstream target enablement for Claude, Codex, and Cursor
- reusable Harness Cards
- project overlays on top of cards
- write records for safe drift detection and cleanup

It does not manage:

- arbitrary user content outside its managed regions
- secrets for MCP servers
- authentication for external CLIs
- remote card registry infrastructure beyond npm/file sources in v1
- tool-specific behavior after Claude/Codex/Cursor read the generated files

---

## 2. Execution Modes

### 2.1 Installed CLI

Use the installed command in normal operation:

```bash
bgng --help
bgng --version
bgng status
bgng write --dry-run
```

### 2.2 Repo-local CLI

Use the repo-local wrapper while developing this repository:

```bash
bun run bgng -- --help
bun run bgng -- status
bun run bgng -- write --dry-run
```

Both forms execute the same command implementation. Examples below use `bgng`.

---

## 3. State Model

### 3.1 Machine Store

Cards-era `bgng` stores user-managed inventory under:

```text
~/.agents/bgng/
|-- store.json
|-- machine.json
|-- cards/
|-- sources/
|-- skills/
|-- mcp-servers/
|-- generated/
|-- cache/
`-- global-write-record.json
```

Important files and directories:

| Path | Purpose |
|---|---|
| `store.json` | Store metadata and schema version. |
| `machine.json` | Machine-scope overlay used when `bgng write` runs outside any project. |
| `cards/<scope>/<name>/<version>/` | Immutable published card versions. |
| `sources/<scope>/<name>/` | Editable card source directories. |
| `skills/<scope>/<pkg>/<version>/` | Standalone skill bundles migrated from the old package cache. |
| `mcp-servers/<id>.json` | User MCP server definitions, one file per server. |
| `generated/` | Generated files such as Cursor MCP payloads. |
| `global-write-record.json` | Machine-scope materialization record. |

### 3.2 Project Files

A cards-enabled project uses:

```text
<project>/.agents/bgng/
|-- config.json
|-- card.lock
`-- write-record.json
```

| File | Git policy | Purpose |
|---|---|---|
| `config.json` | tracked | User-authored project manifest. Contains `version`, `cards`, and optional overlays. |
| `card.lock` | tracked | Exact resolved card and bundle versions. Required for reproducibility. |
| `write-record.json` | ignored | Per-machine materialization state. Used for drift detection and safe cleanup. |

`bgng init` creates the project config and ensures the write record is ignored.

### 3.3 Project Scope vs Machine Scope

`bgng` determines scope by walking upward from the current directory for `.agents/bgng/config.json`.

When a project config is found:

```text
built-in defaults -> user library -> cards in card.lock order -> project overlay
```

`bgng write` materializes into:

```text
<project>/.claude/
<project>/.codex/
<project>/.cursor/
```

When no project config is found:

```text
built-in defaults -> user library -> machine.json overlay
```

`bgng write` materializes into:

```text
~/.claude/
~/.codex/
~/.cursor/
```

Machine defaults do not apply inside projects that have cards. Project cards and the project overlay are the project source of truth.

---

## 4. First-run Workflows

### 4.1 Existing User Upgrading To Cards

Run the explicit migration once:

```bash
bgng store status
bgng store migrate
bgng store status
bgng doctor
```

If you want to remove old bgng-owned global symlinks after verifying the new project-local write model:

```bash
bgng store migrate --cleanup-legacy-orphans
```

For unattended migration:

```bash
bgng store migrate --yes
```

The migration archives the pre-cards layout before activating the new layout. It does not silently auto-migrate on ordinary commands.

### 4.2 New Project From An Existing Card

From the project root:

```bash
bgng init
bgng apply @me/backend-service@^1.0.0
bgng write --dry-run
bgng write
bgng status
```

Equivalent one-step apply and write:

```bash
bgng apply @me/backend-service@^1.0.0 --write
```

If the mutation succeeds but the chained write fails, the mutation is preserved. Fix the write issue and rerun:

```bash
bgng write
```

### 4.3 New Overlay-only Project

Use this when a project needs local settings but no cards yet:

```bash
bgng init
bgng add skill parallel-web-search
bgng add mcp context7
bgng extensions add beads --include-skill
bgng write --dry-run
bgng write
```

`cards` may be absent or empty. The project overlay still applies.

### 4.4 Author A Card From A Working Project

From the project whose setup you want to package:

```bash
bgng card new @me/backend-service --from-project
cd ~/.agents/bgng/sources/@me/backend-service
```

Edit `card.json` and any inline content. Then publish:

```bash
bgng card publish @me/backend-service
bgng card show @me/backend-service@1.0.0
```

Apply it to another project:

```bash
cd ~/work/another-service
bgng init
bgng apply @me/backend-service@^1.0.0 --write
```

### 4.5 Update A Project

Check for newer card versions:

```bash
bgng card outdated
```

Update within existing constraints:

```bash
bgng update
bgng write --dry-run
bgng write
```

Update one card:

```bash
bgng update @me/backend-service --write
```

Use CI-style non-zero behavior when updates exist:

```bash
bgng card outdated --check
```

---

## 5. Universal Command Behavior

### 5.1 Common Flags

| Flag | Applies to | Meaning |
|---|---|---|
| `--dry-run` | mutating commands | Preview without writing. |
| `--json` | structured-output commands | Emit machine-readable JSON. |
| `--write` | card apply/add/pin/remove/update and aliases | Run `bgng write` after a successful mutation. |
| `--explain` | `status`, `card status` | Include full resolution trails. |
| `--why <category>:<name>` | `status` | Explain one effective item. |
| `--force` | `write` | Overwrite drift in managed regions. |

### 5.2 `--write` Contract

`--write` never rolls back the mutation.

If this command succeeds:

```bash
bgng card add @me/observability@^1.0.0 --write
```

but the chained write fails, the project config and lockfile remain updated. Rerun `bgng write` after fixing the issue.

### 5.3 `--why` Syntax

Use the explicit category form when possible:

```bash
bgng status --why card:@me/backend-service
bgng status --why skill:parallel-web-search
bgng status --why server:context7
bgng status --why extension:beads
bgng status --why target:claude
```

Bare names are allowed only when unambiguous:

```bash
bgng status --why context7
```

If a bare name matches multiple categories, `bgng` aborts and prints disambiguation options.

### 5.4 Exit Codes

Expected exit behavior:

| Situation | Exit |
|---|---|
| Command succeeds | `0` |
| Read-only command finds warnings | `0` unless a `--check` flag says otherwise |
| `card outdated --check` finds updates | non-zero |
| Invalid user input | non-zero |
| Drift detected during `write` without `--force` | non-zero |
| Empty bundle range intersection | non-zero |
| Chained `--write` fails after mutation | chained write exit code |

---

## 6. Top-level Commands

| Command | Purpose |
|---|---|
| `bgng init` | Scaffold project config. |
| `bgng status` | At-a-glance harness state across machine, project, cards, skills, MCP, extensions, targets, and store. |
| `bgng write` | Materialize effective state into downstream tool files. |
| `bgng doctor` | Health checks and drift diagnostics. |
| `bgng apply <ref>` | Alias for `bgng card apply <ref>`. |
| `bgng update [<name>]` | Alias for `bgng card update [<name>]`. |
| `bgng scan` | Non-mutating local discovery surface. |

### 6.1 `bgng init`

Use:

```bash
bgng init
bgng init --non-interactive
bgng init --minimal
bgng init --force
```

What it creates:

```text
<project>/.agents/bgng/config.json
<project>/.agents/bgng/.gitignore
```

Minimal config:

```json
{
  "version": 1
}
```

Use `--force` only when you intentionally want to overwrite or repair existing init output.

### 6.2 `bgng status`

Use:

```bash
bgng status
bgng status --json
bgng status --explain
bgng status --why skill:parallel-web-search
```

Reports:

- active scope and project root
- store status
- cards configured and locked
- project overlay summary
- skills included/excluded and their origins
- MCP servers enabled/disabled and their definition source
- extensions enabled and derived settings
- downstream targets
- write-record status
- warnings from resolution or materialization state

Use `status` for daily inspection. Use `doctor` when you want health checks and remediation hints.

### 6.3 `bgng write`

Use:

```bash
bgng write
bgng write --dry-run
bgng write --json
bgng write --force
bgng write --target=claude
bgng write --skills-only
bgng write --mcp-only
```

Step-by-step behavior:

1. Determine project or machine scope.
2. Verify lockfile and card integrity when cards are present.
3. Resolve cards, standalone inventory, and overlay into effective state.
4. Compare desired output with the prior write record.
5. Detect drift in managed regions.
6. Materialize symlinks, managed fields, and generated files.
7. Update the write record.

`bgng write` is idempotent. Running it twice with no input changes should produce no writes on the second run.

### 6.4 `bgng doctor`

Use:

```bash
bgng doctor
bgng doctor --json
```

Checks:

- missing or corrupt store files
- legacy layout detection
- invalid project config
- invalid card lockfile
- missing or corrupt write record
- stale or broken skill symlinks
- managed-field drift
- unknown skill/server/extension references
- disabled targets with existing generated state
- card integrity mismatches
- deprecated locked card versions

`doctor` is report-only. It does not automatically fix, delete, migrate, or rewrite files.

### 6.5 `bgng scan`

Use:

```bash
bgng scan
bgng scan --json
```

`scan` is non-mutating discovery. It inspects local tool configuration and reports candidates that could be promoted into bgng-managed config later. Cards-specific discovery lives under `bgng card list` and `bgng card show`.

---

## 7. Store Commands

### 7.1 `bgng store status`

Use:

```bash
bgng store status
bgng store status --json
```

Reports:

- store path
- schema version
- card count
- source count
- standalone skill bundle count
- MCP server definition count
- cache size
- whether legacy layout was detected

### 7.2 `bgng store migrate`

Use:

```bash
bgng store migrate
bgng store migrate --yes
bgng store migrate --cleanup-legacy-orphans
bgng store migrate --cleanup-legacy-orphans --yes
```

What migrates:

| Legacy path | Cards-era path |
|---|---|
| `~/.agents/bgng/config.json` | `~/.agents/bgng/machine.json` |
| `~/.agents/library/mcp-servers.json` | `~/.agents/bgng/mcp-servers/<id>.json` |
| `~/.agents/packages/skills/` | `~/.agents/bgng/skills/` |

The command stages the new layout, validates it, archives the old layout, then activates the new layout. If the command fails before activation, the old layout remains intact.

### 7.3 Deferred Store Commands

These are not part of v1 daily usage unless implemented as a later minor release:

```bash
bgng store prune
bgng store repair
bgng store remote add <name> <url>
bgng store remote remove <name>
bgng store push
bgng store pull
```

---

## 8. Card Commands

Cards have two lifecycles:

- authoring: `new`, `publish`, `diff`, `deprecate`
- consuming: `apply`, `add`, `pin`, `remove`, `update`, `outdated`, `detach`, `status`

Inspection commands support both lifecycles: `list` and `show`.

### 8.1 Card References

Common reference forms:

```text
@scope/name@1.2.3
@scope/name@^1.2.0
@scope/name
file:../path/to/card-source
```

Rules:

- explicit versions must be strict semver
- omitted range means `*`
- `file:` cards are for local development
- prereleases are ignored unless the range opts into prereleases
- deprecated versions warn but do not fail if they are pinned

### 8.2 `bgng card new`

Use:

```bash
bgng card new @me/backend-service
bgng card new @me/backend-service --from-project
bgng card new @me/backend-service --from-card @team/base@1.2.0
bgng card new @me/backend-service --no-git
```

Creates:

```text
~/.agents/bgng/sources/@me/backend-service/
|-- card.json
|-- skills/
`-- mcp-servers/
```

By default, the source directory is initialized as a git repo. Use `--no-git` to skip that.

`--from-project` snapshots the current project's effective intent into a starting card manifest. Review the generated manifest before publishing.

### 8.3 `bgng card publish`

Use:

```bash
bgng card publish @me/backend-service
bgng card publish @me/backend-service --no-warn
bgng card publish @me/backend-service --json
```

Publishes the editable source into an immutable store path:

```text
~/.agents/bgng/cards/@me/backend-service/1.2.0/
```

Publish validates:

- `card.json` schema
- strict semver
- `harness.minVersion`
- referenced inline skills
- MCP definition files are non-empty valid JSON
- structural diff classification against prior versions

If the declared version bump is smaller than the structural diff requires, `publish` warns and asks for confirmation. Use `--no-warn` only in scripted workflows that already performed the check.

### 8.4 `bgng card diff`

Use:

```bash
bgng card diff @me/backend-service@1.0.0 @me/backend-service@1.1.0
bgng card diff @me/backend-service@1.0.0 @me/backend-service@1.1.0 --json
bgng card diff @me/backend-service@1.0.0 @me/backend-service@1.1.0 --inline-diff
```

Shows structural changes and classifies them as major, minor, or patch.

Examples of major changes:

- removing a skill
- disabling a previously enabled server
- disabling an extension
- disabling a target
- raising `harness.minVersion`

Examples of minor changes:

- adding a skill
- enabling a new server
- enabling a new extension
- adding or widening a bundle range

Metadata-only changes classify as patch.

### 8.5 `bgng card deprecate`

Use:

```bash
bgng card deprecate @me/backend-service@1.0.0 --reason "Use 1.1.0; fixes server config."
bgng card deprecate @me/backend-service@1.0.0 --json
```

Deprecation is advisory. It warns during apply, update, status, and write, but it does not break pinned reproducibility.

### 8.6 `bgng card apply`

Use:

```bash
bgng card apply @me/backend-service@^1.0.0
bgng card apply @me/base@^1.0.0 @me/backend@^2.0.0
bgng apply @me/backend-service@^1.0.0
bgng card apply @me/backend-service@^1.0.0 --write
```

`apply` replaces the project's entire `cards` array with the provided refs. It resolves the refs and writes `card.lock`.

Use `apply` when you want a project to adopt a fresh card set.

### 8.7 `bgng card add`

Use:

```bash
bgng card add @me/observability@^1.0.0
bgng card add @me/observability@^1.0.0 --write
```

`add` appends cards to the existing `cards` array and refreshes the lockfile.

Use `add` when you want to layer another card on top of the current card stack.

### 8.8 `bgng card pin`

Use:

```bash
bgng card pin @me/backend-service@1.2.3
bgng card pin @me/backend-service@~1.2.0 --write
```

`pin` changes the constraint for one existing card by name and refreshes the lockfile.

Use `pin` when a project should stop floating on a wider range.

### 8.9 `bgng card remove`

Use:

```bash
bgng card remove @me/observability
bgng card remove @me/observability --write
```

Removes cards by name and refreshes the lockfile. The next `bgng write` removes bgng-owned materialized paths that came only from the removed card, using `write-record.json` as the ownership record.

### 8.10 `bgng card update`

Use:

```bash
bgng card update
bgng card update @me/backend-service
bgng update
bgng update @me/backend-service --write
```

Updates locked versions within existing constraints. It does not change the constraints in `config.json`.

### 8.11 `bgng card outdated`

Use:

```bash
bgng card outdated
bgng card outdated --json
bgng card outdated --check
```

Reports newer versions available within or beyond current constraints. `--check` is intended for CI and exits non-zero when updates are available.

### 8.12 `bgng card detach`

Use:

```bash
bgng card detach
bgng card detach --write
```

Removes all cards from the project and leaves any explicit project overlay intact. This is useful when a project wants to return to overlay-only management.

### 8.13 `bgng card list`

Use:

```bash
bgng card list
bgng card list --sources
bgng card list --json
```

Shows cards present in the local store. `--sources` includes editable sources under `~/.agents/bgng/sources/`.

### 8.14 `bgng card show`

Use:

```bash
bgng card show @me/backend-service
bgng card show @me/backend-service@1.2.0
bgng card show @me/backend-service@1.2.0 --json
```

Shows manifest details, available versions, deprecation status, inline content summary, bundle constraints, and resolved MCP definition hints.

### 8.15 `bgng card status`

Use:

```bash
bgng card status
bgng card status --json
bgng card status --explain
```

Reports:

- configured card refs
- locked exact versions
- lockfile freshness
- integrity status
- deprecated versions
- bundle resolution
- effective merge order
- card-derived skills, servers, extensions, and targets

Use `bgng card status` for card-specific detail. Use `bgng status` for the full harness summary.

---

## 9. Project Config Examples

### 9.1 Basic Cards Project

```json
{
  "version": 1,
  "cards": [
    "@me/backend-service@^1.0.0"
  ]
}
```

### 9.2 Multiple Cards With Overlay

```json
{
  "version": 1,
  "cards": [
    "@me/base@^1.0.0",
    "@me/backend-service@^2.0.0",
    "@me/observability@^1.0.0"
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

Merge rules:

- cards are applied in declared order
- later cards override earlier cards on conflicting definitions
- project overlay applies last
- `skills.exclude` only exists in the project overlay, not in cards

### 9.3 Local Card Development

```json
{
  "version": 1,
  "cards": [
    "file:../cards/backend-service"
  ]
}
```

`file:` cards are re-hashed on every write. If content changes, the lockfile updates. Expect lockfile churn while iterating.

---

## 10. MCP Resolution

A card can enable a server by key:

```json
{
  "servers": {
    "context7": { "enabled": true }
  }
}
```

The server definition resolves in this order:

1. card-inline file: `<card>/mcp-servers/context7.json`
2. user library file: `~/.agents/bgng/mcp-servers/context7.json`
3. packaged baseline: `registry/mcp-servers.json`

The project overlay applies after all three layers. If the project overlay supplies a full definition, that project-local definition wins.

Inspect why a server is active:

```bash
bgng status --why server:context7
bgng card status --explain
```

If no definition exists for an enabled server:

- `bgng doctor` reports an unknown server reference
- `bgng write` skips it with a warning

---

## 11. Bundle Resolution

Cards can depend on standalone skill bundles:

```json
{
  "bundles": {
    "@example/research-skills": "^1.0.0"
  }
}
```

When multiple cards depend on the same bundle:

1. `bgng` collects every range.
2. It computes the range intersection.
3. It picks the highest available version satisfying the intersection.
4. If the intersection is empty, apply/update fails.

Example failure:

```text
Bundle conflict: @x/research-skills
  card @me/baseline declares ^1.0.0
  card @me/extras declares ^2.0.0
No version satisfies both ranges.
```

Fix by updating one card, removing one card, or publishing a compatible card version.

---

## 12. Write Materialization

`bgng write` uses three mechanisms.

### 12.1 Skills: Symlinks

Skills are materialized as one directory symlink per skill:

```text
<scope>/.claude/skills/parallel-web-search -> ~/.agents/bgng/cards/@me/base/1.2.0/skills/parallel-web-search
<scope>/.codex/skills/parallel-web-search -> ~/.agents/bgng/cards/@me/base/1.2.0/skills/parallel-web-search
```

`<scope>` is either the project root or the user's home directory.

### 12.2 Claude and Codex: Managed Fields

Claude and Codex settings use `_bgng` metadata to track managed keys or sections. Hand-editing those regions causes drift.

Normal recovery options:

```bash
bgng status --why server:context7
bgng write --force
```

or promote the desired hand edit into `.agents/bgng/config.json` and run:

```bash
bgng write
```

### 12.3 Cursor: Generated File Plus Symlink

Cursor MCP state is rendered into the bgng generated directory and linked into the target path:

```text
<scope>/.cursor/mcp.json -> <scope>/.agents/bgng/generated/cursor-mcp.json
```

If the symlink is replaced by a regular file, `doctor` reports drift and `write` refuses without `--force`.

### 12.4 Cleanup

Cleanup is based on the prior `write-record.json`.

If a card is removed:

```bash
bgng card remove @me/observability
bgng write --dry-run
bgng write
```

`bgng` removes only paths it previously recorded as bgng-owned. If the write record is missing or corrupt, existing paths are treated as user-owned for that write and are not removed.

---

## 13. Existing Inventory Commands

### 13.1 Search

Use:

```bash
bgng search skill <query>
bgng search skill <query> --library
bgng search skill <query> --catalog
bgng search skill <query> --json
bgng search mcp <query>
bgng search mcp <query> --json
```

Search discovers candidates from local inventory and configured catalogs. The old orphan `--project` flag is not part of the cards-era command surface.

### 13.2 Add Skill Or MCP To The Current Project

Use:

```bash
bgng add skill <skill-name-or-query>
bgng add skill <skill-name-or-query> --library
bgng add skill <skill-name-or-query> --yes
bgng add mcp <server-name>
bgng add mcp <server-name> --library
bgng add mcp <server-name> --yes
```

These commands mutate the current project overlay. They do not publish cards and do not change the machine overlay.

`bgng add extension` no longer exists. Use `bgng extensions add`.

### 13.3 Library

Use:

```bash
bgng library list
bgng library list skills
bgng library list mcp
bgng library show <id>
bgng library add skill <npm-package-or-local-path>
bgng library add mcp <json-file> --as <server-id>
bgng library defaults list
bgng library defaults add skill <skill-name>
bgng library defaults remove skill <skill-name>
bgng library defaults add mcp <server-name>
bgng library defaults remove mcp <server-name>
```

The library is reusable inventory:

- skill bundles live under `~/.agents/bgng/skills/`
- MCP definitions live under `~/.agents/bgng/mcp-servers/`
- defaults write to `machine.json`

Use library defaults for machine-scope behavior. Use project add commands or cards for project behavior.

### 13.4 Skills

List:

```bash
bgng skills list
bgng skills list --json
```

Curate:

```bash
bgng skills curate <name>
bgng skills curate <name> --json
```

Uncurate:

```bash
bgng skills uncurate <name>
bgng skills uncurate <name> --json
```

Package-backed bundles:

```bash
bgng skills packages add <npm-package-or-local-path>
bgng skills packages list
bgng skills packages list --json
bgng skills packages show <package-name>
bgng skills packages show <package-name> --json
```

Cards-era storage moves package-backed bundles into `~/.agents/bgng/skills/`, preserving the existing `current` symlink convention.

### 13.5 MCP

Use:

```bash
bgng mcp list
bgng mcp list --json
bgng mcp write
bgng mcp write --dry-run
bgng mcp write --target=claude
bgng mcp write --json
```

`bgng mcp write` is a focused write path for MCP state. `bgng write` remains the normal full materialization command.

---

## 14. Extensions

Extensions are named capability families. They can include project config, CLI prerequisites, skills, MCP servers, setup actions, and diagnostics.

### 14.1 Inspect Extensions

```bash
bgng extensions list
bgng extensions list --json
bgng extensions show beads
bgng extensions show beads --json
bgng extensions status
bgng extensions status beads
bgng extensions status beads --json
bgng extensions doctor
bgng extensions doctor beads
bgng extensions doctor --json
```

Inspection commands are read-only.

### 14.2 Add An Extension To The Current Project

Use:

```bash
bgng extensions add parallel
bgng extensions add parallel --mcp
bgng extensions add parallel --skip-skills
bgng extensions add beads --target=codex,claude --include-skill
bgng extensions add markitdown
bgng extensions add markitdown --dry-run
bgng extensions add markitdown --json
```

`extensions add` writes semantic project config. It does not run external setup commands. Use `extensions setup` when the extension needs project initialization or CLI installation.

### 14.3 Run Extension Setup

Parallel:

```bash
bgng extensions setup parallel
bgng extensions setup parallel --mcp
bgng extensions setup parallel --skip-skills
bgng extensions setup parallel --dry-run
```

Beads:

```bash
bgng extensions setup beads
bgng extensions setup beads --target=codex,claude,cursor
bgng extensions setup beads --stealth
bgng extensions setup beads --skip-bd-init
bgng extensions setup beads --skip-bd-setup
bgng extensions setup beads --include-skill
bgng extensions setup beads --dry-run
```

MarkItDown:

```bash
bgng extensions setup markitdown
bgng extensions setup markitdown --install
bgng extensions setup markitdown --no-install
bgng extensions setup markitdown --dry-run
```

Setup is extension-specific. Read `bgng extensions show <name>` and run dry-run first when unsure.

### 14.4 Built-in Extension Families

| Extension | Purpose |
|---|---|
| `beads` | Project-scoped Beads issue-tracking support through `bd`, setup recipes, and optional skill inclusion. |
| `parallel` | Parallel CLI-backed research/search support with optional MCP entries. |
| `markitdown` | Document conversion support through Microsoft's MarkItDown CLI and related skills. |

---

## 15. Card Authoring Practices

### 15.1 Card Manifest Shape

Typical `card.json`:

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
    "include": ["parallel-web-search", "beads-task-tracking"]
  },
  "servers": {
    "context7": { "enabled": true }
  },
  "extensions": {
    "beads": { "enabled": true, "includeSkill": true },
    "parallel": { "enabled": true, "skills": true, "mcp": false }
  },
  "targets": {
    "claude": { "enabled": true },
    "codex": { "enabled": true },
    "cursor": { "enabled": false }
  }
}
```

Rules:

- cards include skills explicitly
- cards do not have `skills.exclude`
- cards may ship inline skills under `skills/<name>/`
- cards may ship inline MCP definitions under `mcp-servers/<id>.json`
- `harness.minVersion` protects users with older `bgng` versions
- card versions are immutable once published

### 15.2 Version Bump Guidance

Use major when a card removes or disables previously provided behavior.

Use minor when a card adds or enables behavior.

Use patch for metadata-only changes.

Run this before publishing:

```bash
bgng card diff @me/backend-service@1.1.0 file:~/.agents/bgng/sources/@me/backend-service
```

### 15.3 Reproducible Inline MCP Definitions

If a card must force a specific MCP definition, ship it inline:

```text
~/.agents/bgng/sources/@me/backend-service/
|-- card.json
`-- mcp-servers/
    `-- context7.json
```

Inline card definitions beat the user library and packaged baseline. Without an inline definition, the user library can override the packaged baseline.

---

## 16. Troubleshooting

### 16.1 "pre-cards layout detected"

Run:

```bash
bgng store migrate
```

Then:

```bash
bgng store status
bgng doctor
```

### 16.2 "no prior write-record"

This means `write-record.json` is missing or invalid. `bgng` treats existing on-disk state as user-owned for this write and avoids cleanup.

Run:

```bash
bgng write
bgng doctor
```

Normal cleanup semantics resume after a valid write record exists.

### 16.3 Drift Refused During Write

Inspect:

```bash
bgng status --explain
bgng doctor
```

Options:

```bash
bgng write --force
```

or edit `.agents/bgng/config.json` so the desired value is represented in bgng-managed intent, then run:

```bash
bgng write
```

### 16.4 Unknown MCP Server

Inspect:

```bash
bgng status --why server:<name>
bgng mcp list
```

Fix by adding a definition:

```bash
bgng library add mcp ./server.json --as <name>
```

or by shipping the definition inline in the card.

### 16.5 Bundle Conflict

Inspect card dependencies:

```bash
bgng card status --explain
bgng card show @me/base
bgng card show @me/extras
```

Fix by pinning compatible card versions:

```bash
bgng card pin @me/base@^2.0.0
bgng update --write
```

or by removing the conflicting card:

```bash
bgng card remove @me/extras --write
```

### 16.6 Project Write Changed Nothing

Check scope:

```bash
bgng status --json
```

If no project config is active, you are in machine scope. Run from the project root or initialize the project:

```bash
bgng init
```

### 16.7 Old Global Skills Still Exist

Cards-era project writes do not automatically clean legacy global skill symlinks.

Inspect:

```bash
bgng doctor
```

Cleanup, if desired:

```bash
bgng store migrate --cleanup-legacy-orphans
```

---

## 17. Recommended Practices

For consumers:

- Commit `.agents/bgng/config.json`.
- Commit `.agents/bgng/card.lock`.
- Do not commit `.agents/bgng/write-record.json`.
- Use `bgng write --dry-run` before large changes.
- Prefer `bgng apply <card> --write` for new projects.
- Prefer `bgng update --write` for routine maintenance.
- Use project overlays for small local deviations from a card.
- Publish a new card version when the same overlay is being copied across projects.

For authors:

- Keep cards focused on one reusable harness profile.
- Use inline content only when reproducibility requires it.
- Run `bgng card diff` before `publish`.
- Treat major/minor/patch classification as a user contract.
- Deprecate bad versions instead of mutating published directories.
- Use `file:` cards for local iteration, then publish immutable versions.

For operators:

- Run `bgng store status` after migrations.
- Run `bgng doctor` before deleting archives or legacy files.
- Avoid hand-editing managed settings regions.
- Use `--json` for scripts.
- Use `card outdated --check` in CI when card freshness matters.

---

## 18. Command Cheat Sheet

```bash
# Project setup
bgng init
bgng apply @me/backend-service@^1.0.0 --write

# Daily checks
bgng status
bgng doctor
bgng card status
bgng card outdated

# Updates
bgng update --write
bgng card pin @me/backend-service@1.2.3 --write

# Card authoring
bgng card new @me/backend-service --from-project
bgng card publish @me/backend-service
bgng card diff @me/backend-service@1.1.0 @me/backend-service@1.2.0
bgng card deprecate @me/backend-service@1.0.0 --reason "Use 1.1.0"

# Store
bgng store status
bgng store migrate

# Inventory
bgng search skill research
bgng add skill parallel-web-search
bgng library add mcp ./context7.json --as context7
bgng skills list
bgng mcp list

# Extensions
bgng extensions list
bgng extensions add parallel --mcp
bgng extensions setup beads --include-skill

# Materialization
bgng write --dry-run
bgng write
bgng write --force
```
