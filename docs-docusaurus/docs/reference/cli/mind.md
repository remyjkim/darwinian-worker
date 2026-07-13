---
sidebar_position: 13
---

# Worker Mind

`drwn worker mind` manages DB-backed Mind content for the selected project Worker closure.

## Commands

```bash
drwn worker mind provision [--mind-id <id>] [--json]
drwn worker mind status [--mind-id <id>] [--json]
drwn worker mind doctor [--mind-id <id>] [--json]
drwn worker mind sync [--mind-id <id>] [--dry-run] [--force] [--json]
drwn worker mind diff [--mind-id <id>] [--json]
drwn worker mind checkpoint [--mind-id <id>] [--json]
drwn worker mind pool retire <path> --yes
```

The Mind ID comes from `--mind-id` or `BGDB_PATH_PREFIX=minds/<id>`.

## Source Order

The adapter loads the selected root then its ordered member Cards. Provisioned `mind.json` records one `worker` and ordered `cards`, each with version/integrity provenance.

## Safety

- Provision is create-once and idempotent.
- Sync preserves DB edits unless `--force` is explicit.
- Checkpoint requires provenance and local Card sources.
- Tokens remain in runtime environment/bindings, not project state.
- No selected Worker fails before DB writes.

## Related

- [Minds](../../concepts/minds)
- [Managing Minds](../../guides/managing-minds)
