---
title: "Extensions"
description: "Parallel, Beads, and MarkItDown capability families for project-level setup."
date: 2026-04-28
order: 6
---

## What Extensions Are

Extensions are named capability families that `drwn` can inspect, diagnose, and set up. They are distinct from skill bundles and MCP servers — an extension can combine CLI prerequisites, repo-native skills, optional MCP servers, project setup actions, and diagnostics under one user-facing name.

Inspect extension support:

```bash
drwn extensions list
drwn extensions show beads
drwn extensions status
drwn extensions doctor
```

Machine-readable output is available with `--json`.

## Current Extensions

### Parallel

Parallel support is CLI+skills-first. Selecting the extension for one project writes semantic config under `<project>/.agents/drwn/config.json`; `drwn write` then derives the four Parallel skills for that project without requiring a machine skill selection.

Default shared skills:

- `parallel-web-search`
- `parallel-web-extract`
- `parallel-deep-research`
- `parallel-data-enrichment`

Those skills assume `parallel-cli` is installed and authenticated separately.

Install `parallel-cli`:

```bash
curl -fsSL https://parallel.ai/install.sh | bash
```

Authenticate:

```bash
parallel-cli login
parallel-cli auth
```

Preview setup:

```bash
drwn extensions setup parallel --dry-run
```

Enable the Parallel skills for the current project:

```bash
drwn extensions add parallel
```

Enable project-scoped Parallel MCP as well:

```bash
drwn extensions add parallel --mcp
```

`drwn extensions status parallel` and `drwn extensions doctor parallel` report missing CLI or MCP prerequisites.

### MarkItDown

MarkItDown support is CLI+skills-first. Selecting the extension for one project writes semantic config under `<project>/.agents/drwn/config.json`; `drwn write` then derives the `markitdown-document-conversion` skill for that project.

The guarded install path is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

Preview setup:

```bash
drwn extensions setup markitdown --dry-run
```

Run setup and choose interactively whether to install the missing CLI:

```bash
drwn extensions setup markitdown
```

For scripts:

```bash
drwn extensions setup markitdown --install
drwn extensions setup markitdown --no-install
```

`drwn extensions status markitdown` and `drwn extensions doctor markitdown` report missing runtime, missing skill, and smoke-check failures.

### Beads

Beads support is CLI-first and project-scoped. `drwn` checks for `bd`, reports whether the current project has `.beads/`, can run Beads setup recipes, and can record Beads extension config for the project.

Install `bd` through one of the upstream-supported paths:

```bash
brew install beads
npm install -g @beads/bd
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

Preview setup:

```bash
drwn extensions setup beads --dry-run
```

Run setup:

```bash
drwn extensions setup beads
```

Useful flags:

| Flag | Description |
|------|-------------|
| `--target=codex,claude,cursor` | Select Beads setup recipes |
| `--stealth` | Pass Beads stealth setup mode to `bd` |
| `--skip-bd-init` | Skip `bd init` |
| `--skip-bd-setup` | Skip `bd setup` |
| `--include-skill` | Set `extensions.beads.includeSkill: true` to derive `beads-task-tracking` |

Setup never runs `bd init --force` or `bd doctor --fix` by default. Beads MCP remains optional.

## Add vs. Setup

Use `drwn extensions add <name>` when you only want to record project config.
Use `drwn extensions setup <name>` when the extension has setup work or runtime
prerequisites to inspect.

```bash
drwn extensions add markitdown --dry-run
drwn extensions add parallel --skip-skills
drwn extensions setup markitdown --install
```
