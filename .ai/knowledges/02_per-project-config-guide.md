# Per-Project Config Guide

## Purpose

Use per-project config when one project should see a different effective `bgng` configuration than your machine-wide default.

This lets a project:

- enable or disable MCP servers locally
- add project-local MCP server definitions
- enable or disable targets locally
- include or exclude skills during sync

Without per-project config, `bgng` uses only the canonical repo configuration plus the current machine state.

## Config Path And Discovery

The config file path is:

```text
<project>/.agents/bgng/config.json
```

Discovery walks upward from the current working directory and stops at the first matching file.

This means:

- running `bgng` from a nested directory inside a project still finds the project config
- the nearest matching config wins
- commands outside a configured project fall back to the global canonical view

Commands affected by project discovery include:

- `bgng sync`
- `bgng status`
- `bgng doctor`

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
  "targets": {
    "claude": { "enabled": true },
    "codex": { "enabled": false }
  }
}
```

Supported top-level keys:

- `version`
- `servers`
- `skills`
- `targets`

## Merge Semantics

Per-project config does not replace the canonical repo config wholesale. It merges into it.

### Servers

`servers` supports two behaviors:

- toggle an existing canonical server with `{ "enabled": true|false }`
- add a project-local server definition by providing a full server object

Effects:

- disabling a server removes it from the effective project registry
- enabling a known canonical server restores it
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

This disables Codex for sync from that project context without changing the global canonical config.

### Skills

`skills.exclude` removes matching skills from downstream sync in that project view.

`skills.include` adds matching repo-native skills into downstream sync for that project view.

Important current limitation:

- `skills.include` currently resolves repo-native skills only
- package-backed skill bundles can still be curated and synced generally, but project include does not yet resolve package-backed skill names

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
- stale project skill overrides

This is report-only. `doctor` does not rewrite or repair project config.

## Recommended Workflow

```bash
cd /path/to/project
bgng init
$EDITOR .agents/bgng/config.json
bgng status
bgng sync --dry-run
bgng doctor
bgng sync
```

## Anti-Patterns

Avoid:

- treating project config as a second full canonical registry
- using `skills.include` for package-backed skills today
- assuming `doctor` will auto-fix stale project state
- using project config when a simple global curation change would be clearer

## Relationship To Other Docs

- general CLI usage: [01_agents-cli-usage-guide.md](./01_agents-cli-usage-guide.md)
- extension skill bundles: [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md)
