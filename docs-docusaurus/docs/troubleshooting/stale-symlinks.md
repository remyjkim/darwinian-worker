---
sidebar_position: 4
---

# Stale Symlinks

`drwn doctor` reports `staleSkillSymlinks` when an entry under `~/.claude/skills/` or `~/.codex/skills/` no longer corresponds to a skill in the resolved harness. The right next step depends on who owns the symlink.

## Drwn-owned vs user-owned

drwn writes a **write record** at `<projectRoot>/.agents/drwn/write-record.json` (or the global path when there is no project) listing every path it created on the last run, with a `kind` of `managed-directory`, `managed-content`, `managed-fields`, `symlink` (legacy), or `generated-symlink` (legacy). That ledger is the source of truth for ownership:

- **drwn-owned:** present in the write record. Cleaned up automatically on the next `drwn write` if the symlink is no longer desired, the link target on disk still matches what the record says it should be, and the link is in fact a symlink.
- **user-owned:** not in the write record, or in the record but pointing somewhere drwn does not recognize. Preserved on cleanup with a warning of the form `preserved user-owned path: <absolute-path>`.

This rule means a hand-installed link under `~/.claude/skills/<name>` will never be deleted by `drwn write` even if it has the same name as a managed skill. drwn refuses to guess; you decide.

## Diagnosing stale entries

```bash
drwn doctor
drwn doctor --json
```

`staleSkillSymlinks` lists absolute paths. Cross-reference against the write record to see whether each one is drwn-owned:

```bash
cat <projectRoot>/.agents/drwn/write-record.json
```

`managedPaths[].path` is relative to the project root (or the global scope for non-project runs). Anything present in that list is drwn-owned.

## Resolution

### drwn-owned stale links

Re-run `drwn write`. The cleanup pass in `cli/core/sync.ts` diffs the previous write record against the new managed-path set and removes entries that are no longer desired.

```bash
drwn write --dry-run
drwn write
```

If the link survives the next write, the underlying skill is still resolved somewhere. Use `drwn status --why skill:<name>` to find the layer and remove the inclusion there.

### user-owned stale links

drwn will keep emitting the warning every run. To remove the link, use the filesystem directly:

```bash
rm ~/.claude/skills/<name>
rm ~/.codex/skills/<name>
```

drwn never deletes user-owned content. If you want the link, leave it. If you do not, you remove it.

### Legacy-store orphans

Pre-Wave-1 stores left symlinks pointing at the old `~/.agents/drwn/cards/<version>/...` layout. The migration archives that layout under `~/.agents/drwn/drwn.archive-<timestamp>/`, but the downstream symlinks may still point at the archived paths.

These are technically drwn-owned (their targets fall under drwn-managed prefixes), but the write record from the new layout no longer mentions them. The migration path has a dedicated escape hatch:

```bash
drwn store migrate --cleanup-legacy-orphans --dry-run
drwn store migrate --cleanup-legacy-orphans
```

`cleanupLegacyOrphans` in `cli/core/migration.ts` walks `~/.claude/skills/` and `~/.codex/skills/`, removes symlinks whose targets fall under known drwn-owned legacy prefixes (`packages/`, the harness `skills/` source, the current store, the archive), and explicitly skips everything else. Non-owned symlinks are not candidates.

## Cross-References

- [Ownership and Write Records](../concepts/ownership-and-write-records) for the write-record schema and lifecycle
- [Reading Doctor](./reading-doctor) for the rest of the doctor categories
- [Common Drift](./common-drift) for related patterns (hand-edited settings, legacy store)
