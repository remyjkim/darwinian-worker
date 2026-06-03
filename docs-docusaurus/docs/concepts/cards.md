---
sidebar_position: 7
---

# Cards

Cards are versioned harness bundles. They can include skills, MCP server definitions, extension intent, target defaults, and manifest metadata that a project can consume with one ref.

The model separates authoring from consumption:

- card sources live under `~/.agents/drwn/sources/<scope>/<name>/` and are edited with `drwn card source`
- published cards live under `~/.agents/drwn/cards/@scope/name.git` with version tags
- projects consume cards through `.agents/drwn/config.json` and lock exact resolutions in `.agents/drwn/card.lock`

Common card commands:

```bash
drwn card new @me/backend --no-git
drwn card publish @me/backend
drwn card show @me/backend@1.0.0
drwn card validate @me/backend@1.0.0
drwn card diff @me/backend@1.0.0 @me/backend@1.1.0
drwn card deprecate @me/backend@1.0.0
```

Source authoring commands:

```bash
drwn card source list
drwn card source show @me/backend --json
drwn card source doctor @me/backend
drwn card source add-skill @me/backend reviewer
drwn card source remove-skill @me/backend reviewer --keep-files
drwn card source set @me/backend --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
drwn card source add-mcp @me/backend context7
drwn card source remove-mcp @me/backend context7 --keep-files
```

Consumption commands:

```bash
drwn apply @me/backend@^1.0.0
drwn card add @me/backend@^1.0.0
drwn card pin @me/backend@1.0.0
drwn card update
drwn update
drwn write --dry-run
```
