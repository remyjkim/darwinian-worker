---
sidebar_position: 5
---

# MCP Servers

MCP servers are reusable tool definitions that `drwn` can activate globally, attach to a project, bundle into a card source, and write into downstream agent tool configs.

Built-in definitions come from the harness registry. User definitions live under `~/.agents/drwn/mcp-servers`. Card-declared definitions come from the selected project Worker closure. Explicit machine MCP IDs live under `capabilities.mcpServers` in `~/.agents/drwn/machine.json`; project choices live in `.agents/drwn/config.json`.

Inspect active MCP state:

```bash
drwn mcp list
drwn mcp list --json
drwn doctor
```

Register and activate reusable servers:

```bash
drwn library add mcp ./context7.json --as context7
drwn library list mcp
drwn library defaults add mcp context7
drwn library defaults remove mcp context7
```

Attach MCP servers to a card source:

```bash
drwn card source add-mcp @your-handle/backend context7
drwn card source add-mcp @your-handle/backend context7 --from ./context7.json
drwn card source remove-mcp @your-handle/backend context7
drwn card source doctor @your-handle/backend
```

Card-local MCP definitions do not have to be reusable library entries. If a card ships a definition with `optional: true`, consuming the card does not activate that server immediately. `drwn write` reports the skipped optional MCP, and the project can opt in with:

```bash
drwn add mcp context7
```

Write the effective MCP config:

```bash
drwn mcp write --dry-run
drwn mcp write
drwn write --mcp-only
```
