---
sidebar_position: 9
---

# Diagnostics Model

`drwn doctor` and `drwn status` share one diagnostics engine. Both are report-only: they never mutate the store, downstream tool config, or write records. This page covers what each command checks, how they overlap with the write pipeline's hard-fail contracts, and where to look when something looks wrong.

## Doctor: Report-Only Across Five Detector Categories

`drwn doctor` runs every detector and renders a structured report:

```bash
drwn doctor
drwn doctor --json
```

The categories surfaced:

- **Broken symlinks** in downstream skill directories — entries whose target no longer exists
- **Stale downstream skill links** — drwn-owned skill links that no longer correspond to any active skill
- **MCP drift** in Claude `settings.json`, Codex `config.toml`, or Cursor `mcp.json` — the managed keys have been modified outside drwn
- **Missing generated config files** — Cursor enabled but `cursor-mcp.json` not on disk
- **Project config issues** — unknown servers in `project.servers`, unknown skills in `skills.include`, unknown extensions, stale target overrides, unavailable card skills, and dangling `defaults` references

`doctor` reports issues. It never fixes them. The intent is that an operator (or an agent following a skill) reads doctor output, decides what to do, and then runs the right command (`drwn write`, `drwn card update`, `drwn library defaults remove`, and so on).

See [reference/cli/doctor](../reference/cli/doctor) for the command surface and [troubleshooting/reading-doctor](../troubleshooting/reading-doctor) for how to triage common output.

## Status: As-Written vs As-Active, Plus Provenance

`drwn status` has three modes:

```bash
drwn status
drwn status --explain
drwn status --why <name>
```

- Default mode renders concise per-target and per-source counts plus the full diagnostics sections in JSON form.
- `--explain` adds a human-readable explanation of the same sections.
- `--why <name>` answers a provenance question: which layer (card, project overlay, machine default, packaged registry) is making this skill, server, extension, or card active.

`--why` is the right command before a write when an operator is unsure why a given skill or server is appearing in the effective state. It is the inverse of `doctor`: doctor surfaces problems, `--why` explains decisions.

See [reference/cli/status](../reference/cli/status) for flag details.

## The Write-Time vs Doctor-Report Split

`skills.include` is the canonical example of how the two surfaces relate:

- At write time, an unresolved `skills.include` name **fails** the run before any filesystem mutation. `drwn write` refuses to leave the project half-applied.
- At report time, `drwn doctor` surfaces the same condition as a project-config diagnostic and returns normally so the rest of the report still renders.

This split is deliberate. Materialization must be all-or-nothing for skills; diagnostics must always finish so the operator gets a complete picture.

The same pattern applies to other write-time invariants (corrupt card store, integrity mismatch, name collision): `write` and `install` raise typed errors; `doctor` and `status` surface them as diagnostics.

## Managed-Field Drift Detection

The `_drwn` meta block written into Claude `settings.json` and Codex `config.toml` is how diagnostics know whether a user has hand-edited drwn-managed content.

The block contains:

```json
{
  "version": 1,
  "managedKeys": ["mcpServers"],
  "fieldHashes": { "mcpServers": "sha256-..." },
  "lastWriteAt": "..."
}
```

On each write, drwn parses the current file, reads the prior `_drwn` block, recomputes the canonical hash of each managed key, and aborts the merge if any recorded hash diverges (unless `--force` is passed). `doctor` runs the same comparison and reports the divergence as MCP drift without aborting anything.

Canonical hashing sorts object keys recursively before sha256 so semantically equivalent edits — reordered keys, whitespace differences — do not register as drift. Only meaningful content changes trigger the report.

Cursor's standalone JSON format means drwn owns the whole file via the generated-file-plus-symlink mechanism. There is no meta block; doctor instead reports a missing generated file or a symlink that points somewhere unexpected.

## Store and Write Record Diagnostics

Both `doctor` and `status --explain` include:

- store status: schema version, card count, source count, skill-bundle count, MCP-server count, legacy-layout detection
- write-record status: presence, corruption, managed-path count, last write timestamp, and the harness version that produced the last write

A missing write record is normal on a fresh project; a corrupt one is reported so the operator can decide whether to delete it and re-run `drwn write`.

## Cross-References

- [reference/cli/doctor](../reference/cli/doctor) for the command surface
- [reference/cli/status](../reference/cli/status) for status modes
- [troubleshooting/reading-doctor](../troubleshooting/reading-doctor) for triage
- [Ownership and Write Records](./ownership-and-write-records) for the meta-block and ledger model
