---
title: "Diagnostics & Safety"
description: "Drift detection, the doctor command, and the safety model."
date: 2026-04-28
order: 8
---

## Doctor

Use `doctor` when local state looks wrong:

```bash
drwn doctor
drwn doctor --json
```

It reports:

- Broken symlinks
- Stale downstream skill links
- MCP drift between registry and generated config
- Missing generated config files
- Cards, lockfile, and store issues
- Write-record ownership issues
- Project config issues

It does not mutate local state.

## Status Provenance

Use status when you need to understand why something is active:

```bash
drwn status --explain
drwn status --why skill:parallel-web-search
drwn status --why server:context7
drwn status --why card:@me/backend
```

`--explain` includes cards, skills, MCP servers, targets, and write records.
`--why` narrows the explanation to one named item.

## Safety Model

The safety model is intentionally simple:

- **Preview first** with `--dry-run`
- **Inspect** machine state with `status`
- **Diagnose** drift with `doctor`
- **Resolve managed drift intentionally** with `write --force`
- **Curate** skills explicitly before writing them downstream
- **Available, not exposed** — package-backed bundles are available content, not automatically active behavior
- **Write-record cleanup** removes drwn-owned stale paths while preserving user-owned replacements
- **Explicit migration cleanup** is available through `drwn store migrate --cleanup-legacy-orphans`

## Usage Modes

Baseline CLI usage does not require external tools beyond Bun, Node.js, and npm.

### Packaged harness

```bash
npm install -g darwinian-harness
drwn write --dry-run
```

### Editable harness source

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-harness
drwn status
```

In checkout mode, edit:

- `registry/config.json` for target and optional-server toggles
- `registry/mcp-servers.json` for MCP server definitions
- `skills/` for built-in skill content

## Optional Extensions

Optional extensions include:

- **Beads** — project issue tracking through `bd`
- **Parallel** — CLI-backed skills and optional MCP overlay
- **MarkItDown** — document conversion through `markitdown`
- **Markdownify** — optional local MCP dependency

Each can be enabled independently. See the [Extensions](/docs/06-extensions) page for setup details.
