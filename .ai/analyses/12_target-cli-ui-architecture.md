# Target CLI UI Architecture

**Date:** April 26, 2026

**Status:** Proposed

**Scope:** Define the target user-facing command architecture for `bgng`, the CLI for `beginning-harness`, as it evolves into a local meta-harness control plane for project setup, local library, extension, skill, MCP, and tool configuration.

## Purpose

The current `bgng` CLI has strong underlying concepts:

- a central aggregation state under `~/.agents`
- repo-native and package-backed skills
- packaged MCP registry and target config
- per-project config under `<project>/.agents/bgng/config.json`
- project-configurable extensions such as Parallel and Beads
- safe sync/apply behavior into Claude, Codex, Cursor, and generated config files

The command surface is now at risk of exposing too many implementation concepts directly. Users should not need to understand "MCP registry", "package-backed skill bundle", "extension-derived skill include", or "curation layer" before they can set up one project.

This document proposes a clearer CLI information architecture that separates user intent from internal mechanics.

## Executive Summary

Use this top-level command model:

```text
init       start or bootstrap project config
add        add something to the current project
search     discover local and online options
library    manage the user's local reusable inventory
apply      apply effective bgng config to target tools
status     summarize current effective state
doctor     diagnose problems
extensions advanced capability-family operations
skills     advanced low-level skill operations
mcp        advanced low-level MCP operations
```

Key decisions:

1. **`library` means the user's local reusable library**, not the online npm ecosystem.
2. **`search` means discovery across the local library and configured online catalogs by default.**
3. **`add` is project-specific by default.**
4. **`init` defaults to guided project onboarding; `--non-interactive` opts out.**
5. **`apply` is the clearer primary verb for writing effective config to tools.**
6. **`sync` remains as a backward-compatible alias for `apply`.**
7. **Object kind should be a subcommand argument, not a flag.**

Recommended primary flow:

```bash
bgng init
bgng add extension parallel --mcp
bgng add skill "technical writing"
bgng add mcp github
bgng write --dry-run
bgng write
```

Recommended discovery flow:

```bash
bgng add skill
bgng add mcp
```

With no argument, `add skill` or `add mcp` should start an interactive project-aware finder.

## Canonical Grammar

The target CLI should follow this grammar:

```text
bgng <lifecycle-command> [options]
bgng add <kind> [name-or-query] [options]
bgng remove <kind> <name> [options]
bgng search <kind> <query> [options]
bgng library <operation> [kind] [name-or-spec] [options]
bgng <advanced-domain> <operation> [name] [options]
```

Where:

```text
lifecycle-command = init | apply | status | doctor
kind              = extension | skill | mcp | tool
advanced-domain   = extensions | skills | mcp
```

This gives users one durable rule:

```text
If it changes this project, use add/remove.
If it manages reusable local inventory, use library.
If it writes generated state to downstream tools, use apply.
If it inspects or repairs understanding, use status/doctor.
```

`remove` is not required in the first implementation slice, but it should be reserved now as the natural counterpart to `add`.

## Core UX Decisions

| Decision | Recommendation | Reason |
| --- | --- | --- |
| Project activation command | `bgng add <kind> ...` | "Add" maps to the user's goal and keeps object-specific help discoverable. |
| Object selector shape | subcommand argument, not flag | `add skill`, `add mcp`, and `add extension` need different validation, flags, and help. |
| First-run setup | `bgng init` defaults to guided mode | Reuses the existing bootstrap verb without creating a vague `configure` surface. |
| Local reusable inventory | `bgng library ...` | "Library" correctly implies owned local reusable material. |
| Online discovery | search local library and catalogs by default | This matches user intent when they ask to find the best skill/MCP; `--library` restricts to owned inventory. |
| Materialization verb | `bgng write` | Write clearly means one-way file output from effective config into target tools. |
| Existing `sync` command | keep as compatibility alias | Avoids breaking current users while docs shift to clearer vocabulary. |
| Extension activation | `bgng add extension <name>` | Extensions are project capabilities when selected for a project. |
| Extension operations | `bgng extensions ...` | Advanced inspection/setup remains available without dominating the happy path. |

