---
sidebar_position: 4
---

# Machine Inventory

Machine inventory is reusable content owned by `drwn`, not active runtime
state. First-class mutable inventory consists only of drwn-managed standalone
skill packages and standalone MCP records. Repository skills and bundled
registry MCP definitions are immutable discovery inputs. Card-owned copies are
owned by their Card source and are outside standalone lifecycle commands.

New inventory remains inactive until a machine or project explicitly selects
it. Skill install, update, and uninstall are package-scoped: each operation
reports every exported skill ID and known machine or project reference.

## Skills

```bash
drwn machine skill list
drwn machine skill show <skill-id>
drwn machine skill show --package <package-name>
drwn machine skill references <skill-id> --project <root> --json
drwn machine skill references --package <package-name> --json
drwn machine skill install <package-spec|SKILL.md|skill-dir> --dry-run
drwn machine skill update <package-name> --from <source> --dry-run
drwn machine skill uninstall <package-name> --dry-run
drwn machine skill enable <skill-id>
drwn machine skill disable <skill-id>
```

Package versions are immutable package versions stored under
`~/.agents/drwn/skills/<package>/<version>`. `current` is a flushed regular
pointer file changed atomically. Update compares complete-tree digests before
changing that pointer. Uninstall is blocked while any declared reference exists;
there is no force option that knowingly leaves unresolved intent.

## MCP Records

```bash
drwn machine mcp list
drwn machine mcp show <server-id>
drwn machine mcp references <server-id> --project <root> --json
drwn machine mcp add <file> --as <server-id> --dry-run
drwn machine mcp update <server-id> --from <file> --dry-run
drwn machine mcp remove <server-id> --dry-run
drwn machine mcp enable <server-id>
drwn machine mcp disable <server-id>
```

Standalone definitions use record-level atomic persistence. Stored `env` and
header values must remain secret references such as `${TOKEN}`, never resolved
credential values. Bundled registry definitions cannot be updated or removed
through these commands.

## References And Locking

Reference reports cover explicit machine intent plus valid registered and
explicitly supplied project roots. Use repeated `--project` flags to widen the
declared scan scope. Invalid registered roots fail closed. Repair a stale
registration explicitly:

```bash
drwn projects unregister /absolute/stale/root --dry-run
drwn projects unregister /absolute/stale/root
```

Reference-sensitive mutations follow the global lock order
`inventory -> machine -> project`. Network and source staging happen before the
inventory lock; identity, digests, uniqueness, and references are revalidated
under it.

## Portable Transfer

```bash
drwn machine inventory export --output ./inventory.json --json
drwn machine inventory bundle --output ./inventory.tar.gz --json
drwn machine inventory verify --from ./inventory.tar.gz --json
drwn machine inventory sync --from ./inventory.tar.gz --dry-run --json
drwn machine inventory sync --from ./inventory.tar.gz --json
```

`export` writes a canonical V1 metadata manifest. `bundle` embeds those exact
manifest bytes with only active standalone package and MCP payloads in a
deterministic gzip tar. Neither command reads Cards, machine intent, project
state, credentials, generated state, inactive versions, or other Store data.

`verify` is read-only and exits zero only for an exact match. Missing,
conflicting, and extra entries are reported as drift. `sync` accepts only a
fully validated bundle, blocks all known conflicts, and installs only missing
entries. Identical entries are no-ops, extras are preserved, and nothing is
activated. `--dry-run` creates no managed state. A fresh real sync creates
`store.json` and standalone inventory directories but no `machine.json`.

This transfer is not a backup or restore. Deterministic SHA-256 values detect
corruption, but a checksum is not authenticity. Skill-content screening for
known sensitive environment values, private-key markers, and high-risk
filenames is a source-content safeguard, not a general secret detector. Review
an artifact before sharing or trusting it.

## Garbage Collection

```bash
drwn machine inventory gc --json
drwn machine inventory gc --prune --json
```

GC is a dry-run by default. It may prune only abandoned temporaries, completed
tombstones, and sufficiently old inactive package versions. Current packages
and MCP records are never garbage merely because known references are zero.
Interrupted explicit removal uses validated tombstone recovery.

Whole-Store archive creation is unavailable. The remote deploy payload remains
a separate allowlisted Card-closure format. Portable transfer is built from
typed standalone records and must not archive `~/.agents/drwn` wholesale.
