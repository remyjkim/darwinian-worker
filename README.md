# beginning-agents

`beginning-agents` is a canonical repository and `bgng` CLI for managing shared MCP server configuration and reusable skills across local coding agents.

It is built for people who want one source of truth for:

- shared skill definitions
- canonical MCP server configuration
- synced local state for Claude Code, Codex, Cursor, and `~/.agents`

## Who This Is For

Use this project if you:

- run local coding agents and want one canonical config source
- want a shared skill library with explicit curation and sync behavior
- prefer safe-by-default sync and diagnostics over hidden mutation
- are comfortable with Bun-based local tooling

If you only need a one-off MCP config file for a single tool, this repo is probably more system than you need.

## What It Does

- keeps `config.json` and `mcp-servers.json` as the canonical registry
- syncs that canonical state into local tool config files
- manages a shared skill library under `skills/shared`
- supports package-backed extension skill bundles through `bgng skills packages ...`
- supports per-project overrides under `<project>/.agents/bgng/config.json`
- provides a safe-by-default CLI for sync, inspection, and diagnostics
- supports Parallel as CLI-backed skills by default, with optional MCP overlay

## Safety Model

The project is intentionally conservative:

- sync commands are non-destructive by default
- stale state is reported instead of silently deleted
- `bgng doctor` is report-only
- `sync-mcp.ts` remains available as a compatibility wrapper

## Requirements

- Bun 1.2+
- Node.js available for MCP servers that use `node`
- local installations of optional tools such as `parallel-cli` or `markdownify-mcp` when you enable them

## Usage Modes

There are two supported ways to use `beginning-agents`.

### 1. Use the published CLI

This is the fastest path if you want the packaged canonical configuration and command surface:

```bash
npm install -g beginning-agents
bgng status
```

By default, the published CLI uses the packaged canonical repo that ships with the package.

### 2. Use this repo as your canonical source

This is the right choice if you want to edit the registry, add skills, or maintain your own fork:

```bash
git clone https://github.com/remyjkim/beginning-agents.git
cd beginning-agents
bun install
bun run bgng -- status
```

You can also point a global install at a checkout:

```bash
export AGENTS_REPO_ROOT=/path/to/beginning-agents
bgng status
```

## What It Changes On Disk

`bgng` can read and write local agent configuration under:

- `~/.agents`
- `~/.claude`
- `~/.codex`
- `~/.cursor`
- `<project>/.agents/bgng/config.json`

Start with `bgng sync --dry-run` if you want to inspect the planned changes before writing anything.

## Quickstart

The safest first-run sequence is:

```bash
bgng status
bgng skills list
bgng mcp list
bgng sync --dry-run
bgng sync
```

That gives you:

- a system overview
- the current skill inventory
- the active MCP inventory
- a dry-run preview
- an explicit apply step

If you want project-specific overrides, scaffold them with:

```bash
bgng init
```

## Install

### Work from a checkout

```bash
git clone https://github.com/remyjkim/beginning-agents.git
cd beginning-agents
bun install
```

Use the CLI directly from the checkout:

```bash
bun run bgng -- --help
```

Or link it globally for local development:

```bash
bun link
bgng --help
```

### Install the published package

Once the package is published, install it globally with:

```bash
npm install -g beginning-agents
```

When installed globally, `bgng` will use the packaged canonical repo by default. If you want it to operate on a different checkout, set `AGENTS_REPO_ROOT`.

## Commands

Current implemented commands:

- `bgng sync`
- `bgng init`
- `bgng skills list`
- `bgng skills packages add <spec>`
- `bgng skills packages list`
- `bgng skills packages show <package>`
- `bgng skills curate <name>`
- `bgng skills uncurate <name>`
- `bgng skills sync`
- `bgng mcp list`
- `bgng mcp sync`
- `bgng status`
- `bgng doctor`

`sync-mcp.ts` remains available as a compatibility wrapper over the same extracted core modules.

## Per-Project Configuration

Use per-project config when one project should see a different tool or skill set than your global default.

The per-project file lives at:

```text
<project>/.agents/bgng/config.json
```

Scaffold it with:

```bash
bgng init
```

Per-project config can:

- disable or enable MCP servers for one project
- add a project-local MCP server definition
- include or exclude skills during sync
- disable or enable targets for one project

Discovery walks upward from your current working directory and stops at the first matching file.

