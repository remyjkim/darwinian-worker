---
sidebar_position: 1
---

# Reading Doctor

`drwn doctor` runs every detector and reports what looks wrong without mutating anything. It is the inverse of `drwn write`: where `write` enforces invariants before touching disk, `doctor` enumerates problems and exits. Treat its output as a worklist, not a guarantee of safety.

Run it directly or with a machine-readable payload:

```bash
drwn doctor
drwn doctor --json
```

## The Report-Only Contract

`doctor` never removes a stale symlink, never rewrites a drifted MCP file, never re-pulls a missing card. It reads the same configuration `drwn write` would resolve and runs the detectors against current disk state. If you want it fixed, you decide which command to run next.

This is deliberate. The doctor and the write pipeline share one diagnostics engine in `cli/core/diagnostics.ts`, but the write path raises typed errors and aborts before mutation while doctor surfaces the same conditions as a report and returns normally. See [Diagnostics Model](../concepts/diagnostics-model) for the split.

## JSON Output Shape

`drwn doctor --json` returns a `DoctorReport`:

```json
{
  "brokenSymlinks": [],
  "staleSkillSymlinks": [],
  "mcpDrift": [],
  "missingGeneratedFiles": [],
  "projectConfigIssues": [],
  "cards": { "configuredRefs": [], "lockedVersions": [], "warnings": [] },
  "store": { "path": "...", "initialized": true, "schemaVersion": 1, "cardCount": 0, "sourceCount": 0, "skillBundleCount": 0, "mcpServerCount": 0, "legacyLayoutDetected": false },
  "writeRecord": { "path": "...", "present": true, "corrupt": false, "managedPathCount": 0, "lastWriteAt": "...", "lastWriteHarnessVersion": "..." }
}
```

Each of the top-level arrays maps to one detector category below.

## Detector Categories

### Broken symlinks

A symlink under `~/.claude/skills/` or `~/.codex/skills/` whose target file no longer exists. Usually means a skill bundle was uninstalled or a curated skill directory was renamed.

```bash
drwn doctor --json
drwn write --dry-run
```

Re-running `drwn write` re-points drwn-owned links to the correct source if the underlying skill is still resolved. If the skill itself is gone, remove the offending ref from `defaults.skills` (machine) or `skills.include` (project).

### Stale skill symlinks

A symlink that drwn no longer wants because the skill is no longer in the resolved set, but is still on disk. drwn-owned stale links are cleaned up on the next `drwn write` via the write record. User-owned replacements are preserved and warned about.

```bash
drwn doctor --json
drwn write
```

See [Stale Symlinks](./stale-symlinks) for the ownership distinction and the `store migrate --cleanup-legacy-orphans` escape hatch.

### MCP drift

The managed `mcpServers` key in `~/.claude/settings.json` or the `[mcp_servers]` block in `~/.codex/config.toml` has been edited outside drwn. Cursor reports drift when the generated `cursor-mcp.json` no longer matches the rendered expectation.

```bash
drwn doctor --json
drwn status --why server:<name>
drwn write --dry-run
drwn write --force
```

`--force` only overwrites drwn-managed regions. See [Ownership Conflicts](./ownership-conflicts) for the decision tree.

### Missing generated files

Cursor is enabled as a target but `~/.agents/drwn/generated/cursor-mcp.json` is not on disk. The downstream symlink at `~/.cursor/mcp.json` then points nowhere.

```bash
drwn doctor --json
drwn mcp write
```

A plain `drwn write` or `drwn mcp write` regenerates the file and re-establishes the symlink.

### Project config issues

A single category that aggregates problems with `<project>/.agents/drwn/config.json` and the resolved card lock:

- **Unknown server reference** — `project.servers["<name>"]` toggles a server that is not in the registry or the user MCP library.
- **Unknown skill reference** — `skills.include` or `skills.exclude` names a skill that no built-in scope, curated layer, package-backed bundle, or locked card provides.
- **Unknown extension reference** — `extensions["<name>"]` references an extension the registry does not know about.
- **Stale target override** — `targets["<name>"].enabled` matches what the machine config already says; the override is a no-op.
- **Card references unavailable skills** — a locked card's `skills.include` lists a skill name the project's available inventory cannot satisfy.
- **Dangling defaults references** — `defaults.skills` or `defaults.mcpServers` on the machine config points at something not in the inventory.

At write time these would each abort `drwn write` before mutation. At doctor time they collect into `projectConfigIssues` and the run continues so the rest of the report still renders.

```bash
drwn doctor --json
drwn status --why skill:<name>
drwn status --why server:<name>
```

Fix by editing the offending config file, removing the reference, or installing the missing inventory (`drwn library add ...`).

## Cross-References

- [reference/cli/doctor](../reference/cli/doctor) for the command surface
- [Diagnostics Model](../concepts/diagnostics-model) for how doctor and the write pipeline share one engine
- [Using `status --why`](./using-status-why) for tracing where an active item came from
- [Stale Symlinks](./stale-symlinks) and [Ownership Conflicts](./ownership-conflicts) for the most common follow-ups
