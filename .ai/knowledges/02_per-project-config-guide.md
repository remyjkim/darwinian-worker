# Per-Project Config Guide

## Purpose

Use per-project config when one project should see a different effective `bgng` configuration than your machine-wide default.

This lets a project:

- apply reusable Harness Cards
- enable or disable MCP servers locally
- add project-local MCP server definitions
- enable extensions locally
- enable or disable targets locally
- include or exclude skills during write

Without per-project config, `bgng` uses the packaged or checkout harness defaults plus the current machine state.

## Config Path And Discovery

The config file path is:

```text
<project>/.agents/bgng/config.json
```

Discovery walks upward from the current working directory and stops at the first matching file.

This means:

- running `bgng` from a nested directory inside a project still finds the project config
- the nearest matching config wins
- commands outside a configured project fall back to the machine-wide harness view

Commands affected by project discovery include:

- `bgng write`
- `bgng mcp list`
- `bgng mcp write`
- `bgng status`
- `bgng doctor`
- `bgng extensions status`
- `bgng extensions doctor`
- `bgng extensions setup`

## Scaffolding

Create a project config with:

```bash
bgng init
```

Overwrite an existing one with:

```bash
bgng init --force
```

The scaffolded file is:

```json
{
  "version": 1
}
```

## Supported Schema

Current schema:

```json
{
  "version": 1,
  "cards": ["@me/backend@^1.0.0"],
  "servers": {
    "server-name": { "enabled": false },
    "custom-server": {
      "description": "Project-local server",
      "transport": "stdio",
      "command": "node",
      "args": ["./scripts/server.js"],
      "optional": false
    }
  },
  "skills": {
    "include": ["skill-a"],
    "exclude": ["skill-b"]
  },
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": false
    },
    "beads": {
      "enabled": true,
      "targets": ["codex", "claude"],
      "includeSkill": true
    },
    "markitdown": {
      "enabled": true,
      "skills": true
    }
  },
  "targets": {
    "claude": { "enabled": true },
    "codex": { "enabled": false }
  }
}
```

Supported top-level keys:

- `version`
- `cards`
- `servers`
- `skills`
- `extensions`
- `targets`

## Cards

`cards` is an ordered array of Harness Card refs. Supported refs include local
store refs such as `@me/backend@^1.0.0`, exact refs such as
`@me/backend@1.0.0`, and local development refs such as
`file:../cards/backend`.

Card refs are resolved into:

```text
<project>/.agents/bgng/card.lock
```

The lockfile is tracked with the project config. It records exact card versions,
integrity, source paths, and the manifest used to compute effective state.

Effective project state is:

```text
built-in defaults -> user library -> cards in declared order -> project overlay
```

Machine-only defaults from `~/.agents/bgng/machine.json` do not apply when a
project config is present.

## Project-local Materialization

When `bgng write` runs inside a configured project, it writes downstream tool
state under the project root:

```text
<project>/.claude/settings.json
<project>/.claude/skills/
<project>/.codex/config.toml
<project>/.codex/skills/
<project>/.cursor/mcp.json
<project>/.agents/bgng/generated/cursor-mcp.json
<project>/.agents/bgng/write-record.json
```

When `bgng write` runs outside a configured project, it writes machine-scope
state under the home directory and store:

```text
~/.claude/
~/.codex/
~/.cursor/
~/.agents/bgng/generated/
~/.agents/bgng/global-write-record.json
```

The implementation verifies this with scope-isolation tests. External
Claude/Codex/Cursor read behavior should still be rechecked before relying on a
new downstream tool version in production.

## Merge Semantics

Per-project config does not replace the baseline harness config wholesale. It merges into it.

### Servers

`servers` supports two behaviors:

- toggle an existing baseline server with `{ "enabled": true|false }`
- add a project-local server definition by providing a full server object

Effects:

- disabling a server removes it from the effective project registry
- enabling a known baseline server restores it
- adding a new server makes it available only in the effective project view

### Targets

`targets` can override whether a target is enabled for the project.

Example:

```json
{
  "version": 1,
  "targets": {
    "codex": { "enabled": false }
  }
}
```

This disables Codex for write from that project context without changing the machine-wide harness defaults.

### Skills

`skills.exclude` removes matching skills from downstream write in that project view.

`skills.include` adds matching skills into downstream write for that project view.

Resolution behavior:

