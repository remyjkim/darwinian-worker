---
title: "Store And Migration"
description: "The cards-era local store layout and explicit migration path."
date: 2026-05-20
order: 11
---

## Store Layout

Cards-era `drwn` stores local user-managed inventory under:

```text
~/.agents/drwn/
|-- store.json
|-- machine.json
|-- cards/
|-- sources/
|-- skills/
|-- mcp-servers/
|-- generated/
|-- extracted/
|-- catalogs/
|-- catalogs.json
`-- global-write-record.json
```

| Path | Purpose |
|---|---|
| `store.json` | Store metadata and schema version |
| `machine.json` | Machine-scope overlay used outside configured projects |
| `cards/` | Per-card bare Git repositories |
| `sources/` | Editable card source directories |
| `skills/` | Package-backed skill bundles |
| `mcp-servers/` | User MCP server definitions, one JSON file per server |
| `generated/` | Machine-scope generated files such as Cursor MCP payloads |
| `extracted/` | Content-addressed card materializations keyed by Git tree SHA |
| `catalogs/` | Local clones of Git-backed card catalogs |
| `catalogs.json` | Registered card catalog index |
| `global-write-record.json` | Machine-scope materialization ownership record |

## Inspect Store State

```bash
drwn store status
drwn store status --json
```

Store status reports whether the cards-era store exists, its schema version,
inventory counts, and whether a pre-cards layout is still present.

## Migration

Store migration has two explicit steps:

| Source | Current path |
|---|---|
| Pre-cards library/packages layout | `~/.agents/drwn/` |
| Per-version card directories | `~/.agents/drwn/cards/<scope>/<name>.git/` |

Run migration explicitly:

```bash
drwn store migrate
drwn store migrate-to-git
```

For structured output:

```bash
drwn store migrate --json
drwn store migrate-to-git --json
```

For unattended migration:

```bash
drwn store migrate --yes
```

Migration stages the new layout, validates it, archives the old layout, then
activates `~/.agents/drwn`. Ordinary commands do not silently migrate state;
they warn when a pre-cards layout is detected.

## Project Write Records

Configured projects use their own write record:

```text
<project>/.agents/drwn/write-record.json
```

Machine-scope writes use:

```text
~/.agents/drwn/global-write-record.json
```

Write records let `drwn` remove old drwn-owned materialized paths while
preserving user-owned edits and replacements.
