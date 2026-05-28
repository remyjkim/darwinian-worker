---
title: "Getting Started"
description: "Install and configure beginning-harness in minutes."
date: 2026-04-28
order: 1
---

## Requirements

- **Bun 1.2+** — runtime for the CLI
- **Node.js** — for MCP servers that use `node`
- **npm** — when installing the published package or adding npm skill bundles
- Optional: `parallel-cli`, `markitdown`, or `markdownify-mcp` only when you enable those integrations

## Install

### Published package

```bash
npm install -g beginning-harness
bgng status
```

The published package includes built-in harness defaults. By default, global `bgng` uses that packaged harness source.

### Work from a checkout

Use this mode if you want to edit the registry, maintain your own fork, add built-in skills, or develop the CLI:

```bash
git clone https://github.com/remyjkim/beginning-harness.git
cd beginning-harness
bun install
bun run bgng -- status
```

You can also point a global install at a checkout:

```bash
export AGENTS_REPO_ROOT=/path/to/beginning-harness
bgng status
```

For local development, link the package:

```bash
bun link
bgng --help
```

## Quickstart

Start by inspecting before writing machine-scope state:

```bash
bgng status
bgng skills list
bgng mcp list
bgng write --dry-run
```

If the dry run looks right, write the generated state:

```bash
bgng write
```

That first run gives you:

- a system overview
- the current skill inventory
- the active MCP inventory
- a planned-change preview
- an explicit write step

### Existing users

If you used a pre-cards version of `bgng`, inspect and migrate the local store
before relying on the cards-era layout:

```bash
bgng store status
bgng store migrate
bgng store status
```

`bgng` warns when it detects a pre-cards layout, but migration is explicit.

### Project-specific setup

For a project-specific setup, start in the project directory:

```bash
bgng init
bgng extensions add parallel
bgng add skill <skill-name-or-query>
bgng add mcp <server-name>
bgng write --dry-run
bgng write
```

When `bgng write` runs inside a project with `.agents/bgng/config.json`, it
writes project-local `.claude`, `.codex`, and `.cursor` state instead of
writing to your home-directory tool config.

### Apply a Harness Card

Cards package reusable project harness intent:

```bash
bgng init
bgng apply @me/backend@^1.0.0
bgng write --dry-run
bgng write
```

The project records card refs in `.agents/bgng/config.json` and exact resolved
versions in `.agents/bgng/card.lock`.

### Non-interactive mode

For scripts and CI-style setup:

```bash
bgng init --non-interactive
```
