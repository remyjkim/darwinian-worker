---
sidebar_position: 5
---

# Write

`drwn write` materializes the effective harness into downstream local agent tool files. It is the command that turns the resolved model into Claude, Codex, Cursor, and MCP config state.

Preview first:

```bash
drwn write --dry-run
drwn write --json
```

Write all effective state:

```bash
drwn write
```

Limit the operation:

```bash
drwn write --target=claude
drwn write --skills-only
drwn write --mcp-only
drwn mcp write --dry-run
```

`drwn write --force` is for replacing drift inside paths that `drwn` already owns. It is not a general cleanup flag for user-managed files.

Project writes use `<project>/.agents/drwn/write-record.json`. Machine writes use `~/.agents/drwn/global-write-record.json`. Those records let `drwn` remove stale managed links while preserving user-owned replacements.

When locked cards declare optional MCP servers, `drwn write` includes an optional MCP report. Human output lists each card server as active, skipped, or shadowed. JSON output includes the same data under `optionalMcpReport`. Skipped card MCPs can be enabled for the current project with:

```bash
drwn add mcp <server-name>
drwn write --dry-run
```
