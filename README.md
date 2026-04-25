# beginning-agents

`beginning-agents` is a canonical repository and `bgng` CLI for managing shared MCP server configuration and reusable skills across local coding agents.

It is built for people who want one source of truth for:

- shared skill definitions
- canonical MCP server configuration
- synced local state for Claude Code, Codex, Cursor, and `~/.agents`

## What It Does

- keeps `config.json` and `mcp-servers.json` as the canonical registry
- syncs that canonical state into local tool config files
- manages a shared skill library under `skills/shared`
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

## Quickstart

Inspect current state:

```bash
bgng status
bgng skills list
bgng mcp list
```

Preview changes before writing:

```bash
bgng sync --dry-run
```

Apply the canonical config and curated skills:

```bash
bgng sync
```

## Commands

Current implemented commands:

- `bgng sync`
- `bgng skills list`
- `bgng skills curate <name>`
- `bgng skills uncurate <name>`
- `bgng skills sync`
- `bgng mcp list`
- `bgng mcp sync`
- `bgng status`
- `bgng doctor`

`sync-mcp.ts` remains available as a compatibility wrapper over the same extracted core modules.

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
