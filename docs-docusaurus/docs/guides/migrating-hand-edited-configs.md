---
sidebar_position: 8
---

# Migrate Hand-Edited Tool Configs

This guide walks through bringing an existing hand-edited
`~/.claude/settings.json` or `~/.codex/config.toml` into `drwn`'s managed model
without losing your existing MCP servers or custom skills.

## Inspect What You Already Have

`drwn scan` is the planned non-mutating discovery surface for exactly this
problem. It is currently a placeholder: the command runs and is intended to
report local agent tool config it finds and suggest library, defaults, and
project-config candidates. Until the implementation lands, inventory manually:

```bash
cat ~/.claude/settings.json
cat ~/.codex/config.toml
```

Record every MCP server entry, every custom skill directory, and every
hand-edited target setting.

## Register Existing MCP Servers

For each MCP server in your hand-edited config, write a small JSON definition
and add it to the local library:

```bash
drwn library add mcp ./github-mcp.json --as github
drwn library list mcp
```

If the server should apply to every project, promote it to a default:

```bash
drwn library defaults add mcp github
```

If the server only applies to one project, scope it there instead:

```bash
cd /path/to/project
drwn init
drwn add mcp github
```

## Migrate Custom Skills

Inventory any custom skill directories the agent tools were already reading
from. For each one:

```bash
drwn skills packages add <npm-package-or-local-path>
drwn library add skill <local-path>
drwn skills list
```

If the skill should be available globally:

```bash
drwn skills curate <skill-name>
```

If the skill should apply only to one project, scope it through the project
config instead of curating it.

## Preview The Managed Write

```bash
drwn write --dry-run
```

Compare the planned changes against your hand-edited files. `drwn` will:

- preserve user-owned entries it did not write
- replace its own managed sections in the generated MCP config and managed
  symlinks
- warn when a hand-edited entry conflicts with a managed one

## Iterate

Repeat `library add`, `library defaults add`, `add skill`, and
`write --dry-run` until the dry run matches what you want. Then run:

```bash
drwn write
```

## Conservative Cleanup Model

`drwn` does **not** delete hand-edited entries it did not create. When a
managed write would otherwise replace a user-owned entry, `drwn` preserves the
user-owned version and reports the ownership conflict instead of overwriting.
This is by design: migration should never silently destroy something you
hand-wrote.

Use `drwn doctor` after migration to surface remaining ownership conflicts,
stale links, and unresolved references.

## See Also

- [library CLI reference](../reference/cli/library)
- [Ownership conflicts](../troubleshooting/ownership-conflicts)
