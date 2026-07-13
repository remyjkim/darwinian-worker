---
sidebar_position: 4
---

# Library

`drwn library` manages reusable local inventory and card catalog registrations.

List and inspect local inventory:

```bash
drwn library list
drwn library list skills
drwn library list mcp
drwn library show <id>
```

Install reusable skill bundles and MCP definitions into the local store:

```bash
drwn library add skill <npm-package-or-local-path>
drwn library add mcp ./server.json --as <server-id>
```

These commands make inventory available. They do not activate it in a project; use `drwn add skill <name>` or `drwn add mcp <server-id>` from a project when you want to select it.

## Card Catalogs

Card catalogs are Git repositories with a root `catalog.json`. Register a catalog locally before searching it:

```bash
drwn library catalog add https://github.com/curation-labs/dm-cards-catalog-v1.git
drwn library catalog add <catalog-git-url>
drwn library catalog list
drwn library catalog refresh
drwn library catalog refresh @community
drwn library catalog remove @community
drwn library catalog remove <catalog-git-url>
```

`drwn library catalog add` clones the catalog, reads its manifest scope, and records the registration in `~/.agents/drwn/catalogs.json`. `drwn init` pre-registers the Curation Labs `@community` catalog unless `--no-default-catalogs` is passed. `drwn search card <query>` searches registered catalog clones.

Producers add entries to a catalog with:

```bash
drwn card catalog publish @team/backend@1.0.0 --catalog @team --mode direct
```

`--mode direct` commits and pushes the catalog entry. `--mode local` updates a local catalog checkout without committing.

## Machine Selections

The `defaults` command group promotes available Library items into explicit machine capability selections:

```bash
drwn library defaults list
drwn library defaults add skill <skill-name>
drwn library defaults remove skill <skill-name>
drwn library defaults add mcp <server-id>
drwn library defaults remove mcp <server-id>
```

Selections are written under `capabilities.skills` and
`capabilities.mcpServers` in strict `drwn.machine` V1. These commands do not
project target files. Use `drwn write --scope machine` separately. Project-local
selections should use `drwn add ...` instead.

Profile capabilities are attributed first and deduplicated against explicit
selections. Removing an explicit overlap does not remove the capability supplied
by the selected profile.
