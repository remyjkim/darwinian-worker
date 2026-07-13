---
sidebar_position: 2
---

# Add

`drwn add` is the project-mutation surface for Worker roots, skills, and MCP servers. Each path edits `<project>/.agents/drwn/config.json` (and `card.lock` for roots) without touching machine intent.

## drwn add &lt;root-ref&gt;

Append one plain Card or Blueprint Worker root and refresh the complete lock graph.

```bash
drwn add @your-handle/backend@^1.0.0
drwn add @team/review --write
```

The first root is selected explicitly. Later roots are installed alternatives and do not contribute capabilities until selected with `drwn use`. Blueprint members are closure Cards, not additional roots. Pass `--write` to chain `drwn write` after the config/lock transaction.

See [Card commands](./card) for the full card lifecycle.

## drwn add skill

Add one skill to the current project overlay.

```bash
drwn add skill alpha
drwn add skill reviewer --dry-run
drwn add skill brainstorm --json
```

By default, `add skill` searches the standalone inventory first and adds the matching skill to `skills.include`. Guided mode prompts for a query when run in a TTY without arguments.

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

`add mcp` looks up the server in project-valid definitions first (built-ins, selected closure Cards, and `~/.agents/drwn/mcp-servers/`). Project intent is explicit even when the same ID is active in machine scope.

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
- [Machine inventory](./machine) — manage what is locally available to add
