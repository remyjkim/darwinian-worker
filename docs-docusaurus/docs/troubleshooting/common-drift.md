---
sidebar_position: 3
---

# Common Drift

Drift happens when the on-disk state diverges from what the resolved harness expects. `drwn` is conservative about ownership: it will not silently overwrite content it did not write, and it will not silently leave behind content it no longer wants. The cost of that conservatism is that a few drift patterns recur often enough to warrant a triage guide. Each pattern below has the same shape: symptom, likely cause, diagnostic command, resolution.

## Hand-edited Claude `settings.json` outside the `_drwn` block

**Symptom.** `drwn doctor` does not report MCP drift, but a setting you remember adding has disappeared after the most recent `drwn write`.

**Likely cause.** The edit landed outside the `mcpServers` key, so it was preserved across the merge — but a sibling write to `settings.json` from another tool (Claude Code itself, an editor extension) may have stomped it. `drwn` only guards content inside the `_drwn`-managed key list.

**Diagnostic.**

```bash
drwn doctor --json
ls -la ~/.claude/settings.json.bak*
```

**Resolution.** Restore the user-owned field from your own versioned config or
backup. Machine MCP selection belongs in `capabilities.mcpServers` through
`drwn machine mcp enable`; project MCP intent belongs in project
`mcpServers`. drwn preserves unrelated siblings but does not own their backup
lifecycle.

## Installed bundles that are not selected

**Symptom.** A skill bundle is present in the local store but never shows up under `~/.claude/skills/` or `~/.codex/skills/` after `drwn write`. `drwn machine skill list` shows it.

**Likely cause.** The bundle is available but not selected by machine intent or any project's `skills.include`. Availability and activation are separate steps by design.

**Diagnostic.**

```bash
drwn machine skill list
drwn status --why skill:<name>
```

If the `--why` query returns `not found`, the skill is unavailable. If it
returns `available from repo or installed skill inventory` without `active`, it
is available but not selected.

**Resolution.** Add it to the layer that should own it.

```bash
drwn machine skill enable <name>
drwn add skill <name>
drwn write --scope machine --dry-run  # machine selection
drwn write                            # project selection, from the project
```

## Stale project registrations block inventory removal

**Symptom.** A package uninstall or MCP removal fails because a registered
project root is missing or unreadable.

**Likely cause.** `~/.agents/drwn/projects.json` contains a checkout that was
moved or deleted. Reference scans fail closed so stale registration cannot hide
live project intent.

**Diagnostic.**

```bash
drwn projects list
drwn projects unregister /absolute/stale/root --dry-run
```

**Resolution.** Verify the exact path is stale, then unregister it explicitly.

```bash
drwn projects unregister /absolute/stale/root
```

Unregister refuses a valid project that still declares standalone inventory
references. Remove those declarations in the project first.

## Cross-References

- [Ownership and Write Records](../concepts/ownership-and-write-records) for the meta-block and ledger model
- [Ownership Conflicts](./ownership-conflicts) when `drwn write` aborts on a managed-field hash mismatch
- [Machine Inventory](../reference/cli/machine) for reference and removal rules
