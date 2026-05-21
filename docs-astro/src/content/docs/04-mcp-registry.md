---
title: "MCP Registry"
description: "Manage MCP server definitions, toggles, and per-target configuration."
date: 2026-04-28
order: 4
---

## Registry Files

MCP servers are defined in two places:

- **`registry/mcp-servers.json`** — server definitions (command, args, env)
- **`registry/config.json`** — target config and optional server toggles

In a checkout, edit these files directly. With the published package, they ship as packaged defaults.

## User Registry

In the cards-era store, user-registered MCP servers live as one JSON file per
server:

```text
~/.agents/bgng/mcp-servers/<server-id>.json
```

Add a user MCP server:

```bash
bgng library add mcp my-server.json --as my-server
```

Machine-wide active MCP defaults live in `~/.agents/bgng/machine.json` under
`defaults.mcpServers`.

Pre-cards installs used `~/.agents/library/mcp-servers.json`. `bgng store
migrate` explodes that legacy file into the cards-era `mcp-servers/` directory
and archives the old layout.

## Inspecting MCP State

```bash
bgng mcp list
bgng mcp list --json
```

## Writing MCP Config

Preview before writing:

```bash
bgng mcp write --dry-run
```

Write to all targets:

```bash
bgng mcp write
```

Limit to one target:

```bash
bgng mcp write --target=cursor
```

## Notes

- **Platform-provided entries** can live in the registry but are excluded from generated local tool configs
- **Optional servers** are included only when enabled in `registry/config.json`
- **Parallel MCP** is controlled by `config.parallel.mcp.enabled`
- **Card-provided servers** and project-local server overrides apply when commands run inside a configured project
- **Project-local extension settings** such as `extensions.parallel.mcp` are applied when commands run inside that project
