# Library, Defaults, And Config Target Architecture

**Date:** April 27, 2026

**Status:** Proposed

**Scope:** Define how `bgng`, the CLI for `beginning-harness`, should model local reusable harness inventory, machine-wide defaults, project-specific activation, and the config files that back those concepts.

## Purpose

`bgng` now has three user-facing concepts that need sharper boundaries:

- **Library:** reusable local harness inventory the user has available on this machine.
- **Defaults:** the machine-wide harness baseline selected from that library.
- **Project config:** the project harness overlay that uses or disables specific capabilities.

The current implementation has strong foundations but incomplete separation:

- repo-native skills and package-backed skills can be discovered and used
- npm skill bundles can be installed under `~/.agents/packages/skills`
- `~/.agents/skills` acts as the global curated skill publication layer
- MCP servers are mostly defined by repo `mcp-servers.json`
- per-project config lives at `<project>/.agents/bgng/config.json`
- `bgng add skill` and `bgng add mcp` are project-scoped

The missing piece is a first-class CLI and storage model for user-owned global defaults, especially MCP defaults and reusable MCP library entries.

## Executive Summary

Use this local harness model:

```text
search     discovers local library and configured catalogs
library    manages local reusable harness inventory and machine-wide defaults
add        activates something for the current project
apply      materializes effective state into downstream tools
```

Recommended command surface:

```bash
bgng library add skill <package-or-path>
bgng library add mcp <name-or-spec>
bgng library list [skills|mcp|tools]
bgng library show <id>

bgng library defaults list
bgng library defaults add skill <skillName>
bgng library defaults remove skill <skillName>
bgng library defaults add mcp <serverName>
bgng library defaults remove mcp <serverName>

bgng add skill <skillName>
bgng add mcp <serverName>
bgng write
```

Core decision:

> `library add` makes something available. `library defaults add` makes it globally active. `add` makes it active for the current project.

This preserves the user mental model:

```text
Find useful things. Keep them in your library. Make some defaults. Add project-specific extras. Write.
```

## Non-Goals

- Do not make `bgng add ...` mutate global defaults.
- Do not make `bgng library add ...` automatically activate items globally.
- Do not store secrets in any `bgng` config file.
- Do not make project config own catalog trust policy.
- Do not infer arbitrary npm packages into executable MCP servers.
- Do not remove current `skills curate`, `skills sync`, `mcp sync`, or `sync` compatibility commands.
- Do not require users to understand repo-internal `config.json` and `mcp-servers.json` for ordinary harness-default management.

## Terminology

### Library

The user's local reusable harness inventory.

It answers:

```text
What do I have available on this machine?
```

Examples:

- installed package-backed skill bundles
- repo-native built-in skills
- registered MCP server definitions
- future tools, recipes, prompt packs, templates, and extension assets

The library is local. It is not npm. It is not an online marketplace. Online sources are catalogs.

### Defaults

The user's machine-wide harness baseline.

It answers:

```text
What should every project get unless the project says otherwise?
```

Examples:

- globally active MCP servers
- globally active shared skills
- globally enabled extension modes
- enabled downstream targets

Defaults are selected from known library or built-in items. They do not contain package tarballs, skill content, or arbitrary downloaded files.

### Project Config

The current project's harness overlay.

It answers:

```text
What does this project use differently from my machine defaults?
```

Examples:

- include a project-specific skill
- disable one globally default MCP server
- enable Parallel MCP for one project
- add a project-local database MCP definition
- disable Cursor for one repo

### Catalog

An external discovery source.

It answers:

```text
What could I install or register?
```

Examples:

- npm package search for skill bundles
- trusted MCP catalog files
- future first-party extension catalog
- future team/private catalog

Catalog source policy belongs in global user config, not in project config and not in the library inventory.

## Config Ownership Model

Use one source of truth per concern.

| Concern | Owner | Target Location |
| --- | --- | --- |
| User global defaults and policy | user global config | `~/.agents/bgng/config.json` |
| Reusable local inventory metadata | local library | `~/.agents/library/*.json` |
| Package-backed skill contents | package cache | `~/.agents/packages/skills/...` |
| Global skill publication compatibility | curated symlinks | `~/.agents/skills` |
| Project-specific intent | project config | `<project>/.agents/bgng/config.json` |
| Packaged fallback defaults | installed `bgng` package or repo | repo `config.json`, `mcp-servers.json` |
| Generated downstream tool state | apply output | `~/.claude`, `~/.codex`, Cursor config, `~/.agents/generated` |

### Important Distinction

