---
sidebar_position: 2
---

# Ownership and Write Records

`drwn` does not own every file under `~/.claude`, `~/.codex`, or `~/.cursor`. It owns the paths it explicitly recorded as managed, and it preserves anything else. The write record is the ledger that makes that boundary explicit. This page covers where the records live, the three managed-path variants, and the cleanup discipline that follows from them.

## Where Records Live

Each `drwn write` run persists a JSON write record. The location depends on write scope:

- **Project writes** record at `<project>/.agents/drwn/write-record.json`
- **Machine writes** record at `~/.agents/drwn/global-write-record.json`

`buildEffectiveState` picks the right path based on whether a project overlay was discovered. The record persists across runs; the next write loads it to know what to clean up.

## The Three ManagedPath Variants

Every managed path is recorded as one of three variants matching the [materialization mechanisms](./materialization):

- **`symlink`** — a downstream skill directory link. Records the path and its expected `target`.
- **`managed-fields`** — a user-owned config file where drwn manages specific keys. Records the path, the managed field names, and their canonical hashes.
- **`generated-symlink`** — a symlink pointing at a drwn-generated file. Records the path and the `generatedPath` it should resolve to.

The record shape:

```json
{
  "writeRecordVersion": 1,
  "lastWriteAt": "...",
  "lastWriteHarnessVersion": "...",
  "managedPaths": [
    { "path": "...", "kind": "symlink", "target": "..." },
    { "path": "...", "kind": "managed-fields", "fields": ["mcpServers"], "fieldHashes": {} },
    { "path": "...", "kind": "generated-symlink", "generatedPath": "..." }
  ]
}
```

## The drwn-Owns-This-Path Discipline

Every write run diffs the previous record's managed paths against the current desired set. Paths that were managed last time but are no longer desired are candidates for cleanup. The cleanup rule is:

- If the current on-disk entry still looks like the recorded drwn-owned shape (the symlink still points where drwn put it, the generated file still exists where drwn put it), drwn removes it.
- If the entry has been replaced by something the user owns — a regular file in place of a symlink, a symlink pointing somewhere else, a different generated file — drwn **preserves it** and emits a `preserved user-owned path:` warning.

This is the load-bearing invariant: drwn never deletes content it does not provably own. A user who replaces a managed symlink with their own file keeps that file across `drwn write` runs.

See [troubleshooting/ownership-conflicts](../troubleshooting/ownership-conflicts) for how to resolve preservation warnings.

## Atomic Save

The write record itself is persisted atomically to survive interrupted writes:

1. Write to `<record>.tmp`
2. `fsync` the file descriptor
3. `rename` to the final path
4. `fsync` the parent directory

If the process dies mid-write, the old record remains intact and the next run still knows what drwn previously owned.

## The `_drwn` Meta Block as a Cross-File Ledger

Two of the three managed-path variants record only the path. The `managed-fields` variant is different: drwn also writes a `_drwn` meta block **into** the managed file itself, recording which keys it manages and their canonical hashes.

Claude `settings.json` and Codex `config.toml` both carry this block. It serves two purposes:

- **Drift detection.** On the next write, drwn reads the in-file block, recomputes the hash of each managed key, and aborts the merge if any hash diverges (unless `--force`). The user has touched a drwn-managed key, and drwn refuses to clobber that change silently.
- **Cross-file ledger.** The write record points at the file, but the file itself carries the field-level ground truth. If the write record is lost or corrupted, the in-file block still tells drwn which keys it owns.

Cursor's standalone JSON format means drwn owns the whole file via the generated-file-plus-symlink mechanism, so the meta-block protocol is unnecessary there.

## Cross-References

- [Materialization](./materialization) for the write pipeline that produces these records
- [Diagnostics Model](./diagnostics-model) for how `doctor` reads the records and reports drift
- [troubleshooting/ownership-conflicts](../troubleshooting/ownership-conflicts) for resolving preserved-path warnings
