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

Every mutating consumer command accepts `--write` to chain into `drwn write` after the lock mutation succeeds:

```bash
drwn card add @me/backend@^1.0.0 --write
drwn card pin @me/backend@1.0.0 --write
drwn card remove @me/backend --write
drwn card update --write
drwn card detach --write
```

`drwn update` is a top-level alias for `drwn card update`.

List local cards:

```bash
drwn card list
drwn card list --json
```

Check for outdated locks in CI and pre-fetch origins:

```bash
drwn card outdated --check
drwn card outdated --fetch
drwn card outdated --check --json
```

`--check` exits non-zero when any locked card has a newer version available locally, which makes it suitable as a CI gate. `--fetch` runs `git fetch` against each card's origin before computing the diff so the check uses up-to-date tag listings.

Remote and catalog flows use Git refs. `drwn` delegates authentication to Git.

## Typical Source Authoring

The canonical authoring sequence from empty source to published card:

```bash
drwn card new @me/backend --no-git
drwn card source add-skill @me/backend reviewer
drwn card source add-mcp @me/backend context7
drwn card source set @me/backend \
  --description "Backend review harness" \
  --version 0.1.0 \
  --stability stable \
  --last-validated-with 0.1.0 \
  --test-status-badge https://example.com/status.svg
drwn card source doctor @me/backend
drwn card publish @me/backend
```

The quality fields (`--stability`, `--last-validated-with`, `--test-status-badge`) surface in `drwn card show` so consumers can see the maturity signal before applying a card.