The repo-root `config.json` and `mcp-servers.json` should become packaged defaults and schema-compatible fallback inputs. They should not be the normal long-term user-editable state after installation.

In a developer checkout, they can still act as the active config for tests and local development. In an installed CLI, `bgng` should prefer user-owned files under `~/.agents/bgng/`.

## Recommended File Layout

```text
~/.agents/
  bgng/
    config.json                 # user global defaults and policy
    config.backups/
    migrations.json

  library/
    index.json                  # library metadata and schema version
    mcp-servers.json            # user-registered MCP definitions
    tools.json                  # future tool inventory
    skills.json                 # optional normalized skill index/cache

  packages/
    skills/
      <package-name>/
        current -> <version>
        <version>/
          bundle.json
          skills/...

  skills/
    <skillName> -> <repo-or-package-skill-dir>

  generated/
    cursor-mcp.json
```

Project:

```text
<project>/
  .agents/
    bgng/
      config.json
```

## User Global Config Schema

Target path:

```text
~/.agents/bgng/config.json
```

Conceptual schema:

```json
{
  "version": 1,
  "targets": {
    "claude": {
      "enabled": true,
      "configPath": "~/.claude/settings.json",
      "format": "json-merge",
      "mcpKey": "mcpServers"
    },
    "codex": {
      "enabled": true,
      "configPath": "~/.codex/config.toml",
      "format": "toml-merge",
      "mcpKey": "mcp_servers"
    },
    "cursor": {
      "enabled": true,
      "configPath": "~/.cursor/mcp.json",
      "format": "json-standalone",
      "mcpKey": "mcpServers",
      "symlink": true
    }
  },
  "catalogs": {
    "npmSkills": {
      "enabled": true,
      "searchLimit": 20
    },
    "mcp": {
      "enabled": false,
      "sources": []
    }
  },
  "defaults": {
    "skills": [
      "brainstorming",
      "systematic-debugging"
    ],
    "mcpServers": [
      "context7",
      "chrome-devtools"
    ],
    "extensions": {
      "parallel": {
        "enabled": true,
        "skills": true,
        "mcp": false
      }
    }
  },
  "optional": {
    "markdownify": false,
    "notion": false,
    "slack": false
  }
}
```

### Why Defaults Belong Here

Defaults are not inventory. They are policy.

Putting defaults in the library would make the library both a catalog of available items and a policy engine for what should be active. That increases ambiguity:

- Is a listed MCP merely available or globally active?
- Does removing a library item disable it everywhere?
- Does installing a skill bundle expose every skill globally?

Putting defaults in user global config keeps the separation clear:

- library records what exists
- global config records what is active by default
- project config records local differences

## Local Library Schemas

### Library Index

Target path:

```text
~/.agents/library/index.json
```

Purpose:

- track schema version
- record library implementation metadata
- provide a stable place for future migrations

Example:

```json
{
  "version": 1,
  "updatedAt": "2026-04-27T00:00:00.000Z",
  "sources": {
    "skills": "~/.agents/packages/skills",
    "mcp": "~/.agents/library/mcp-servers.json",
    "tools": "~/.agents/library/tools.json"
  }
}
```

### Skill Inventory

Skill content remains source-backed:

- repo-native skills live in the installed `bgng` package or checkout
- package-backed skills live in `~/.agents/packages/skills/...`
- curated/default skill symlinks live in `~/.agents/skills`

A `skills.json` index is optional. If added, it should be a generated or maintained metadata cache, not the content owner.

Conceptual entry:

```json
{
  "id": "writing-polish",
  "kind": "skill",
  "source": {
    "type": "npm",
    "packageName": "@acme/writing-skills",
    "version": "1.2.3"
  },
  "scope": "shared",
  "path": "~/.agents/packages/skills/@acme/writing-skills/1.2.3/skills/shared/writing-polish",
  "default": false
}
```

### MCP Library

Target path:

```text
~/.agents/library/mcp-servers.json
```

Purpose:

- store user-registered MCP definitions
- keep reusable MCPs available across projects
- separate MCP inventory from global activation defaults

Example:

```json
{
  "version": 1,
  "servers": {
    "github": {
      "description": "GitHub repository, issue, and pull request access.",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "optional": true,
      "source": {
        "type": "catalog",
        "id": "github",
        "addedAt": "2026-04-27T00:00:00.000Z"
      }
    }
  }
}
```

Secrets are referenced by environment variable name only. `bgng` should never write secret values into the library.

## Project Config Schema

Target path:

```text
<project>/.agents/bgng/config.json
```

Project config remains intent-focused:

```json
{
  "version": 1,
  "skills": {
    "include": ["writing-polish"],
    "exclude": ["frontend-design"]
  },
  "servers": {
    "github": { "enabled": true },
    "context7": { "enabled": false }
  },
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": true
    }
  },
  "targets": {
    "cursor": { "enabled": false }
  }
}
```

Project config should not store:

- catalog search sources
- npm package tarball metadata
- global defaults
- global target paths except target enable/disable overrides
- secrets

## Effective Config Resolution

`bgng write` should resolve state in this order:

1. Load packaged fallback config and built-in registry.
2. Load or initialize user global config from `~/.agents/bgng/config.json`.
3. Load local library inventory from `~/.agents/library` and package caches.
4. Build the global active set from `defaults`.
5. Discover nearest project config from the current working directory.
6. Merge project overrides.
7. Render MCP config and skill symlinks into enabled targets.

Conceptual flow:

```text
packaged defaults
  + user global config
  + local library inventory
  + project config
  = effective config

effective config
  -> bgng write
  -> downstream tool state
```

### Skill Resolution

Global skill defaults:

1. Resolve default skill names against repo-native skills and installed package-backed skills.
2. Maintain `~/.agents/skills` symlinks for compatibility and inspection.
3. During apply, sync global defaults plus project includes minus project excludes into downstream tools.

Project skill overrides:

- `skills.include` adds a skill for this project without making it global.
- `skills.exclude` removes a globally default skill for this project.
- `exclude` wins over `include`.

Unknown or ambiguous skill names should be doctor errors and apply warnings, not silent guesses.

### MCP Resolution

MCP definitions come from:

1. built-in registry shipped with `bgng`
2. user MCP library at `~/.agents/library/mcp-servers.json`
3. project-local full MCP definitions

Global MCP defaults:

1. `defaults.mcpServers` names globally active MCP servers.
2. Each name must resolve to a built-in or library MCP definition.
3. Missing required environment variables should be reported by `doctor`.

Project MCP overrides:

- `{ "enabled": true }` activates a known built-in or library MCP for the project.
- `{ "enabled": false }` disables an otherwise global default for the project.
- a full MCP definition creates a project-local MCP entry only for that project.

### Extension Resolution

Extensions are semantic capability families. They may derive skills, MCP servers, diagnostics, or external setup checks.

Global extension defaults belong in:

```json
{
  "defaults": {
    "extensions": {
      "parallel": {
        "enabled": true,
        "skills": true,
        "mcp": false
      }
    }
  }
}
```

Project extension config can override those defaults:

```json
{
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": true
    }
  }
}
```

Extension-owned generated includes should remain derived state. Users should not have to manually list every Parallel skill when `extensions.parallel.skills` expresses the intent better.

## CLI Design

### Library Inventory Commands

```bash
bgng library list
bgng library list skills
bgng library list mcp
bgng library show <id>
```

Output should clearly distinguish:

- available
- default
- project-active when a project config is present
- source type
- source package or registry

Example:

```text
Skills
  brainstorming              repo      default
  writing-polish             npm       available

MCP Servers
  context7                   built-in  default
  github                     library   available
```

### Library Add Commands

```bash
bgng library add skill <package-or-path>
bgng library add mcp <name-or-spec>
```

Behavior:

- add/register inventory for reuse
- do not make the item globally default
- do not add the item to the current project unless an explicit `--project` shortcut exists
- print the next logical commands

Example:

```text
Added github to your local library.

Next:
  bgng library defaults add mcp github
  bgng add mcp github
```

### Library Defaults Commands

```bash
bgng library defaults list
bgng library defaults add skill <skillName>
bgng library defaults remove skill <skillName>
bgng library defaults add mcp <serverName>
bgng library defaults remove mcp <serverName>
bgng library defaults add extension <extensionName>
bgng library defaults remove extension <extensionName>
```

Behavior:

- mutate user global config under `~/.agents/bgng/config.json`
- require the item to exist in the built-in registry or local library
- refuse unknown or ambiguous names
- preserve unrelated config fields
- print `bgng write --dry-run` as the next step

JSON payload should include:

```json
{
  "kind": "mcp",
  "id": "github",
  "scope": "global-default",
  "configPath": "~/.agents/bgng/config.json",
  "action": "added",
  "next": ["bgng write --dry-run"]
}
```

### Convenience Flags

Primary commands should stay explicit, but safe shortcuts can exist:

```bash
bgng library add mcp github --default
bgng library add skill @acme/writing-skills --default writing-polish
bgng library add skill @acme/writing-skills --project writing-polish
```

Rules:

- `--default` must be explicit and visible in output.
- `--project` must only mutate the current project config.
- If both are allowed together, output must show two separate mutations.
- In non-TTY mode, `--default` should require unambiguous IDs.

### Existing Advanced Commands

Keep these for compatibility and low-level operation:

```bash
bgng skills curate <skillName>
bgng skills uncurate <skillName>
bgng skills sync
bgng mcp sync
bgng sync
```

Recommended relationship:

- `bgng library defaults add skill <name>` becomes the user-facing global-default command.
- `bgng skills curate <name>` remains an advanced alias or lower-level primitive.
- Over time, docs should teach `library defaults` first and `skills curate` as advanced compatibility.

## Command To File Mutation Matrix

| Command | Mutates Library | Mutates Global Config | Mutates Project Config | Mutates Downstream Tools |
| --- | --- | --- | --- | --- |
| `bgng search skill` | no | no | no | no |
| `bgng library add skill <pkg>` | yes | no | no | no |
| `bgng library add mcp <spec>` | yes | no | no | no |
| `bgng library defaults add skill <name>` | updates skill publication symlink | yes | no | no |
| `bgng library defaults add mcp <name>` | no | yes | no | no |
| `bgng add skill <name>` | yes, only if installing a selected catalog result | no | yes | no |
| `bgng add mcp <name>` | yes, only if registering a selected catalog result | no | yes | no |
| `bgng write --dry-run` | no | no | no | no |
| `bgng write` | no | no | no | yes |

## Migration Strategy

### Phase 1: Add User Global Config Loader

Add support for `~/.agents/bgng/config.json` while preserving current repo-root config behavior.

Resolution:

1. If an explicit repo root is supplied for tests/dev, keep current behavior unless a user config is requested.
2. In installed CLI mode, prefer `~/.agents/bgng/config.json`.
3. If the user config is missing, initialize it from packaged defaults.
4. Keep config writes backed up.

### Phase 2: Add MCP Library

Implement:

```bash
bgng library add mcp <file-or-catalog-id>
bgng library list mcp
bgng library show <mcp-id>
```

MCP library entries should validate against the existing `RegistryServer` shape.

Collision behavior:

- refuse ID collisions by default
- allow explicit `--replace` later
- allow explicit `--as <id>` for catalog imports if needed

### Phase 3: Add Library Defaults

Implement:

```bash
bgng library defaults list
bgng library defaults add/remove skill
bgng library defaults add/remove mcp
```

Skill default migration:

- On first global config write, import current `~/.agents/skills` symlinks into `defaults.skills`.
- Continue maintaining `~/.agents/skills` as a compatibility publication layer.
- Do not delete existing symlinks automatically.

MCP default migration:

- Seed `defaults.mcpServers` from the current effective built-in defaults.
- Preserve existing `optional` semantics for compatibility during migration.
- Eventually prefer explicit `defaults.mcpServers` over implicit `optional: false` behavior.

### Phase 4: Update Write And Doctor

`apply` should consume:

- user global config
- built-in registry
- MCP library registry
- package-backed skill library
- project config

`doctor` should report:

- defaults referencing missing library entries
- project overrides duplicating global defaults
- library entries requiring missing environment variables
- stale `~/.agents/skills` symlinks
- MCP library entry collisions
- config migration status

### Phase 5: Documentation And Deprecation Labels

Docs should teach:

```bash
bgng library defaults add skill <name>
```

before:

```bash
bgng skills curate <name>
```

No command removal is required. Compatibility commands can remain indefinitely if maintenance cost stays low.

## UX Examples

### Add A Skill Package To Library, Then Make One Skill Global

```bash
bgng search skill "writing"
bgng library add skill @acme/writing-skills
bgng library defaults add skill writing-polish
bgng write --dry-run
bgng write
```

Result:

- package is installed under `~/.agents/packages/skills`
- `writing-polish` is added to `defaults.skills`
- `~/.agents/skills/writing-polish` is maintained for compatibility
- downstream tools receive the skill on apply

### Add A Skill Only To One Project

```bash
cd ~/dev/api
bgng add skill writing-polish
bgng write --dry-run
```

Result:

- project config includes `writing-polish`
- global defaults do not change
- other projects do not receive the skill unless it is globally defaulted or added there

### Register An MCP And Make It Global

```bash
bgng library add mcp github
bgng library defaults add mcp github
bgng write --dry-run
```

Result:

- MCP definition is stored in `~/.agents/library/mcp-servers.json`
- global config records `github` in `defaults.mcpServers`
- downstream tools receive it on apply if required env vars exist

### Add An MCP Only To One Project

```bash
cd ~/dev/webapp
bgng add mcp github
bgng write --dry-run
```