Rejected primary surfaces:

- `bgng add --skill ...`: flags are weak object selectors and permit invalid combinations.
- `bgng configure`: too broad; overlaps with init, add, library, and future edit flows.
- `bgng library search`: implies the online catalog is part of the user's local library.
- `bgng sync` as the main verb: ambiguous direction and overloaded by package/library expectations.

## Design Principles

### 1. Commands should match user intent

Users think in tasks:

- "Start config for this project."
- "Add Parallel to this project."
- "Find a good writing skill."
- "Add GitHub MCP to this project."
- "Write this setup to Claude/Codex/Cursor."
- "Check what is active."
- "Tell me what is broken."

The CLI should map those tasks directly.

### 2. Use nouns only when they carry a durable mental model

Good nouns:

- `library`: local reusable collection
- `extension`: named capability family
- `skill`: agent instruction package
- `mcp`: MCP server/tool connection

Risky nouns:

- `asset`: internally accurate but too abstract for primary UX
- `registry`: sounds like implementation, npm, or Windows registry
- `catalog`: useful but should mean online source, not local inventory

### 3. Keep `apply` deterministic

The command that writes into target tools must stay scriptable and predictable.

Do not make `apply` interactive by default.

Use:

```bash
bgng write --dry-run
bgng write
```

Not:

```bash
bgng write
# prompts user to decide setup
```

Interactive setup belongs in default `bgng init` and argumentless `add <kind>`.

### 4. Flags modify behavior; subcommands define object type

Prefer:

```bash
bgng add skill <query>
bgng add mcp <name>
bgng add extension parallel
```

Avoid:

```bash
bgng add --skill <query>
bgng add --mcp <name>
bgng add --extension parallel
```

Reasons:

- object kinds have different validation
- object kinds need different help text
- object kinds need different flags
- flag-based object selection permits nonsensical combinations
- subcommands are more discoverable through `--help`

### 5. The CLI should support both "guide me" and "I know exactly what I want"

Guided:

```bash
bgng init
bgng add skill
bgng add mcp
```

Direct:

```bash
bgng add extension parallel --mcp
bgng add skill writing-polish
bgng add mcp github
bgng write --dry-run
```

Machine-readable:

```bash
bgng search skill "writing" --json
bgng add skill writing-polish --json
bgng write --dry-run --json
```

## Terminology

### Project config

Location:

```text
<project>/.agents/bgng/config.json
```

Meaning:

```text
What this project uses.
```

Project config should contain semantic choices:

```json
{
  "version": 1,
  "extensions": {
    "parallel": { "enabled": true, "skills": true, "mcp": false }
  },
  "skills": {
    "include": ["writing-polish"]
  },
  "servers": {
    "github": { "enabled": true }
  }
}
```

### Global config

Location in the managed `bgng` harness source:

```text
config.json
```

In a typical installed layout, this is the central config under the user's managed harness home, not the project-local `.agents/bgng/config.json`.

Meaning:

```text
Global defaults and source policy for this machine.
```

This is the right place for catalog source configuration:

```json
{
  "version": 1,
  "catalogs": {
    "npmSkills": { "enabled": true },
    "mcp": { "enabled": true }
  }
}
```

Keep one source of truth per concern:

- Global `config.json` owns machine-wide defaults, target outputs, enabled catalog sources, and trust/source policy.
- Project `.agents/bgng/config.json` owns what this project uses.
- The local library index owns installed inventory state and cache metadata.

Do not duplicate catalog source configuration in the library index. The library index should record what is installed or known locally, not decide which online sources are trusted.

### Library

Location, conceptually:

```text
~/.agents/library/
~/.agents/packages/skills/
~/.agents/assets/
```

Meaning:

```text
The user's local reusable collection of known skills, MCP servers, tools, and possibly recipes.
```

The library is local. It is not npm. It is not the online marketplace. It is what `bgng` has already installed, registered, or learned on this machine and can reuse across projects.

