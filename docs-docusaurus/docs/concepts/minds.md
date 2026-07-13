---
sidebar_position: 11
---

# Minds

A Mind is DB-backed persona, belief, and memory state seeded from the project's selected Worker closure.

Cards may declare:

- persona entries;
- belief entries;
- memory layer formats;
- hook policies that observe or govern runtime behavior.

The project does not select Mind Cards separately. `activeWorker` selects one root, and the Mind adapter loads that root followed by its ordered Blueprint members. Inactive alternative roots do not contribute Mind content.

## Provisioned Index

`mind.json` records one `worker` provenance object and ordered `cards` provenance, plus persona/belief indexes, memory shape, and a seeded-file ETag ledger.

Provisioning rejects a project with no selected Worker. Later Card updates flow through sync rather than reseeding.

## Runtime Flow

```bash
drwn worker mind provision --mind-id <id>
drwn worker mind status --mind-id <id> --json
drwn worker mind sync --mind-id <id>
drwn worker mind diff --mind-id <id> --json
drwn worker mind checkpoint --mind-id <id> --json
```

- Provision creates fenced persona sections, belief files, memory directories, and the index.
- Status compares Card versions and live ETags.
- Sync rebases clean seeded content while preserving DB edits unless forced.
- Diff reports entry-level changes and unattributed persona text.
- Checkpoint writes attributable DB edits back to editable Card sources for review.

## Provenance

Persona fences name the owning Card and entry. Beliefs have Card-scoped paths. Checkpoint refuses content outside provenance fences because it cannot safely choose a source.

## Related

- [Beliefs, Personas, and Memory](./beliefs-memories-personas)
- [Managing Minds](../guides/managing-minds)
- [Mind CLI](../reference/cli/mind)