Useful commands:

```bash
bgng status
bgng sync --dry-run
bgng doctor
```

Those commands will reflect the effective merged project view when a project config is active.

## Sync Wrapper

Run the compatibility script from the repo root:

```bash
bun run sync-mcp.ts
bun run sync-mcp.ts --dry-run
bun run sync-mcp.ts --mcp-only
bun run sync-mcp.ts --skills-only
bun run sync-mcp.ts --target=claude
```

## MCP Registry

Edit [mcp-servers.json](./mcp-servers.json) and, if the server is optional, update [config.json](./config.json). Then run:

```bash
bgng mcp sync
```

`platform-provided` entries stay in the canonical registry but are intentionally excluded from generated local tool configs.

Parallel MCP is handled separately through `config.parallel.mcp.enabled` because it is an integration-mode choice, not just an optional single-server toggle.

## Skill Library

Place a skill in one of these directories:

- `skills/shared/` for skills exposed through `~/.agents/skills/`
- `skills/claude-only/` for Claude-only symlinks
- `skills/codex-only/` for Codex-only symlinks
- `skills/experimental/` for skills not yet curated

For shared skills, add the curated `~/.agents/skills/<name>` symlink to point at the repo copy, then run:

```bash
bgng skills sync
```

The sync flow creates downstream symlinks in `~/.claude/skills/` and `~/.codex/skills/` and reports stale symlinks without removing them.

## Extension Skill Bundles

`beginning-agents` also supports optional package-backed extension skill bundles.

Use them when you want to make additional skills available without adding them to the built-in first-party skill tree.

Typical flow:

```bash
bgng skills packages add <npm-package-or-local-path>
bgng skills packages list
bgng skills packages show <package-name>
bgng skills curate <skill-name>
bgng skills sync
```

Important:

- package-backed skills become **available** when the bundle is added
- they are not exposed until you curate them
- sync remains centralized in `bgng`
- built-in first-party skills remain repo-native

## Optional Integrations

Baseline CLI usage does not require any third-party runtime beyond Bun and Node.

Optional integrations include:

- Parallel CLI-backed skills
- Parallel MCP overlay
- local `markdownify-mcp` installation

These are opt-in and should not break the normal CLI workflow when absent.

## Parallel

Parallel is integrated in two layers:

- default: CLI-backed shared skills
- optional: globally enabled Parallel MCP servers

### Default behavior

By default, this repo exposes these shared skills:

- `parallel-web-search`
- `parallel-web-extract`
- `parallel-deep-research`
- `parallel-data-enrichment`

These skills assume `parallel-cli` is installed and authenticated separately.

Install the CLI:

```bash
curl -fsSL https://parallel.ai/install.sh | bash
```

Authenticate:

```bash
parallel-cli login
parallel-cli auth
```

The skills use structured CLI commands such as:

```bash
parallel-cli search "<query>" --json
parallel-cli extract <url> --json
parallel-cli research run "<question>" --json
parallel-cli enrich suggest "<intent>" --json
```

### Optional MCP overlay

This repo also models:

- `parallel-search`
- `parallel-task`

These are disabled by default. To opt in globally, edit [config.json](./config.json) and set:

```json
"parallel": {
  "cli": { "enabled": true },
  "mcp": { "enabled": true }
}
```

Then run:

```bash
bgng mcp sync
```

Notes:

- `parallel-search` points at `https://search.parallel.ai/mcp`
- `parallel-task` points at `https://task-mcp.parallel.ai/mcp`
- Search MCP is usable anonymously at lower limits
- Task MCP requires authentication and may require a client-side OAuth or API-key flow after sync, depending on the tool

## Markdownify

`markdownify` is treated as an optional local MCP dependency.

The canonical registry assumes a local install path:

```json
"command": "node",
"args": ["markdownify-mcp/dist/index.js"]
```

If you want to enable it, update the path in [mcp-servers.json](./mcp-servers.json) to match your machine and then enable it in [config.json](./config.json).

## Contributing

Community contributions are welcome.

Start with:

```bash
bun test
bun run typecheck
bun run verify:release --json
```

Then read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## Documentation Map

- [CONTRIBUTING.md](./CONTRIBUTING.md): contributor workflow, setup, verification, and PR expectations
- [docs/maintainers/README.md](./docs/maintainers/README.md): maintainer-facing operational and release documentation
