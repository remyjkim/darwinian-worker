---
sidebar_position: 3
---

# Set Up Parallel

This guide enables Parallel for a single project: the four CLI-backed skills by
default, with the optional MCP overlay layered on top when you want it.

Parallel ships in two layers:

- **default**: CLI-backed shared skills, derived per project from `extensions.parallel.skills`
- **optional**: globally enabled `parallel-search` and `parallel-task` MCP servers

The four default skills are:

- `parallel-web-search`
- `parallel-web-extract`
- `parallel-deep-research`
- `parallel-data-enrichment`

All four assume `parallel-cli` is installed and authenticated on your machine.
`drwn` does not install or authenticate `parallel-cli`.

## Install And Authenticate Parallel

Install the upstream CLI:

```bash
curl -fsSL https://parallel.ai/install.sh | bash
```

Authenticate:

```bash
parallel-cli login
parallel-cli auth
```

## Preview Project Setup

From the project root:

```bash
drwn extensions setup parallel --dry-run
```

This previews the project config write under
`<project>/.agents/drwn/config.json` without mutating anything.

## Enable The Skills For This Project

```bash
drwn extensions add parallel
drwn write --dry-run
drwn write
```

`drwn write` then derives the four Parallel skills for this project without
needing global skill curation.

## Add The MCP Overlay (Project Scope)

To turn on `parallel-search` and `parallel-task` for the current project only:

```bash
drwn extensions add parallel --mcp
drwn mcp write --dry-run
drwn mcp write
```

## Enable The MCP Overlay Globally

The project-scoped MCP toggle above does not flip the global switch. To enable
Parallel MCP across every project, edit `registry/config.json`:

```json
"parallel": {
  "cli": { "enabled": true },
  "mcp": { "enabled": true }
}
```

Then materialize:

```bash
drwn mcp write
```

## Verify

```bash
drwn extensions status parallel
drwn extensions doctor parallel
drwn mcp list
```

Status and doctor report missing CLI or MCP prerequisites without mutating
state. `drwn` does not authenticate `parallel-cli` for you; if status reports
the CLI as missing or unauthenticated, rerun the install and auth steps above.

## See Also

- [Extensions CLI reference](../reference/cli/extensions)
- [MCP servers concept](../concepts/mcp-servers)
