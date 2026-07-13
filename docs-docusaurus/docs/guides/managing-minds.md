---
sidebar_position: 11
---

# Managing Minds

## Select A Worker

Mind operations require one selected project Worker:

```bash
drwn apply @team/operator@^1.0.0
drwn use @team/operator --no-write
```

A Blueprint root contributes its root Card followed by ordered members. There is no separate Mind selection surface.

## Configure BeginningDB

Provide binding coordinates through deployment binding state or environment:

```bash
export BGDB_BASE_URL=<url>
export BGDB_TOKEN=<token>
export BGDB_PATH_PREFIX=minds/<mind-id>
```

Tokens remain operator state and are never stored in project config/lock.

## Provision

```bash
drwn worker mind provision
drwn worker mind provision --mind-id <mind-id> --json
```

Provision is idempotent. Once `mind.json` exists, rerunning provision does not overwrite live state.

## Inspect Drift

```bash
drwn worker mind status --json
drwn worker mind doctor --json
drwn worker mind diff --json
```

Drift states distinguish in-sync content, DB edits, newer Card content, and missing files.

## Sync

```bash
drwn worker mind sync --dry-run --json
drwn worker mind sync
drwn worker mind sync --force
```

Normal sync preserves DB-edited files. `--force` makes Card content win for seeded files after deliberate review.

## Checkpoint

```bash
drwn worker mind checkpoint --json
```

Checkpoint writes DB edits into local Card source persona/belief files. Review, version, and publish those source changes. Unattributed persona content fails closed.

## Pool Retirement

```bash
drwn worker mind pool retire <pool-path> --yes
```

Retirement is destructive and requires explicit confirmation.

## Related

- [Minds](../concepts/minds)
- [Beliefs, Personas, and Memory](../concepts/beliefs-memories-personas)
- [Mind CLI](../reference/cli/mind)
