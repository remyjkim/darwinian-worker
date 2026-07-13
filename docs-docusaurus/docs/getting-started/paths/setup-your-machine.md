---
sidebar_position: 3
---

# Set Up Your Machine

Set up `drwn` once per machine. After this path you will have an installed CLI, a local Store under `~/.agents/drwn`, explicit machine capability intent, and a reviewed first projection into downstream tool config.

## Prerequisites

- Bun 1.2+
- npm (for the published package and npm-backed skill bundles)
- Node.js (for optional MCP servers that spawn Node processes)

The published package and checkout mode both run the TypeScript CLI through Bun.

## Install

```bash
curl -fsSL https://bun.sh/install | bash
npm install -g darwinian
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

## Initialize Machine Intent

Prompt-free setup creates strict empty `drwn.machine` V1 intent:

```bash
drwn init --non-interactive
drwn library defaults list
```

Interactive `drwn init` offers the opt-out Recommended Darwinian Operator
profile. The immutable `@darwinian/operator@1.0.2` pin contributes 17 approved
machine-safe skills and zero MCP servers.

## Add Explicit Machine Capabilities

Decide which skills and MCP servers should be visible in machine sessions. Skills go through `library defaults add skill`; MCP servers through `library defaults add mcp`:

```bash
drwn library defaults add skill <skill-name>
drwn library defaults add mcp <server-name>
```

For example, to select a code reviewer skill and the `context7` documentation MCP server:

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

`drwn write --scope machine --dry-run` shows the exact changes the write would make to `~/.claude`, `~/.codex`, and `~/.cursor`. Read it before running the write.

```bash
drwn write --scope machine --dry-run
drwn write --scope machine
```

## Verify

After the first write, confirm the downstream state matches:

```bash
drwn status
drwn doctor
ls ~/.claude/skills
ls ~/.codex/skills
```

`drwn doctor` is report-only. It reports invalid capability IDs, missing or changed profile bytes, and projection ownership conflicts without repairing them. The downstream skill directories should contain copied skill directories for selected skills.

If a destination already exists without a matching global write-record entry,
the write fails with `MACHINE_PROJECTION_CONFLICT`. Do not use force to claim
it. Move, remove, or reconcile foreign state explicitly; force repairs only
drift in prior drwn-owned output.

## Cross-References

- [Local Store](../../concepts/local-store) for the layout under `~/.agents/drwn`
- [MCP Servers](../../concepts/mcp-servers) for how MCP server definitions flow through the layers
- [Override for One Project](./override-one-project) when one project needs a different effective harness
- [Reading Doctor](../../troubleshooting/reading-doctor) when the first write surfaces issues
