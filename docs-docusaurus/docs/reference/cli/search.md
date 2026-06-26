---
sidebar_position: 3
---

# Search

`drwn search` is the read-only discovery surface for the three asset kinds drwn pins: skills, MCP servers, and cards. Each subcommand draws from a different source set.

## drwn search skill

Search the local skill library and configured npm-skill catalogs.

```bash
drwn search skill debug
drwn search skill brainstorm --catalog
drwn search skill alpha --library
drwn search skill research --json
```

Results are grouped by source — `Local library` (what you already have) and `Online catalogs` (what you could install through `drwn add skill --yes` or `drwn library add skill`).

`--library` and `--catalog` are mutually exclusive. Pass one to restrict to a single source group.

The catalog source is `catalogs.npmSkills` from the effective config; it is enabled by default and performs `npm search` with `searchLimit` 20.

## drwn search mcp

Search the local MCP library and configured trusted MCP catalogs.

```bash
drwn search mcp github
drwn search mcp postgres --json
drwn search mcp slack --catalog
drwn search mcp context7 --library
```

The local source is the built-in `registry/mcp-servers.json` merged with user-registered servers under `~/.agents/drwn/mcp-servers/`. The catalog source is `catalogs.mcp` from the effective config — file-backed catalogs only; URL-backed entries currently emit a warning.

`--library` and `--catalog` are mutually exclusive.

## drwn search card

Search registered Git-backed card catalogs.

```bash
drwn search card backend
drwn search card backend --scope @team
drwn search card backend --json
```

Card search reads `catalog.json` entries inside catalogs registered via `drwn library catalog add`. `drwn init` registers the Curation Labs `@community` catalog (`https://github.com/curation-labs/dm-cards-catalog-v1.git`) unless `--no-default-catalogs` is passed. Producers add entries with `drwn card catalog publish <cardRef> --catalog <scope|git-url|path> --mode <local|direct>`.

`--scope` limits results to a single catalog scope (e.g. `@team`).

Unlike skill and MCP search, card search has no `--library`/`--catalog` split: card catalogs are the only source.

## Common flags

- `--json` emits machine-readable output for every search subcommand
- `--library` / `--catalog` restrict the source on `search skill` and `search mcp`
- `--scope` filters card search to one catalog scope

## Related

- [Add](./add) — add the result of a search to the current project
- [Library](./library) — list everything available locally without search
