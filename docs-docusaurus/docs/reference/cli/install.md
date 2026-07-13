---
sidebar_position: 19
---

# Install

`drwn install` bootstraps a project by fetching all cards declared in `card.lock` into the local store, then writing effective project state. It is the standard first command after cloning a project.

## Basic usage

```bash
drwn install
```

Reads `.agents/drwn/card.lock`, ensures every locked card is present in the local Git-backed store, then runs the same write pipeline as `drwn write` to materialize skills, MCP servers, and Cursor config.

If no `card.lock` is found, `drwn install` exits with an error and suggests `drwn apply` instead.

## Flags

| Flag | Description |
|---|---|
| `--frozen` | Fail instead of cloning, fetching, or modifying `card.lock`. Exits non-zero if any card needs to be fetched or if the lockfile would be updated. |
| `--no-write` | Fetch and verify Cards without writing downstream files. Reports Card count and lock status; does not run `drwn write`. |
| `--json` | Emit machine-readable JSON output. |

## Examples

```bash
# Typical first run after cloning
drwn install

# CI: fail if lock is stale or any card needs fetching
drwn install --frozen

# Resolve cards without writing downstream config
drwn install --no-write

# Machine-readable output
drwn install --json
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All Cards fetched; downstream state written (or skipped with `--no-write`). |
| `1` | One or more cards failed to fetch; errors reported per card. Also exits 1 when `--frozen` would require a clone, fetch, or lockfile update. |

## JSON output schema

```json
{
  "ok": true,
  "cards": 3,
  "applied": true,
  "lockfileChanged": false
}
```

With `--no-write`, `applied` is `false`. On failure, `ok` is `false` and the response includes `"errors": [{ "card": "...", "message": "..." }]`.

## Difference from `drwn write`

`drwn install` = fetch missing cards from lock **+** write downstream state.

`drwn write` = write downstream state only (cards must already be present in the store).

Use `drwn install` when you've just cloned a repo or when any card may not be present locally. Use `drwn write` for applying config changes when all cards are already in the store.

## See also

- [Run drwn doctor in CI](../../guides/doctor-in-ci) — CI workflow using `drwn install --frozen`
- [Card Spec](../specs/card-spec) — card.lock format
- [`drwn write`](./write) — write-only pipeline