### Catalog

Meaning:

```text
An online or external discovery source.
```

Examples:

- npm packages matching the `bgng` skill bundle contract
- future MCP server catalog
- future first-party extension catalog
- future internal/team catalog

Do not call online search "library search". That blurs local and remote state.

### Search

Meaning:

```text
Discover candidates from local library and configured online catalogs by default.
```

Search output should label source clearly:

```text
Local library
1. writing-polish                 skill    installed

Online catalogs
2. @acme/writing-skills           package  npm
3. @team/content-review-skills     package  npm
```

### Extension

Meaning:

```text
A named capability family managed by bgng.
```

Examples:

- Parallel
- Beads

Extensions may derive:

- skill includes
- MCP toggles
- project setup commands
- external CLI checks
- diagnostics

### Skill

Meaning:

```text
Agent instruction content.
```

Sources:

- built-in repo-native skills
- package-backed skills installed into the local library

### MCP

Meaning:

```text
An MCP server definition that can be rendered into target tool config.
```

Sources:

- built-in registry
- project-local definition
- local library entry
- future online catalog result

### Tool

Meaning:

```text
A non-MCP executable or helper used by agents or extensions.
```

Tool support should be designed but can remain later-phase. Avoid overloading `mcp` to mean all tools.

### Write

Meaning:

```text
Write the effective bgng config into downstream tool state.
```

This is clearer than `sync`, which can be read as "sync to library", "sync from library", "sync from tools", or "sync remote packages".

## Target Command Surface

### `init`

Purpose:

```text
Start project configuration.
```

Commands:

```bash
bgng init
bgng init --minimal
bgng init --guided
bgng init --non-interactive
bgng init --force
```

Semantics:

- `bgng init` starts guided project setup by default when interactive.
- `bgng init --minimal` explicitly writes only `{ "version": 1 }`.
- `bgng init --guided` starts the project setup wizard.
- `bgng init --non-interactive` disables prompts and writes minimal config unless fully specified flags are provided.
- `bgng init --force` overwrites existing config.

Recommended behavior:

- If no config exists and stdout/stdin are TTYs, `bgng init` should run guided setup by default.
- If non-TTY and `--non-interactive` is not passed, fail clearly rather than silently choosing defaults.
- If non-TTY and `--non-interactive` is passed, write minimal config unless additional explicit flags are supplied.
- `--guided` forces interactive flow.
- `--minimal` remains a convenience alias for the minimal non-interactive path.

Why not top-level `configure` first:

- `init` already owns project bootstrap.
- `configure` overlaps with `init`, `add`, and future editing flows.
- guided `init` is more concrete for first-time project setup.

Possible future alias:

```bash
bgng configure --project
```

But this should not be the primary design until there is a clear need for reconfiguration beyond initial setup and incremental `add`.

### `add`

Purpose:

```text
Add something to the current project.
```

Commands:

```bash
bgng add extension <name>
bgng add skill [query-or-name]
bgng add mcp [query-or-name]
bgng add tool [query-or-name]
```

No argument means guided discovery for that kind:

```bash
bgng add skill
bgng add mcp
```

Direct examples:

```bash
bgng add extension parallel --mcp
bgng add extension beads --target=codex,claude --include-skill
bgng add skill writing-polish
bgng add mcp github
```

Behavior:

1. Resolve current project config or offer to create it.
2. Resolve the requested item from local library first.
3. If not found, search configured catalogs automatically unless `--library` is passed.
4. If selected from an online catalog, install/register it into local library.
5. Add semantic project reference.
6. Show next step:

```bash
bgng write --dry-run
```

Project config examples:

```json
{
  "version": 1,
  "extensions": {
    "parallel": { "enabled": true, "skills": true, "mcp": true }
  }
}
```

```json
{
  "version": 1,
  "skills": {
    "include": ["writing-polish"]
  },
  "servers": {
    "github": { "enabled": true }
  }
}
```

Important:

