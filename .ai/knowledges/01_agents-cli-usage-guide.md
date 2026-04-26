# BGNG CLI Usage Guide

## Purpose

This is the operator-facing guide for the `bgng` CLI.

Use it for:

- day-to-day command usage
- understanding the local state model
- safe sync workflows
- locating deeper manuals for project config, extension bundles, and publishing

For focused subsystem docs, see:

- [02_per-project-config-guide.md](./02_per-project-config-guide.md)
- [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md)
- [04_homebrew-release-checklist.md](./04_homebrew-release-checklist.md)
- [05_npm-publishing-analysis-and-manual.md](./05_npm-publishing-analysis-and-manual.md)

## What `bgng` Is

`bgng` is the primary operator CLI for `beginning-agents`.

It operates on this model:

- the repo is the canonical built-in source of truth
- `~/.agents/skills` is the curated publication layer
- package-backed skill bundles under `~/.agents/packages/skills` are optional extension sources
- Claude/Codex/Cursor state is derived from that combined model

The CLI is intentionally conservative:

- sync is non-destructive by default
- stale state is reported, not silently removed
- `doctor` is report-only
- package-backed skills are made available first, then curated explicitly

## Execution Modes

### Repo-local usage

Use this while developing inside the repo:

```bash
bun run bgng -- --help
bun run bgng -- status
bun run bgng -- sync --dry-run
bun run bgng -- skills list
bun run bgng -- mcp list
```

### Global usage

Link the package globally:

```bash
bun link
```

Then use:

```bash
bgng --help
bgng status
bgng sync --dry-run
bgng skills list
bgng mcp sync --dry-run
```

Both modes execute the same command implementations.

## Local State Model

`bgng` can read and write:

- the repo-root canonical config
- `~/.agents`
- `~/.claude`
- `~/.codex`
- `~/.cursor`
- `<project>/.agents/bgng/config.json`

Important directories:

- built-in shared skills: `skills/shared`
- curated shared skills: `~/.agents/skills`
- package-backed skill bundles: `~/.agents/packages/skills`
- Claude downstream skills: `~/.claude/skills`
- Codex downstream skills: `~/.codex/skills`

## Recommended First-Run Sequence

```bash
bgng status
bgng skills list
bgng mcp list
bgng sync --dry-run
bgng sync
```

If you want project-local overrides, scaffold them before syncing from that project:

```bash
bgng init
```

## Command Groups

Implemented groups:

- `init`
- `sync`
- `skills`
- `mcp`
- `status`
- `doctor`

## Init Command

Use:

```bash
bgng init
bgng init --force
```

What it does:

- creates `<project>/.agents/bgng/config.json`
- writes a minimal config with `{ "version": 1 }`
- warns if `.gitignore` appears to exclude `.agents`

Use this when one project needs overrides without changing your central machine-wide config.

## Sync Command

Use:

```bash
bgng sync
bgng sync --dry-run
bgng sync --json
bgng sync --target=claude
```

This is the convenience wrapper over the full sync behavior and the closest CLI equivalent to the legacy `sync-mcp.ts` entrypoint.

When a per-project config exists, `bgng sync` automatically uses the effective merged project view discovered from the current working directory.

## Skills Commands

### List skills

Human-readable:

```bash
bgng skills list
```

JSON:

```bash
bgng skills list --json
```

What it shows:

- skill name
- scope
- curation state
- whether it is linked into Claude
- whether it is linked into Codex
- source metadata for package-backed skills in JSON mode

### Manage package-backed skill bundles

Add a bundle:

```bash
bgng skills packages add <npm-package-or-local-path>
```

List installed bundles:

```bash
bgng skills packages list
bgng skills packages list --json
```

Inspect one installed bundle:

```bash
bgng skills packages show <package-name>
bgng skills packages show <package-name> --json
```

Behavior:

- a bundle is ingested into the managed cache under `~/.agents/packages/skills`
- adding a bundle does not curate or sync any skill automatically
- bundles are content sources; `bgng` remains the only supported sync and curation surface

See [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md) for the full bundle model.

### Curate a shared skill

```bash
bgng skills curate <name>
```

