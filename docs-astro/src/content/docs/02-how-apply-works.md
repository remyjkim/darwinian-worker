---
title: "How Write Works"
description: "How drwn resolves machine, project, card, and local-store state."
date: 2026-04-28
order: 2
---

## Scope Detection

`drwn write` first decides whether it is running in a configured project.
Discovery walks upward from the current directory for:

```text
<project>/.agents/bgng/config.json
```

That one decision controls both the effective state and the write destination.

## Machine-Scope Writes

Outside a configured project, effective state is:

```text
packaged defaults + local store inventory + ~/.agents/bgng/machine.json
```

Machine-scope writes materialize into:

```text
~/.claude/
~/.codex/
~/.cursor/
~/.agents/bgng/generated/
~/.agents/bgng/global-write-record.json
```

Use machine defaults when every project should inherit the same skill or MCP
server unless a project explicitly overrides it.

## Project-Scope Writes

Inside a configured project, effective state is:

```text
packaged defaults + local store inventory + cards in lockfile order + project overlay
```

Project-scope writes materialize into:

```text
<project>/.claude/
<project>/.codex/
<project>/.cursor/
<project>/.agents/bgng/generated/
<project>/.agents/bgng/write-record.json
```

Machine-only defaults from `~/.agents/bgng/machine.json` do not apply inside a
configured project. The project config, selected cards when present, and
explicit project overlay are the project source of truth.

## Cards And Lockfiles

A project selects cards in:

```text
<project>/.agents/bgng/config.json
```

`drwn apply`, `drwn card add`, `drwn card pin`, and `drwn card update` resolve
those refs into:

```text
<project>/.agents/bgng/card.lock
```

The lockfile records exact versions and integrity so repeated writes are
deterministic.

## Write Records

Write records let `drwn` distinguish paths it owns from user-owned state.

On the next write:

- drwn-owned paths that left the effective state are removed
- user-owned replacements are preserved and reported
- generated files are rewritten from the effective state

Use `--force` only when you intentionally want to overwrite drift inside
drwn-managed file regions.

## Running Write

Preview before writing:

```bash
drwn write --dry-run
```

Write everything:

```bash
drwn write
```

Run only one side when needed:

```bash
drwn write --mcp-only
drwn write --skills-only
```

Limit write to one target:

```bash
drwn write --target=claude
drwn mcp write --target=cursor
```

Resolve managed-field drift intentionally:

```bash
drwn write --force
```

## Usage Modes

### Packaged harness

Use the published package when you want the default config and CLI behavior:

```bash
npm install -g darwinian-harness
drwn write --dry-run
```

### Editable harness source

Use a checkout when you want to own the source of truth:

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-harness
drwn status
```

In checkout mode, edit:

- `registry/config.json` for target and optional-server toggles
- `registry/mcp-servers.json` for MCP server definitions
- `skills/` for built-in skill content
