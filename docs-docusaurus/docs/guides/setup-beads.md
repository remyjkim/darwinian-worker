---
sidebar_position: 2
---

# Set Up Beads

This guide enables Beads issue tracking for a single project. Beads is CLI-first
and project-scoped: `drwn` checks the `bd` CLI and `.beads/` presence, records
semantic project config, and optionally runs Beads setup recipes.

## Install bd First

Pick one of the upstream install paths:

```bash
brew install beads
npm install -g @beads/bd
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

`drwn` does not install `bd`. `drwn extensions status beads` reports CLI
availability and whether the current project has `.beads/`.

## Preview Setup

From the project root:

```bash
drwn extensions setup beads --dry-run
```

## Run Setup

```bash
drwn extensions setup beads
```

This records `extensions.beads` in `<project>/.agents/drwn/config.json` and may
run `bd init` and `bd setup` for the project.

## Useful Flags

- `--target=codex,claude,cursor` selects which Beads setup recipes to run
- `--stealth` passes Beads stealth mode through to `bd`
- `--skip-bd-init` skips `bd init`
- `--skip-bd-setup` skips `bd setup`
- `--include-skill` sets `extensions.beads.includeSkill: true` so `drwn write` derives `beads-task-tracking` for the project

Example with skill derivation:

```bash
drwn extensions setup beads --target=codex,claude --include-skill
drwn write --dry-run
drwn write
```

## Safety

`drwn` never runs `bd init --force` and never runs `bd doctor --fix`. The Beads
MCP remains optional and is **not** enabled by `drwn extensions setup beads`.
Dry runs do not mutate any project files.

## Verify

```bash
drwn extensions status beads
drwn extensions doctor beads
```

## See Also

- [Extensions CLI reference](../reference/cli/extensions)
