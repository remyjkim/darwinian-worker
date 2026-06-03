---
sidebar_position: 4
---

# Write Record JSON

On disk:

- **Project scope** — `<project>/.agents/drwn/write-record.json` (`resolveProjectWriteRecordPath`, `cli/core/write-record.ts:19-21`)
- **Machine scope** — `~/.agents/drwn/global-write-record.json` (`cli/core/store-paths.ts:151`)

Purpose: the ledger of drwn-owned paths written by `drwn write`. Drives cleanup of stale managed paths and lets `doctor` report what drwn last wrote without guessing ownership. See [Ownership and Write Records](../../concepts/ownership-and-write-records) for the discipline this enforces.

## Type

`WriteRecord` (`cli/core/write-record.ts:7-17`).

## Example

```json
{
  "writeRecordVersion": 1,
  "lastWriteAt": "2026-06-02T14:32:11.402Z",
  "lastWriteHarnessVersion": "0.1.0",
  "managedPaths": [
    {
      "path": "/Users/me/.claude/skills/reviewer",
      "kind": "symlink",
      "target": "/Users/me/.agents/drwn/store/skills/reviewer"
    },
    {
      "path": "/Users/me/.claude/settings.json",
      "kind": "managed-fields",
      "fields": ["mcpServers"],
      "fieldHashes": {
        "mcpServers": "f3a1c0e8b2a4..."
      }
    },
    {
      "path": "/Users/me/.cursor/mcp.json",
      "kind": "generated-symlink",
      "generatedPath": "/Users/me/.agents/drwn/store/generated/cursor/mcp.json"
    }
  ]
}
```

## Top-Level Fields

| Field | Type | Required | Meaning | Enforced at |
|---|---|---|---|---|
| `writeRecordVersion` | literal `1` | yes | Schema version. `loadWriteRecord` returns `null` if anything else. | `cli/core/write-record.ts:29-30` |
| `lastWriteAt` | ISO-8601 string | yes | Timestamp of the most recent successful write. | Written at `cli/core/sync.ts:207-209` |
| `lastWriteHarnessVersion` | string | yes | drwn version string for the most recent write. | `cli/core/sync.ts:207-209` |
| `managedPaths` | `ManagedPath[]` | yes | The drwn-owned path ledger. Must be an array; otherwise the record is treated as missing. | `cli/core/write-record.ts:29-30` |

## ManagedPath Variants

`ManagedPath` is a discriminated union on `kind` (`cli/core/write-record.ts:14-17`). All variants share `path` (absolute on-disk path that drwn owns).

### `symlink`

```json
{ "path": "<absolute path>", "kind": "symlink", "target": "<absolute path>" }
```

A symlink drwn created. `target` is the path drwn expects it to point at — the next run verifies before removing on cleanup.

### `managed-fields`

```json
{
  "path": "<absolute path>",
  "kind": "managed-fields",
  "fields": ["mcpServers"],
  "fieldHashes": { "mcpServers": "<sha256 hex>" }
}
```

A user-owned config file (Claude `settings.json`, Codex `config.toml`) where drwn manages specific top-level keys. `fields` names the keys drwn owns; `fieldHashes` carries the canonical hash of each managed key as drwn last wrote it. Drift detection compares these hashes against the in-file `_drwn` meta block on the next write — see [Ownership and Write Records](../../concepts/ownership-and-write-records#the-_drwn-meta-block-as-a-cross-file-ledger).

### `generated-symlink`

```json
{ "path": "<absolute path>", "kind": "generated-symlink", "generatedPath": "<absolute path>" }
```

A symlink that points at a drwn-generated file (Cursor's standalone `mcp.json`). `generatedPath` is the drwn-owned target inside the store. Cleanup verifies the link still resolves to that path.

## Atomic Save

`saveWriteRecord` (`cli/core/write-record.ts:38-55`) persists the record with a four-step discipline so an interrupted write never leaves the ledger torn:

1. Write to `<record>.tmp`.
2. `fsync` the temp file descriptor.
3. `rename` to the final path.
4. `fsync` the parent directory.

If the process dies before step 3, the old record remains intact and the next run still knows what drwn previously owned.

## Reader Locations

| Reader | What it does |
|---|---|
| `cli/core/write-record.ts:23-36` (`loadWriteRecord`) | Parses, validates `writeRecordVersion === 1` and `Array.isArray(managedPaths)`, returns `null` on any failure |
| `cli/core/sync.ts:207-209` | Writes a fresh record at the end of every `drwn write` |
| `cli/core/diagnostics.ts:175-176` | Surfaces `lastWriteAt` and `lastWriteHarnessVersion` in `doctor` output |
| `cli/core/write-record.ts:57-79` (`diffWriteRecord`) | Computes `toRemove` / `toAdd` / `toVerify` against the previous record |

## Related

- [Ownership and Write Records](../../concepts/ownership-and-write-records) — the ownership discipline that consumes this file
- [Materialization](../../concepts/materialization) — the write pipeline that produces these records
- [Diagnostics Model](../../concepts/diagnostics-model) — how `doctor` reads the record
