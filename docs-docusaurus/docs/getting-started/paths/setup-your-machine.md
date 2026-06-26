---
sidebar_position: 3
---

# Set Up Your Machine

Set up `drwn` once per machine. After this path you will have an installed CLI, a local store under `~/.agents/drwn`, a chosen set of machine-wide default skills and MCP servers, and a clean first write into the downstream tool config.

## Prerequisites

- Node 20+
- npm (for the published package) or Bun 1.2+ (for the checkout-mode workflow)

The published package runs from the built Node entrypoint. Checkout mode runs the TypeScript source through Bun; that is only needed when you want to edit `drwn` itself.

## Install

```bash
npm install -g darwinian-mind
drwn --version
```

## Confirm the install

`drwn status` summarizes the effective harness for the current directory. Outside any configured project it reflects machine state only.

```bash
drwn status
drwn status --json
```

You should see the resolved store path under `~/.agents/drwn`, the list of enabled targets (`claude`, `codex`, `cursor`), and counts for skills and MCP servers. If `store.initialized` is false, the first store-mutating command will initialize it; nothing is broken.

## Inspect the built-in inventory

The built-in library is the catalog of skills and MCP servers the packaged harness knows about. Listing it tells you what is available before you decide what to activate.

```bash
drwn library list
drwn library list skills
drwn library list mcp
```

Drill into a single entry to see what it does:

```bash
drwn library show <name>
```

## See current machine defaults

Machine defaults live in `~/.agents/drwn/machine.json`. On a fresh install the lists are empty.

```bash
drwn library defaults list
```

## Add machine-wide defaults

Decide which skills and MCP servers should be active across every project that does not override them. Skills go through `library defaults add skill`; MCP servers through `library defaults add mcp`:

```bash
drwn library defaults add skill <skill-name>
drwn library defaults add mcp <server-name>
```

For example, to make a code reviewer skill and the `context7` documentation MCP server part of every project by default:

```bash
drwn library defaults add skill reviewer
drwn library defaults add mcp context7
drwn library defaults list
```

You can remove a default the same way:

```bash
drwn library defaults remove skill <skill-name>
drwn library defaults remove mcp <server-name>
```

## Preview, then write

`drwn write --dry-run` shows the exact changes the write would make to `~/.claude`, `~/.codex`, and `~/.cursor`. Read it before running the unguarded write.

```bash
drwn write --dry-run
drwn write
```

## Verify

After the first write, confirm the downstream state matches:

```bash
drwn status
drwn doctor
ls ~/.claude/skills
ls ~/.codex/skills
```

`drwn doctor` is report-only — if anything looks wrong it tells you what without mutating. The downstream skill directories should contain symlinks for each of your curated and default skills.

## Cross-References

- [Local Store](../../concepts/local-store) for the layout under `~/.agents/drwn`
- [MCP Servers](../../concepts/mcp-servers) for how MCP server definitions flow through the layers
- [Override for One Project](./override-one-project) when one project needs a different effective harness
- [Reading Doctor](../../troubleshooting/reading-doctor) when the first write surfaces issues
