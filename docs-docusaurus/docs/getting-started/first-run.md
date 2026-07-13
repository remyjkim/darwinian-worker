---
sidebar_position: 2
---

# First Run

The recommended first-run sequence inspects state before mutating it. Every step is non-destructive until the final `drwn write`.

## Inspect before writing

```bash
drwn status
drwn machine skill list
drwn mcp list
drwn write --dry-run
```

That gives you:

- a system overview
- the current skill inventory
- the active MCP inventory
- a planned-change preview

## Write the generated state

If the dry run looks right:

```bash
drwn write
```

`drwn write` is the primary one-way materialization command. It reads global config, project config, card locks, and local inventory, then writes effective state into downstream tools.

`drwn` is conservative on write:

- write is non-destructive by default
- drwn-owned stale materialization is cleaned up through write records
- user-owned stale state is reported, not silently removed

## Project-local overrides

If you want overrides for a single project instead of changing your machine-wide config, scaffold a project config first:

```bash
cd /path/to/project
drwn init
drwn status
drwn write --dry-run
```

`drwn init` creates `<project>/.agents/drwn/config.json` and switches subsequent `drwn write` runs into project-local materialization under `<project>/.claude`, `<project>/.codex`, and `<project>/.cursor`.

## Next

- For a deeper conceptual picture, read [The Layered Model](../concepts/layered-model).
- For task-specific entry points, see [Choose Your Path](./paths/overview).