- `add` is project-scoped by default.
- It should not silently mutate global target config.
- It may mutate local library if an online result is selected, but it should say so clearly.

### `search`

Purpose:

```text
Find things that could be added.
```

Commands:

```bash
bgng search skill <query>
bgng search mcp <query>
bgng search tool <query>
bgng search extension <query>
bgng search <query>
```

Flags:

```bash
--library
--catalog
--project
--json
```

Semantics:

- default search includes local library and configured online catalogs
- `--library` restricts to the user's local library/inventory
- `--catalog` restricts to online catalogs
- `--project` uses current project context to rank results
- `--json` emits stable machine-readable output

Example:

```bash
bgng search skill "technical writing" --project
```

Output shape:

```text
Local library
1. writing-polish                 skill    installed

Online catalogs
2. @acme/writing-skills           package  npm       4 skills
3. @team/editorial-agent-skills    package  npm       2 skills
```

Why top-level `search`:

- online discovery should not be hidden under `library`
- users understand search as discovery
- it can search multiple source types without implying local ownership

### `library`

Purpose:

```text
Manage local reusable inventory.
```

Commands:

```bash
bgng library list
bgng library list skills
bgng library list mcp
bgng library list tools

bgng library show <id>
bgng library remove <id>

bgng library add skill <package-spec>
bgng library add mcp <server-spec-or-file>
bgng library add tool <tool-spec-or-file>
```

Potential future:

```bash
bgng library update <id>
bgng library audit
bgng library doctor
```

Semantics:

- `library add` installs/registers something for reuse across projects.
- It does not automatically add the item to the current project unless `--project` is passed.
- `library list` shows what is already known locally.

Example:

```bash
bgng library add skill @acme/writing-skills
bgng add skill writing-polish
```

Shortcut:

```bash
bgng add skill writing-polish
```

If `writing-polish` is not local, this can offer to search catalogs and install the backing package into the library first.

### `apply`

Purpose:

```text
Write effective bgng configuration to downstream tools.
```

Commands:

```bash
bgng write
bgng write --dry-run
bgng write --json
bgng write --target=claude
bgng write --skills-only
bgng write --mcp-only
```

Semantics:

- load global config
- discover nearest project config
- merge to effective config
- render MCP config into target tool config files
- symlink skills into downstream skill directories
- report stale state without destructive pruning
- back up changed config files before writing

`sync` compatibility:

```bash
bgng sync
```

should remain an alias for:

```bash
bgng write
```

Documentation should teach `apply` first and mention `sync` as compatibility.

Why `apply` is better than `sync`:

- it implies one-way materialization from `bgng` to tools
- it avoids ambiguity with package/library syncing
- it matches the dry-run/apply pattern users already understand

### `extensions`

Purpose:

```text
Advanced capability-family inspection and setup.
```

Commands:

```bash
bgng extensions list
bgng extensions show <name>
bgng extensions status [name]
bgng extensions doctor [name]
bgng extensions setup <name>
```

Relationship to `add`:

```bash
bgng add extension parallel
```

should be the user-friendly project activation command.

```bash
bgng extensions setup parallel
```

can remain the explicit lower-level extension operation.

Both should call the same core adapter.

### `skills`

Purpose:

```text
Advanced low-level skill operations.
```

Current commands can remain:

```bash
bgng skills list
bgng skills curate <skillName>
bgng skills uncurate <skillName>
bgng skills sync
bgng skills packages add <packageSpec>
bgng skills packages list
bgng skills packages show <packageName>
```

Target evolution:

- `skills packages ...` can remain as compatibility or advanced internals.
- `library add skill ...` should become the clearer public path for package-backed skill bundles.
- `add skill ...` should become the project-level path.

Potential de-emphasis:

```text
skills curate
```

should remain prominent. It is a global publication-layer operation today, and more useful global skill-management features are expected to land near-term. The docs should distinguish it from project-level `add skill`, not hide it.

### `mcp`

Purpose:

```text
Advanced low-level MCP inspection and application.
```

