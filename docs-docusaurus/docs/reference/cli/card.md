---
sidebar_position: 10
---

# Card

`drwn card` manages mind cards from authoring through project consumption.

Author and publish:

```bash
drwn card new @your-handle/backend --no-git
drwn card new backend --scope @your-handle --from-project .
drwn card publish @your-handle/backend
drwn card catalog publish @your-handle/backend@1.0.0 --catalog @your-handle --mode direct
drwn card show @your-handle/backend@1.0.0
drwn card validate @your-handle/backend@1.0.0
drwn card diff @your-handle/backend@1.0.0 @your-handle/backend@1.1.0
drwn card deprecate @your-handle/backend@1.0.0
```

Edit sources:

```bash
drwn card source list
drwn card source show @your-handle/backend
drwn card source show @your-handle/backend --json
drwn card source doctor
drwn card source doctor @your-handle/backend
drwn card source add-skill @your-handle/backend reviewer
drwn card source add-skill @your-handle/backend reviewer --from ./skills/reviewer --force
drwn card source remove-skill @your-handle/backend reviewer
drwn card source remove-skill @your-handle/backend reviewer --keep-files
drwn card source set @your-handle/backend --description "Backend review harness" --version 0.1.0
drwn card source set @your-handle/backend --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
drwn card source add-mcp @your-handle/backend context7
drwn card source add-mcp @your-handle/backend context7 --from ./context7.json
drwn card source remove-mcp @your-handle/backend context7
drwn card source remove-mcp @your-handle/backend context7 --keep-files
```

Consume cards in a project:

```bash
drwn apply @your-handle/backend@^1.0.0
drwn card apply @your-handle/backend@^1.0.0 --write
drwn card add @your-handle/backend@^1.0.0
drwn card pin @your-handle/backend@1.0.0
drwn card remove @your-handle/backend
drwn card detach
drwn card update
drwn card outdated
drwn card status --explain
```

Every mutating consumer command accepts `--write` to chain into `drwn write` after the lock mutation succeeds:

```bash
drwn card add @your-handle/backend@^1.0.0 --write
drwn card pin @your-handle/backend@1.0.0 --write
drwn card remove @your-handle/backend --write
drwn card update --write
drwn card detach --write
```

`drwn update` is a top-level alias for `drwn card update`.

If a consumed card declares optional MCP servers, `--write` output reports whether each one is active, skipped, or shadowed by a different active definition. Skipped optional MCPs are not materialized until the project opts in:

```bash
drwn add mcp <server-name>
drwn write --dry-run
```

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

Publish to a card catalog after the card has been pushed to an installable Git remote:

```bash
drwn card remote add @team/backend <card-git-url>
drwn card push @team/backend
drwn library catalog add <catalog-git-url>
drwn card catalog publish @team/backend@1.0.0 --catalog @team --mode direct --tag backend --json
drwn search card backend --scope @team
```

`drwn card catalog publish` accepts a store card ref or Git-origin card ref.
`--catalog` can be a registered scope such as `@team`, a catalog Git URL, or a
local catalog checkout path. `--mode local` updates `catalog.json` only; it does
not commit or push. `--mode direct` requires a clean catalog worktree, commits
the `catalog.json` change, pushes the current branch, and refreshes a registered
catalog cache when possible.

Use `--dry-run --json` to validate the card ref, entry URL, catalog schema, and
duplicate-entry behavior before writing. Existing entries require `--replace`
unless the generated payload is already identical.

## Hook Consent

When a locked card declares hook policies, `drwn write` will not materialize hooks until consent is explicitly recorded. `drwn doctor` surfaces this as `hookIssues`.

Review and grant consent:

```bash
drwn card trust @your-handle/backend --hooks
```

By default, consent covers `^<locked-version>`. Override with `--range`:

```bash
drwn card trust @your-handle/backend --hooks --range "^1.0.0"
```

Revoke consent:

```bash
drwn card untrust @your-handle/backend
```

Preview what hooks a card declares without granting consent:

```bash
drwn card audit
```

`drwn card audit` is a v1.1 placeholder — it makes the planned command discoverable but does not yet produce a diff output.

## Typical Source Authoring

The canonical authoring sequence from empty source to published card:

```bash
drwn card new @your-handle/backend --no-git
drwn card source add-skill @your-handle/backend reviewer
drwn card source add-mcp @your-handle/backend context7
drwn card source set @your-handle/backend \
  --description "Backend review harness" \
  --version 0.1.0 \
  --stability stable \
  --last-validated-with 0.1.0 \
  --test-status-badge https://example.com/status.svg
drwn card source doctor @your-handle/backend
drwn card publish @your-handle/backend
```

The quality fields (`--stability`, `--last-validated-with`, `--test-status-badge`) surface in `drwn card show` so consumers can see the maturity signal before applying a card.
