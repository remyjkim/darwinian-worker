---
sidebar_position: 5
---

# Author and Publish a Card

Cards let you package reusable harness intent, skills, MCP definitions, and metadata as a versioned unit. The authoring flow has three states:

- source: editable files under `~/.agents/drwn/sources/<scope>/<name>/`
- published card: immutable Git-backed releases under `~/.agents/drwn/cards`
- consumed card: a project ref in `.agents/drwn/config.json` plus a locked resolution in `.agents/drwn/card.lock`

Create a source:

```bash
drwn card new @your-handle/backend --no-git
drwn card source show @your-handle/backend
drwn card source doctor @your-handle/backend
```

Add local content before publishing:

```bash
drwn card source add-skill @your-handle/backend reviewer --from ./skills/reviewer
drwn card source add-mcp @your-handle/backend context7
drwn card source set @your-handle/backend --description "Backend review harness" --version 0.1.0
drwn card source set @your-handle/backend --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
```

Publish and inspect the release:

```bash
drwn card publish @your-handle/backend
drwn card show @your-handle/backend@0.1.0
drwn card validate @your-handle/backend@0.1.0
```

Use `DRWN_STORE_READONLY=1` when validating a store snapshot. Source inspection and dry runs continue to work, while commands that would mutate source files or publish releases fail before writing.
