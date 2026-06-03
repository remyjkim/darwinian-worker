---
sidebar_position: 10
---

# Card

`drwn card` manages harness cards from authoring through project consumption.

Author and publish:

```bash
drwn card new @me/backend --no-git
drwn card new backend --scope @me --from-project .
drwn card publish @me/backend
drwn card show @me/backend@1.0.0
drwn card validate @me/backend@1.0.0
drwn card diff @me/backend@1.0.0 @me/backend@1.1.0
drwn card deprecate @me/backend@1.0.0
```

Edit sources:

```bash
drwn card source list
drwn card source show @me/backend
drwn card source show @me/backend --json
drwn card source doctor
drwn card source doctor @me/backend
drwn card source add-skill @me/backend reviewer
drwn card source add-skill @me/backend reviewer --from ./skills/reviewer --force
drwn card source remove-skill @me/backend reviewer
drwn card source remove-skill @me/backend reviewer --keep-files
drwn card source set @me/backend --description "Backend review harness" --version 0.1.0
drwn card source set @me/backend --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
drwn card source add-mcp @me/backend context7
drwn card source add-mcp @me/backend context7 --from ./context7.json
drwn card source remove-mcp @me/backend context7
drwn card source remove-mcp @me/backend context7 --keep-files
```

Consume cards in a project:

```bash
drwn apply @me/backend@^1.0.0
drwn card apply @me/backend@^1.0.0 --write
drwn card add @me/backend@^1.0.0
drwn card pin @me/backend@1.0.0
drwn card remove @me/backend
drwn card detach
drwn card update
drwn card outdated
drwn card status --explain
```

Remote and catalog flows use Git refs. `drwn` delegates authentication to Git.