Current commands:

```bash
bgng mcp list
bgng mcp sync
```

Target evolution:

```bash
bgng mcp list
bgng mcp write
```

Recommended:

- Add `bgng mcp write` as an advanced alias for `bgng write --mcp-only`.
- Keep `bgng mcp sync` as a compatibility alias for at least one release cycle after `mcp write` ships.
- Teach top-level `bgng write --mcp-only` in primary docs and `bgng mcp write` in advanced MCP docs.

Relationship to higher-level commands:

- `bgng add mcp github` adds an MCP server to the current project.
- `bgng library add mcp github` registers an MCP server in local library.
- `bgng mcp list` inspects effective MCP state.
- `bgng write --mcp-only` writes MCP state to tools.

## Guided UX

### `bgng init`

Primary project onboarding wizard.

Suggested flow:

```text
Create project config at .agents/bgng/config.json? yes

Which targets should bgng manage for this project?
> Claude
> Codex
> Cursor

Which extensions should this project use?
> Parallel
> Beads
> None

Parallel:
Enable CLI-backed skills? yes
Enable MCP? no

Beads:
Initialize .beads now? yes
Targets for bd setup?
> Codex
> Claude
Include beads-task-tracking skill? yes

Add project-specific skills?
> Search skills
> Skip

Add project-specific MCP servers?
> Search MCP
> Skip

Preview:
<render config and planned external commands>

Write config and run setup? yes
Next: bgng write --dry-run
```

Rules:

- if not TTY, fail clearly or require non-interactive flags
- always show planned mutations before running external setup commands
- never run destructive external commands by default
- write semantic config rather than low-level derived config

### `bgng add skill`

Project-aware guided finder.

Suggested flow:

```text
What do you want help with?
> Writing/content
> Research/search
> Debugging/testing
> Data enrichment
> Project memory/tasks
> Other

Search query:
> technical writing

Results:
Local library
1. writing-polish

Online catalogs
2. @acme/writing-skills
3. @team/content-review-skills

Choose skill/package:
> 1

Add writing-polish to this project? yes
Run bgng write --dry-run now? no
```

If online package selected:

```text
This package will be installed into your local library first:
~/.agents/packages/skills/@acme/writing-skills/1.2.3
Proceed? yes
```

### `bgng add mcp`

Project-aware MCP finder.

Suggested flow:

```text
What capability do you need?
> GitHub
> Database
> Browser/devtools
> Docs
> Other

Results:
Local library
1. github

Online catalogs
2. @modelcontextprotocol/server-github

Required environment:
GITHUB_TOKEN

Add github MCP to this project? yes
```

MCP server config should preserve environment placeholders rather than storing secrets.

## Data Model

### Local library index

Internal storage can evolve, but conceptually:

```text
~/.agents/library/
  index.json
  skills.json
  mcp-servers.json
  tools.json
```

Existing package-backed skills can continue to live under:

```text
~/.agents/packages/skills/<package-name>/<version>
```

The library index should point at installed package-backed sources rather than duplicate content.

Conceptual skill entry:

```json
{
  "id": "writing-polish",
  "kind": "skill",
  "source": "npm",
  "packageName": "@acme/writing-skills",
  "version": "1.2.3",
  "scope": "shared",
  "path": "~/.agents/packages/skills/@acme/writing-skills/1.2.3/skills/shared/writing-polish",
  "description": "Polish technical writing for clarity and voice."
}
```

Conceptual MCP entry:

```json
{
  "id": "github",
  "kind": "mcp",
  "source": "catalog",
  "description": "GitHub repository and issue access.",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_TOKEN": "${GITHUB_TOKEN}"
  }
}
```

### Project config

Project config remains:

```text
<project>/.agents/bgng/config.json
```

It records what the project uses:

```json
{
  "version": 1,
  "extensions": {
    "parallel": { "enabled": true, "skills": true, "mcp": false }
  },
  "skills": {
    "include": ["writing-polish"]
  },
  "servers": {
    "github": { "enabled": true }
  }
}
```

