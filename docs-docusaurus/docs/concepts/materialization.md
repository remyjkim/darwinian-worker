---
sidebar_position: 7
---

# Materialization

Materialization is the second half of `drwn write`: resolving the effective harness, then applying it to downstream agent tool directories with explicit ownership. The first half is the layered config model; this page covers how the resolved state actually reaches Claude, Codex, and Cursor on disk.

## The Five-Layer Model

Every materialization run composes effective harness state from up to five surfaces, in precedence order:

- packaged harness defaults: `registry/config.json` and built-in skills and MCP definitions
- local library: package-backed skill bundles under `~/.agents/drwn/skills` and user MCP definitions under `~/.agents/drwn/mcp-servers`
- user defaults: machine-wide active state in `~/.agents/drwn/machine.json`
- project overlay: `<project>/.agents/drwn/config.json` plus any merged card manifests
- downstream state: Claude, Codex, Cursor config files plus generated MCP configs

A project overlay's mere presence wipes the machine-only overlay for `optional`, `defaults`, `catalogs`, and `parallel`. Inside a configured project, machine state stops contributing those fields.

## The Resolved-State Engine

`buildEffectiveState` is the single function every command consults before reading or writing. It returns:

- the as-written shapes (`repoConfig`, `projectConfig`, `lockedCards`)
- the as-active shapes (`effectiveConfig`, `effectiveRegistry`, `activeServers`, `skillSelection`)
- the target scope (`scopeRoot`, `writeScope` of `project` or `machine`, `generatedDir`, `recordPath`)

The separation between as-written and as-active is load-bearing. Every command renders one or the other and never re-derives the merge itself. That keeps `status`, `doctor`, and `write` consistent about what they call "effective."

## The Three Materialization Mechanisms

`drwn write` writes to disk through exactly three mechanisms, chosen per target:

- **Copied directories** for skills. Claude and Codex skill targets are copied from the resolved skill source under `~/.agents/skills`, the repo skill tree, or a card's extracted tree. Each copied directory is recorded as a `managed-directory` entry in the write record.
- **`_drwn` managed-field meta block** for Claude `settings.json` and Codex `config.toml`. drwn rewrites only the keys it declares as managed (`mcpServers` for Claude, `mcp_servers` for Codex) and records canonical hashes of those keys in a `_drwn` block so the next write can detect drift.
- **Direct file write** for Cursor. drwn writes `~/.cursor/mcp.json` (or the project's `.cursor/mcp.json`) directly as a `managed-content` entry. Cursor's standalone JSON format means drwn owns the whole file, so the meta-block protocol is unnecessary.

See [Ownership and Write Records](./ownership-and-write-records) for how these three variants are recorded and cleaned up.

## Common Flags

Preview before mutating:

```bash
drwn write --dry-run
drwn write --dry-run --json
```

Run only one side:

```bash
drwn write --mcp-only
drwn write --skills-only
```

Limit to a single target:

```bash
drwn write --target=claude
drwn mcp write --target=cursor
```

`--force` is for replacing drift inside paths drwn already owns. It is not a general cleanup flag for user-managed files.

See [reference/cli/write](../reference/cli/write) for the full flag surface.

## Card-Overlay Wins Rule

Card-bundled skill content is authoritative. When a project has a card locked, and that card's manifest declares a skill in `skills.include`, the card's extracted copy wins over any user-default of the same name. There is no merge semantic: the returned path is single-source.

`drwn write --dry-run` annotates each planned skill copy with the winning resolution layer. When a curated user-default would have provided the same skill, the dry run records it as `also available:` so the operator can see what was shadowed:

```text
skills/inspect-harness from card foo@1.0.0 (also available: user-default)
```

If a card's `skills.include` names a skill the card store cannot resolve from disk, resolution returns `missing` with an actionable reason — drwn does not silently fall through to user defaults on a corrupt card store.

## Unresolved-Skill Hard Fail

`drwn write` resolves every requested `skills.include` up front. If any include is unresolvable, the run fails **before** touching the filesystem:

```text
drwn write cannot resolve all skills:
  - <name>: <reason>
```

This is a write-time contract. `drwn doctor` reports the same condition as a diagnostic without mutating state — see [Diagnostics Model](./diagnostics-model).

## Cross-References

- [Cards](./cards) for what a card contributes to the resolved state
- [Ownership and Write Records](./ownership-and-write-records) for how managed paths are recorded
- [reference/cli/write](../reference/cli/write) for command-line surface
