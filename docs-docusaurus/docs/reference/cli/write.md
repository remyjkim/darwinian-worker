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

Write at machine scope (user defaults) rather than project scope:

```bash
drwn write --root
drwn write --user       # alias for --root
drwn write --root --dry-run
```

`--root` / `--user` ignores project config and writes machine defaults to user-scope tool configs (`~/.claude/`, `~/.codex/`, `~/.cursor/`). The write record lives at `~/.agents/drwn/global-write-record.json`.

Without `--root`, project writes use `<project>/.agents/drwn/write-record.json`. The two modes are mutually exclusive — passing both flags is an error.

Enforcement flags:

```bash
drwn write --strict-hooks   # fail if any hook policy file cannot be materialized
drwn write --strict         # treat all warnings as errors
```

`--strict-hooks` is relevant when you expect hook policies to be present; without it, missing policies are warnings rather than failures.

When locked cards declare optional MCP servers, `drwn write` includes an optional MCP report. Human output lists each card server as active, skipped, or shadowed. JSON output includes the same data under `optionalMcpReport`. Skipped card MCPs can be enabled for the current project with:

```bash
drwn add mcp <server-name>
drwn write --dry-run
```