Open design question:

Should future project references move to an explicit `assets` block?

```json
{
  "version": 1,
  "assets": {
    "skills": { "include": ["writing-polish"] },
    "mcpServers": { "include": ["github"] }
  }
}
```

Recommendation:

- Keep current `skills` and `servers` schema for now.
- Add library-backed resolution behind those existing fields.
- Only introduce `assets` if the schema becomes too ambiguous.

This minimizes migration cost and uses language already implemented.

## Command Relationship Map

```text
bgng init
  writes project config
  may call extension setup adapters
  may call library/search flows

bgng add <kind>
  resolves or discovers one thing
  may install/register into library
  writes project config

bgng search <kind>
  reads library and catalogs
  does not mutate by default

bgng library ...
  mutates or inspects local reusable inventory
  does not mutate project config unless --project is explicit

bgng write
  reads global config + project config + library
  writes downstream tool state

bgng status / doctor
  reads effective state
  reports current status and drift

bgng skills / mcp / extensions
  advanced direct control over lower-level domains
```

## Examples

### First project setup

```bash
cd /path/to/project
bgng init
bgng write --dry-run
bgng write
```

### Add Parallel to one project

```bash
bgng add extension parallel --mcp
bgng write --dry-run
bgng write
```

Equivalent advanced command:

```bash
bgng extensions setup parallel --mcp
bgng write
```

### Find and add a writing skill

```bash
bgng add skill
bgng write --dry-run
bgng write
```

Explicit:

```bash
bgng search skill "writing polish" --project
bgng library add skill @acme/writing-skills
bgng add skill writing-polish
bgng write
```

### Add GitHub MCP to one project

```bash
bgng add mcp github
bgng write --mcp-only --dry-run
bgng write --mcp-only
```

### Inspect local inventory

```bash
bgng library list
bgng library list skills
bgng library show writing-polish
```

### Scripted non-interactive project setup

```bash
bgng init --non-interactive
bgng add extension parallel --mcp --yes
bgng add skill writing-polish --yes
bgng add mcp github --yes
bgng write --dry-run --json
bgng write --json
```

## Migration From Current CLI

Current commands should continue to work:

```bash
bgng sync
bgng skills packages add <package>
bgng skills curate <skill>
bgng mcp sync
bgng extensions setup parallel
```

Target documentation should gradually prefer:

```bash
bgng write
bgng library add skill <package>
bgng add skill <skill>
bgng write --mcp-only
bgng add extension parallel
```

Compatibility mapping:

| Current | Target |
| --- | --- |
| `bgng sync` | `bgng write` |
| `bgng skills packages add <package>` | `bgng library add skill <package>` |
| `bgng skills packages list` | `bgng library list skills` |
| `bgng skills packages show <package>` | `bgng library show <id>` |
| `bgng extensions setup <name>` | `bgng add extension <name>` |
| `bgng mcp sync` | `bgng write --mcp-only` or `bgng mcp write` |
| `bgng skills sync` | `bgng write --skills-only` or `bgng skills apply` |

Do not remove old commands until the new surface has been documented, tested, and used for at least one release cycle.

## Error Handling And Safety

### Ambiguity rules

The CLI should resolve ambiguity consistently:

- If a name matches both a local library item and an online catalog item, prefer the local library and show that choice.
- If multiple local items match, require an exact id or present an interactive picker in TTY mode.
- If a direct `add` command cannot find a local match, search configured catalogs automatically unless `--library` is passed.
- If an online package contains multiple skills, let the user choose which skill to add unless `--all` is passed.
- If a project has no config, interactive `add` may offer to create one; non-interactive `add` should fail with a clear `bgng init --non-interactive` suggestion.
- If an MCP server requires secrets, store placeholders only and report missing environment variables through `doctor`.
- If two assets share the same display name, require the stable id or package-qualified id.

These rules prevent surprising global mutation and make scripted usage safe.

### Interactive safety

Interactive commands should:

