---
sidebar_position: 2
---

# Add

`drwn add` is the project-mutation surface for the three things a project pins: cards, skills, and MCP servers. Each subcommand edits `<project>/.agents/drwn/config.json` (and `card.lock` for cards) without touching machine-wide defaults.

## drwn add card

Append a card ref to the project and refresh `card.lock`.

```bash
drwn add card @your-handle/backend@^1.0.0
drwn add card @team/review --write
```

`add card` is an alias for `drwn card add`. It rejects duplicate card names so one project keeps a single constraint per card. Pass `--write` to chain `drwn write` after the config update.

See [Card commands](./card) for the full card lifecycle.

## drwn add skill

Add one skill to the current project overlay.

```bash
drwn add skill alpha
drwn add skill reviewer --dry-run
drwn add skill brainstorm --json
```

By default, `add skill` searches the local library first and adds the matching skill to `skills.include`. Guided mode prompts for a query when run in a TTY without arguments.

Restrict the lookup to local inventory:

```bash
drwn add skill alpha --library
```

Install an unambiguous catalog bundle and activate the matching skill:

```bash
drwn add skill hello --yes
```

`--yes` is required to fall through to the configured npm-skill catalog. The catalog search must return exactly one bundle, otherwise the command exits with an ambiguity error. Once the bundle is ingested into `~/.agents/drwn/skills/<package>/<version>/`, the requested skill is included in the project config.

Add every skill from a bundle by package name:

```bash
drwn add skill @acme/skill-bundle --yes --all
```

## drwn add mcp

Activate a known MCP server in the current project without mutating `~/.agents/drwn/machine.json`.

```bash
drwn add mcp context7
drwn add mcp github --yes
drwn add mcp context7 --dry-run
```

`add mcp` looks up the server in the local library first (built-in registry merged with `~/.agents/drwn/mcp-servers/`). If the server is already active by global default, the command is a safe no-op — no project override is written.

Restrict the lookup to local inventory:

```bash
drwn add mcp context7 --library
```

Accept an unambiguous match from a configured MCP catalog:

```bash
drwn add mcp github --yes
```

`--yes` is required to fall through to configured online MCP catalogs. The result must be unambiguous; required environment variables on the catalog server definition are surfaced in the command output.

## Common flags

- `--dry-run` previews the config change without writing
- `--json` emits a machine-readable payload describing what would change
- `--library` restricts the lookup to local inventory
- `--yes` accepts an unambiguous catalog result (skills and MCP only)

## Related

- [Search](./search) — discover candidates before adding
- [Write](./write) — materialize the new project overlay into downstream targets
- [Library](./library) — manage what is locally available to add
