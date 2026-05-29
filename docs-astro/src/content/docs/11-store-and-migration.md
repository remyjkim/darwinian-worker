---
title: "Store And Migration"
description: "The cards-era local store layout and explicit migration path."
date: 2026-05-20
order: 11
---

## Store Layout

Cards-era `drwn` stores local user-managed inventory under:

```text
~/.agents/bgng/
|-- store.json
|-- machine.json
|-- cards/
|-- sources/
|-- skills/
|-- mcp-servers/
|-- generated/
|-- cache/
`-- global-write-record.json
```

| Path | Purpose |
|---|---|
| `store.json` | Store metadata and schema version |
| `machine.json` | Machine-scope overlay used outside configured projects |
| `cards/` | Immutable published Harness Card versions |
| `sources/` | Editable card source directories |
| `skills/` | Package-backed skill bundles |
| `mcp-servers/` | User MCP server definitions, one JSON file per server |
| `generated/` | Machine-scope generated files such as Cursor MCP payloads |
| `global-write-record.json` | Machine-scope materialization ownership record |

## Inspect Store State

```bash
drwn store status
drwn store status --json
```

Store status reports whether the cards-era store exists, its schema version,
inventory counts, and whether a pre-cards layout is still present.

## Migration

Pre-cards versions used several paths:

| Legacy path | Cards-era path |
|---|---|
| `~/.agents/bgng/config.json` | `~/.agents/bgng/machine.json` |
| `~/.agents/library/mcp-servers.json` | `~/.agents/bgng/mcp-servers/<id>.json` |
| `~/.agents/packages/skills/` | `~/.agents/bgng/skills/` |

Run migration explicitly:

```bash
drwn store migrate
```

For structured output:

```bash
drwn store migrate --json
```

For unattended migration:

```bash
drwn store migrate --yes
```

Migration stages the new layout, validates it, archives the old layout, then
activates `~/.agents/bgng`. Ordinary commands do not silently migrate state;
they warn when a pre-cards layout is detected.

## Legacy Orphan Cleanup

After migration, old global downstream skill symlinks may still point into the
legacy or archived store. Clean up drwn-owned legacy orphans explicitly:

```bash
drwn store migrate --cleanup-legacy-orphans
drwn store migrate --cleanup-legacy-orphans --yes
```

Cleanup removes only symlinks whose targets are recognized as drwn-owned legacy
paths. User-owned replacements and unrelated paths are preserved.

## Project Write Records

Configured projects use their own write record:

```text
<project>/.agents/bgng/write-record.json
```

Machine-scope writes use:

```text
~/.agents/bgng/global-write-record.json
```

Write records let `drwn` remove old drwn-owned materialized paths while
preserving user-owned edits and replacements.