This adds the skill into `~/.agents/skills`, which is the curated publication layer.

Important:

- this does not automatically sync tool directories
- curate first, then run `bgng skills sync`
- this works for built-in shared skills and package-backed shared skills when the skill name is unique

### Uncurate a shared skill

```bash
bgng skills uncurate <name>
```

This removes the skill from `~/.agents/skills`.

Important:

- it does not automatically prune downstream tool symlinks
- downstream cleanup is intentionally not destructive by default

### Sync skills downstream

```bash
bgng skills sync
```

Dry-run:

```bash
bgng skills sync --dry-run
```

JSON:

```bash
bgng skills sync --json
```

Behavior:

- installs missing downstream skill symlinks
- reports stale downstream skill symlinks
- does not prune stale symlinks automatically
- respects per-project skill exclude lists
- respects per-project skill include lists for repo-native skills

Current limitation:

- per-project `skills.include` currently resolves repo-native skills only
- general `bgng skills curate <name>` resolves both built-in shared skills and package-backed shared skills

## MCP Commands

### List canonical MCP servers

Human-readable:

```bash
bgng mcp list
```

JSON:

```bash
bgng mcp list --json
```

What it shows:

- server name
- transport
- whether it is currently active
- enabled targets summary

This is the quickest way to inspect the effect of toggles like `parallel.mcp.enabled`.

### Sync MCP into enabled targets

```bash
bgng mcp sync
```

Dry-run:

```bash
bgng mcp sync --dry-run
```

Target-specific:

```bash
bgng mcp sync --target=claude
```

JSON:

```bash
bgng mcp sync --json
```

Behavior:

- renders active canonical MCP state
- applies it to enabled targets
- preserves the current non-destructive semantics
- uses project-local server and target overrides when present

## Status Command

Use:

```bash
bgng status
bgng status --json
```

What it reports:

- repo root
- `~/.agents` path
- enabled targets
- active skill counts
- curated skill counts
- installed package-backed bundle counts
- active project config path when one is in scope
- project override summary when one is active

## Doctor Command

Use:

```bash
bgng doctor
bgng doctor --json
```

What it reports:

- missing required directories or config files
- stale skill symlinks
- MCP drift indicators
- project config issues

Typical project-config issues include:

- unknown server references
- unknown skill references
- stale project skill overrides

`doctor` is report-only. It does not auto-fix or auto-prune.

## Common Workflows

### Global machine sync

```bash
bgng sync --dry-run
bgng sync
```

### Project-specific override setup

```bash
cd /path/to/project
bgng init
bgng status
bgng sync --dry-run
```

### Add extension skill bundle and expose one skill

```bash
bgng skills packages add <bundle>
bgng skills packages show <package-name>
bgng skills curate <skill-name>
bgng skills sync
```

### Inspect project issues before syncing

```bash
bgng status
bgng doctor
```

## Compatibility Wrapper

The legacy sync entrypoint remains available:

```bash
bun run sync-mcp.ts
bun run sync-mcp.ts --dry-run
bun run sync-mcp.ts --mcp-only
bun run sync-mcp.ts --skills-only
bun run sync-mcp.ts --target=claude
```

Use `bgng` for normal operation. Keep `sync-mcp.ts` for compatibility and transition support.

## Optional Integrations

`beginning-agents` supports optional local integrations, including:

- `parallel-cli` for Parallel-backed skills
- `markdownify-mcp` for local markdown extraction workflows

These are optional and machine-dependent. Their absence should not block the baseline CLI and sync model.

## Current Limits

- `doctor` is report-only
- downstream stale symlinks are reported, not pruned
- package-backed bundle update/remove lifecycle is not implemented yet
- package-backed bundles are extension sources, not authoritative sync CLIs
- per-project `skills.include` currently resolves repo-native skills only

## Further Reading

- [02_per-project-config-guide.md](./02_per-project-config-guide.md)
- [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md)
- [04_homebrew-release-checklist.md](./04_homebrew-release-checklist.md)
- [05_npm-publishing-analysis-and-manual.md](./05_npm-publishing-analysis-and-manual.md)