Result:

- project config enables `github`
- global defaults do not change
- other projects do not receive it

### Remove A Global Default But Keep It In Library

```bash
bgng library defaults remove mcp github
bgng write
```

Result:

- `github` remains available in the local library
- `github` is no longer globally active
- projects that explicitly add `github` still keep it

## Error Handling Rules

### Unknown Item

```text
No local MCP server found: github.

Search catalogs:
  bgng search mcp github

Or register one:
  bgng library add mcp <file>
```

### Already Default

```text
github is already a global default MCP server.
No changes made.
```

Exit code should be `0` for idempotent no-op defaults unless `--strict` is added later.

### Project Add Duplicates Global Default

If a user runs:

```bash
bgng add mcp context7
```

and `context7` is already globally defaulted, preferred behavior is:

```text
context7 is already active by global default.
No project override needed.

Next:
  bgng write --dry-run
```

Use `--force-project-override` only if there is a real future need.

### Library Collision

```text
MCP server "github" already exists in the library.
No changes made.

Use --replace to update it, or --as <id> to register another copy.
```

### Missing Environment

```text
github requires environment variable GITHUB_TOKEN.
Set it before running bgng write, or keep the server project-scoped until needed.
```

`library defaults add mcp` may allow adding an MCP with missing env as long as it warns clearly. `doctor` must continue reporting the missing env.

## Security And Trust

### Skills

- npm skill packages must continue to be packed/extracted with scripts disabled.
- bundle manifests must continue to validate paths and required `SKILL.md` files.
- package install should not imply global default activation.

### MCP

- MCP catalog entries should come only from configured trusted sources.
- `library add mcp` should show executable command, args, transport, env vars, and source before registering in guided mode.
- Non-TTY catalog registration should require `--yes` and an unambiguous result.
- No secret values should be written into library or config files.

### Defaults

Making an MCP global affects every project. `library defaults add mcp` should clearly label the scope as machine-wide.

## Testing Strategy

Unit tests:

- user global config load/init/save
- library MCP registry load/save/validation
- default add/remove idempotency
- effective config merge precedence
- collision detection
- missing env diagnostics

Integration tests:

- `library add mcp` registers an MCP without making it active
- `library defaults add mcp` makes it active globally
- `add mcp` remains project-scoped
- project disable overrides global default
- `write --dry-run --json` includes global defaults and project overrides
- `doctor --json` reports stale project overrides and missing default references

TTY tests:

- guided `library add mcp` confirmation
- guided `library defaults add mcp` confirmation for machine-wide scope
- non-TTY command refusal without `--yes` where needed

Regression tests:

- existing `skills curate` still works
- existing `~/.agents/skills` curated links are honored during migration
- existing repo-root test fixtures continue to work
- `sync` compatibility remains intact

## Resolved Design Decisions

### Should `defaults.skills` Immediately Replace `~/.agents/skills` As Source Of Truth?

Decision: no immediate hard replacement.

Use `defaults.skills` as the forward-looking source of truth, but keep `~/.agents/skills` as a compatibility publication layer and migration input. This avoids breaking existing user state and existing tools that inspect `~/.agents/skills`.

### Should Built-In Non-Optional MCP Servers Remain Implicitly Global?

Decision: migrate toward explicit `defaults.mcpServers`.

Short term, seed defaults from current behavior. Long term, global MCP activation should be explicit and inspectable in user config.

### Should `library add ... --default` Exist?

Decision: yes as a convenience, but not as the primary documented path.

The primary model should be two-step because it teaches availability vs activation. The shortcut is useful for experienced users and scripts.

### Should Project Config Be Allowed To Reference Catalog Items Directly?

Decision: no.

Project config should reference known library or built-in IDs. If an item comes from a catalog, install/register it into the library first, then reference the local ID. This keeps project config stable and avoids applying network-dependent state.

## Implementation Readiness

This design is compatible with the current command architecture:

- `bgng add ...` remains project-first
- `bgng library ...` expands from read-only inventory plus skill bundle add into full local inventory management
- `bgng library defaults ...` gives users a precise CLI for global defaults
- `bgng write` remains deterministic and non-interactive
- `bgng doctor` becomes the consistency guard across library, defaults, and project config

The highest-value first implementation slice is:

1. add user global config path support
2. add `defaults.skills` and `defaults.mcpServers`
3. implement `bgng library defaults list/add/remove`
4. make project `add mcp` no-op when the MCP is already globally defaulted
5. add MCP library storage after the defaults path is stable

That sequence solves the immediate UX issue while avoiding a large upfront migration of every inventory concept.