- show planned config changes before writing
- show external commands before running them
- require confirmation before installing online packages
- never store secrets directly
- detect non-TTY and require explicit flags

### Non-interactive safety

Non-interactive commands should:

- support `--json`
- support `--dry-run` where mutation is possible
- support `--yes` only when the command is otherwise fully specified
- fail clearly if user input would be required

### External package safety

For npm skill packages:

- keep `npm pack --ignore-scripts`
- validate `bundle.json`
- reject skill name collisions
- install into managed local library/cache
- show package name, version, and skill list before project activation

### MCP safety

For MCP additions:

- preserve env placeholders
- do not store secrets in project config
- display required env vars
- validate transport shape
- support project-local definitions
- report missing env vars in `doctor`

## Output Design

Human output should be concise and action-oriented.

Good:

```text
Added writing-polish to this project.
Updated .agents/bgng/config.json

Next:
  bgng write --dry-run
```

Avoid:

```text
Successfully modified ProjectConfig.skills.include with SkillSourceType=npm
```

JSON output should expose stable structured data:

```json
{
  "projectConfigPath": "/path/to/project/.agents/bgng/config.json",
  "libraryChanges": [
    { "kind": "skill", "id": "writing-polish", "action": "installed" }
  ],
  "projectChanges": [
    { "kind": "skill", "id": "writing-polish", "action": "included" }
  ],
  "next": ["bgng write --dry-run"]
}
```

## Recommended Implementation Phases

### Phase A: Naming and aliases

- Add `bgng write` as alias over current sync implementation.
- Keep `bgng sync` as compatibility alias.
- Update docs to prefer `apply`.

### Phase B: Project add commands

- Add `bgng add extension <name>` backed by existing extension setup adapters.
- Add `bgng add skill <name>` for already-known skills.
- Add `bgng add mcp <name>` for already-known MCP servers.
- Add `--library` to restrict resolution to the user's local inventory.
- Keep initial implementation non-interactive, but preserve automatic catalog search semantics for direct exact queries where safe.

### Phase C: Local library abstraction

- Introduce `bgng library list/show`.
- Add `bgng library add skill <package>` as clearer alias for `skills packages add`.
- Add local library index if existing package cache and registries are insufficient.

### Phase D: Package-backed project skill includes

- Extend project `skills.include` resolution to package-backed skills.
- Ensure selected package-backed skills can be project-scoped without global curation.

### Phase E: Search and catalogs

- Add `bgng search skill <query>`.
- Search local library first, then configured catalogs by default.
- Add `--library` for local-only search and `--catalog` for catalog-only search.
- Add npm/catalog search behind explicit source adapters.
- Add `--json` output contracts.

### Phase F: Guided setup

- Make `bgng init` default to guided mode in TTY contexts.
- Add `bgng init --non-interactive`.
- Keep `bgng init --guided` as an explicit force-guided option.
- Add argumentless `bgng add skill` and `bgng add mcp` interactive flows.
- Implement non-TTY safeguards.

### Phase G: MCP and tool library

- Add local MCP library entries.
- Add `bgng library add mcp`.
- Add `bgng add mcp` project activation.
- Design tool assets after MCP and skills prove the library model.

## Resolved Decisions And Trade-Offs

### 1. Default search behavior

Decision:

- `add skill <query>` and `add mcp <query>` should search online catalogs automatically if no local library match exists.
- `--library` restricts search to the user's local inventory.
- `--catalog` can remain useful for catalog-only search.

Reason:

Users asking to add the best skill or MCP for a project are asking for discovery, not only lookup. Local-only should be available, but it should be an explicit constraint.

### 2. Catalog source configuration

Decision:

- Configure online catalog sources in the central/global `config.json`.
- Do not configure catalog sources in project `.agents/bgng/config.json`.
- Do not configure catalog sources in the local library index.

Clarification:

The relevant `config.json` is the central `bgng` / agents config, currently represented by the repo-root `config.json` in this codebase and conceptually by the user's managed agents home. It is not the project-local `<project>/.agents/bgng/config.json`.

