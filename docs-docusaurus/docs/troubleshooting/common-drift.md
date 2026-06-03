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

**Resolution.** `drwn` backs up the previous `settings.json` to `~/.claude/settings.json.bak` (numbered if multiple exist) before each merge. Recover the lost field from the most recent backup and decide where it belongs: machine-wide configuration goes in `~/.claude/settings.json` siblings, drwn-managed MCP servers belong in `defaults.mcpServers` or `project.servers`.

## Manually-installed bundles in `~/.agents/drwn/skills` not in defaults

**Symptom.** A skill bundle is present in the local store but never shows up under `~/.claude/skills/` or `~/.codex/skills/` after `drwn write`. `drwn library list skills` shows it.

**Likely cause.** The bundle is available but not added to machine defaults or any project's `skills.include`. Availability and activation are separate steps by design — see [Local Store](../concepts/local-store).

**Diagnostic.**

```bash
drwn library list skills
drwn library defaults list
drwn status --why skill:<name>
```

If the `--why` query returns `not found`, the skill is available but not selected anywhere. If it returns `available from repo or installed skill library` without `active`, the same.

**Resolution.** Add it to the layer that should own it.

```bash
drwn library defaults add skill <name>
drwn add skill <name>
drwn write --dry-run
drwn write
```

## Old `cards/` directories from pre-Wave-1 store

**Symptom.** `drwn doctor` reports `legacyLayoutDetected: true` in the `store` section, or store commands warn about an unmigrated layout.

**Likely cause.** The store was initialized before Wave 1's Git-backed cards layout. Per-version directories under `~/.agents/drwn/cards/` are still present alongside (or instead of) per-card bare Git repositories.

**Diagnostic.**

```bash
drwn store status
drwn store status --json
```

The JSON output's `legacyLayoutDetected` flag is the canonical signal.

**Resolution.** Migrate in two steps. The first reorganizes the store; the second converts per-version dirs into per-card bare Git repos.

```bash
drwn store migrate --dry-run
drwn store migrate
drwn store migrate-to-git --dry-run
drwn store migrate-to-git
```

If the migration leaves stray symlinks pointing at the archived old layout (under `~/.claude/skills/` or `~/.codex/skills/`), pass `--cleanup-legacy-orphans`:

```bash
drwn store migrate --cleanup-legacy-orphans
```

That flag removes only symlinks whose targets fall under drwn-owned legacy prefixes. Non-owned symlinks are preserved. See [Stale Symlinks](./stale-symlinks) for the ownership rules.

## Cross-References

- [Ownership and Write Records](../concepts/ownership-and-write-records) for the meta-block and ledger model
- [Ownership Conflicts](./ownership-conflicts) when `drwn write` aborts on a managed-field hash mismatch
- [Stale Symlinks](./stale-symlinks) for the symlink-cleanup rules referenced above
