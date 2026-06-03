---
sidebar_position: 8
---

# MCP

`drwn mcp` is the MCP-scoped namespace for inspecting and writing MCP server state. The two subcommands are read (`list`) and write (`write`); the write side is an alias for `drwn write --mcp-only` and shares the same materialization engine.

## drwn mcp list

List MCP servers from the merged registry, with active state under the current effective config.

```bash
drwn mcp list
drwn mcp list --json
```

The merged registry is the built-in `registry/mcp-servers.json` unioned with the user MCP library at `~/.agents/drwn/mcp-servers/` (user entries override on key collision). Output columns are `name`, `transport`, `active`, `targets`.

`drwn mcp list` is project-aware: when run inside a configured project, the active set reflects the project overlay (`<project>/.agents/drwn/config.json`) and any extension-derived MCP state (e.g. `extensions.parallel.mcp`).

This command is read-only.

## drwn mcp write

Write the effective MCP configuration into enabled downstream targets.

```bash
drwn mcp write --dry-run
drwn mcp write
drwn mcp write --target=claude
drwn mcp write --target=cursor
drwn mcp write --json
```

`drwn mcp write` is equivalent to `drwn write --mcp-only`. `--dry-run` previews changes without mutating files. `--target` limits the write to one of `claude`, `codex`, or `cursor`.

## Where MCP definitions live

| Source | Path | Owner |
|---|---|---|
| Built-in registry | `registry/mcp-servers.json` | packaged harness |
| User MCP library | `~/.agents/drwn/mcp-servers/<id>.json` | machine-local additions |
| Registry/target config | `registry/config.json` | packaged harness |
| Machine defaults | `~/.agents/drwn/machine.json` under `defaults.mcpServers` | machine-local |
| Project overlay | `<project>/.agents/drwn/config.json` | per-project |

## Inclusion rules

`buildActiveServers` decides which servers materialize for the active targets:

- If `defaults.mcpServers` is set, it acts as an allowlist — only listed servers are active.
- Otherwise: `transport: "platform-provided"` entries are always excluded (they live in the registry for documentation but are never written to downstream tool configs).
- Servers with `optional: true` are off by default; toggle them in the optional boolean map at `defaults.optional.<name>` (or the registry's optional map for machine writes).
- The Parallel MCP overlay is gated by `config.parallel.mcp.enabled`.
- Inside a project, `extensions.parallel.mcp = true` enables the project-local Parallel MCP overlay; the project overlay can also enable or disable any individual server.

## Generated config

`drwn write` (and `drwn mcp write`) produce target-specific output:

- Claude: `_drwn`-managed `mcpServers` block inside `~/.claude/settings.json`
- Codex: `mcp_servers` section rewrite inside `~/.codex/config.toml`
- Cursor: a generated `cursor-mcp.json` under the write scope's generated dir, symlinked from `~/.cursor/mcp.json` (or the project's `.cursor/mcp.json` for project writes)

## Related

- [Write](./write) — full materialization, including skills
- [Status](./status) — see which MCP servers are active and why
- [Doctor](./doctor) — detect MCP drift between recorded and live state
