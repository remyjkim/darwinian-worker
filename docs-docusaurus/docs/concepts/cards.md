---
sidebar_position: 7
---

# Cards

Cards are versioned harness bundles. They can include skills, MCP server definitions, extension intent, target defaults, and manifest metadata that a project can consume with one ref.

The model separates authoring from consumption:

- card sources live under `~/.agents/drwn/sources/<scope>/<name>/` and are edited with `drwn card source`
- published cards live under `~/.agents/drwn/cards/@scope/name.git` with version tags
- projects consume cards through `.agents/drwn/config.json` and lock exact resolutions in `.agents/drwn/card.lock`

Card MCP definitions become definition sources for consuming projects. Optional card MCPs stay inactive until the project enables them, so a card can advertise a credentialed or heavyweight capability without silently changing the user's live agent config.

Common card commands:

```bash
drwn card new @your-handle/backend --no-git
drwn card publish @your-handle/backend
drwn card show @your-handle/backend@1.0.0
drwn card validate @your-handle/backend@1.0.0
drwn card diff @your-handle/backend@1.0.0 @your-handle/backend@1.1.0
drwn card deprecate @your-handle/backend@1.0.0
```

Source authoring commands:

```bash
drwn card source list
drwn card source show @your-handle/backend --json
drwn card source doctor @your-handle/backend
drwn card source add-skill @your-handle/backend reviewer
drwn card source remove-skill @your-handle/backend reviewer --keep-files
drwn card source set @your-handle/backend --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
drwn card source add-mcp @your-handle/backend context7
drwn card source remove-mcp @your-handle/backend context7 --keep-files
```

Project root commands:

```bash
drwn apply @your-handle/backend@^1.0.0
drwn add @your-handle/backend@^1.0.0
drwn pin @your-handle/backend@1.0.0
drwn update
drwn use @your-handle/backend
drwn write --dry-run
```