- repo-native shared skills can be included by skill name
- installed package-backed shared skills can be included by skill name when the name resolves uniquely
- unknown or ambiguous skill names are reported by `bgng doctor`

### Extensions

`extensions` stores semantic project intent for named capability families. Each extension owns how that intent maps to concrete write and setup behavior.

Use `extensions.parallel` for project-scoped Parallel support, `extensions.beads` for project-scoped Beads support, and `extensions.markitdown` for project-scoped document conversion support.

Parallel example:

```json
{
  "version": 1,
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": false
    }
  }
}
```

Effects:

- derives `parallel-web-search`, `parallel-web-extract`, `parallel-deep-research`, and `parallel-data-enrichment` during project write
- does not require global skill curation
- keeps Parallel MCP disabled unless `mcp` is `true`
- does not install or authenticate `parallel-cli`

Beads example:

```json
{
  "version": 1,
  "extensions": {
    "beads": {
      "enabled": true,
      "targets": ["codex", "claude"],
      "includeSkill": true
    }
  }
}
```

Effects:

- records that Beads is selected for the project
- lets `bgng extensions status beads` and `doctor beads` report project activation state
- derives `beads-task-tracking` only when `includeSkill` is `true`

MarkItDown example:

```json
{
  "version": 1,
  "extensions": {
    "markitdown": {
      "enabled": true,
      "skills": true
    }
  }
}
```

Effects:

- records that MarkItDown is selected for the project
- lets `bgng extensions status markitdown` and `doctor markitdown` report runtime health
- derives `markitdown-document-conversion` unless `skills` is `false`
- does not install `markitdown` unless `bgng extensions setup markitdown --install` is used or an interactive setup prompt is accepted

Lower-level `skills.include` and `skills.exclude` still work with extension-derived skill lists. If an extension derives a skill and `skills.exclude` names the same skill, `skills.exclude` wins.

## Examples

### Minimal config

```json
{
  "version": 1
}
```

### Disable one server for this project

```json
{
  "version": 1,
  "servers": {
    "markdownify": { "enabled": false }
  }
}
```

### Add a project-local MCP server

```json
{
  "version": 1,
  "servers": {
    "project-devtools": {
      "description": "Project-local devtools server",
      "transport": "stdio",
      "command": "node",
      "args": ["./scripts/project-devtools.js"],
      "optional": false
    }
  }
}
```

### Exclude globally curated skills for one project

```json
{
  "version": 1,
  "skills": {
    "exclude": ["blog-post-polish", "polish-voice-research"]
  }
}
```

### Include extra repo-native skills for one project

```json
{
  "version": 1,
  "skills": {
    "include": ["frontend-design", "writing-plans"]
  }
}
```

### Enable Parallel for one project

Use the command:

```bash
bgng extensions setup parallel
```

Or write config directly:

```json
{
  "version": 1,
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": false
    }
  }
}
```

### Enable Beads for one project

Use the command:

```bash
bgng extensions setup beads --include-skill
```

This initializes Beads through `bd` and records semantic extension config:

```json
{
  "version": 1,
  "extensions": {
    "beads": {
      "enabled": true,
      "targets": ["codex", "claude", "cursor"],
      "includeSkill": true
    }
  }
}
```

### Disable a target locally

```json
{
  "version": 1,
  "targets": {
    "cursor": { "enabled": false }
  }
}
```

## Status And Doctor Behavior

`bgng status` reflects whether a project config is active and summarizes its override counts.

`bgng doctor` reports project-config-specific issues such as:

- unknown server references
- unknown skill references
- unknown extension references
- stale project skill overrides

This is report-only. `doctor` does not rewrite or repair project config.

## Recommended Workflow

```bash
cd /path/to/project
bgng init
$EDITOR .agents/bgng/config.json
bgng status
bgng write --dry-run
bgng doctor
bgng write
```

## Anti-Patterns

Avoid:

- treating project config as a second full baseline registry
- using `skills.include` for broad global defaults when `bgng library defaults add skill <name>` would be clearer
- manually listing extension-owned skills when `extensions.<name>` is clearer
- assuming `doctor` will auto-fix stale project state
- using project config when a simple `bgng library defaults add ...` change would be clearer

## Relationship To Other Docs

- general CLI usage: [01_agents-cli-usage-guide.md](./01_agents-cli-usage-guide.md)
- extension skill bundles: [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md)