Reason:

There should be one source of truth per concern:

- central/global `config.json`: machine-wide defaults, target outputs, catalog sources, trust policy
- project `.agents/bgng/config.json`: what this project uses
- local library index: what has been installed, registered, cached, or learned locally

Putting catalog source policy in the library would mix configuration with inventory state. Putting it in each project would duplicate trust/source policy across projects and create inconsistent discovery behavior.

### 3. Init default

Decision:

- `bgng init` defaults to guided mode when interactive.
- `bgng init --non-interactive` opts into prompt-free setup.
- `bgng init --minimal` may remain as a convenience alias for minimal non-interactive config creation.

Reason:

Project setup is where users need help making choices. A bare minimal config is useful for scripts, but it should not be the default human path.

### 4. Skill curation prominence

Decision:

- Keep `skills curate` prominent.
- Document it as global skill publication/curation.
- Document `add skill` as project-level skill activation.

Reason:

The command is useful now and expected to gain more global skill-management capability soon. The UX issue is not that `curate` exists; it is that users need a clear distinction between global curation and project-specific addition.

### 5. MCP apply command options

Options:

| Option | Pros | Cons |
| --- | --- | --- |
| Promote only `bgng write --mcp-only` | One lifecycle verb; least command surface; reinforces `apply` as the materialization operation. | Less discoverable from `bgng mcp --help`; advanced MCP users may expect the MCP namespace to contain its own apply command. |
| Add `bgng mcp write` as alias for `bgng write --mcp-only` | Discoverable inside the MCP namespace; aligns with `mcp list`; smooth migration from `mcp sync`; useful for advanced scripts. | Adds another spelling for the same operation; docs must prevent users from thinking `mcp write` and `write --mcp-only` differ. |
| Keep only `bgng mcp sync` | Minimum implementation churn; zero migration work. | Preserves ambiguous terminology; conflicts with the target `apply` vocabulary; looks stale once top-level `apply` exists. |

Recommendation:

- Add `bgng mcp write` as an advanced alias for `bgng write --mcp-only`.
- Keep `bgng mcp sync` as a compatibility alias.
- Teach `bgng write --mcp-only` in primary docs and `bgng mcp write` in advanced MCP docs.

This gives discoverability without fragmenting the underlying implementation.

### 6. Project schema: `skills`/`servers` vs `assets`

Options:

| Option | Pros | Cons |
| --- | --- | --- |
| Keep existing `skills` and `servers` fields as the stable project schema | Backward-compatible; intuitive domain language; maps to current implementation; easy for users to hand-edit. | Less uniform for future asset kinds; source/version metadata must live elsewhere; `servers` is less explicit than `mcpServers`. |
| Introduce a new `assets` block | Unified model for skills, MCP servers, tools, and future asset kinds; easier to attach source/version/pinning metadata; aligns with local library internals. | More abstract; higher migration cost; risks exposing an internal model; duplicates current `skills` and `servers` semantics. |
| Use a hybrid model | Keeps project config intuitive while allowing the library registry to track rich source metadata; avoids premature schema churn; leaves room for generated/resolved asset metadata later. | Requires mapping between domain fields and library entries; implementers must keep the separation clear. |

Recommendation:

- Keep project config `skills` and `servers` as the stable schema for now.
- Store source, version, package, and trust metadata in the local library registry.
- Do not add a user-authored `assets` block until the schema has a proven need that cannot be cleanly represented by domain fields.
- If richer resolved state becomes necessary, prefer a generated/internal resolved inventory over making users edit abstract `assets` records.

## Final Recommendation

Adopt this UX hierarchy:

```text
init              start a project with guided help by default
add <kind>        add something to this project
search <kind>     discover local and online options
library           manage local reusable inventory
apply             write effective config to tools
status/doctor     inspect and diagnose
extensions/skills/mcp advanced direct controls
```

This preserves the power of the existing architecture while giving users a simpler story:

```text
Find useful things. Keep them in your library. Add them to a project. Write the project setup to your agent tools.
```
