# beginning-agents

Canonical MCP and skill registry for the shared `~/.agents/` configuration hub.

See the `ARCHITECTURE.md` file in your `~/.agents/` directory for the target architecture and workflow.

## Sync

Run the sync script from this repo root:

```bash
bun run sync-mcp.ts
```

Preview changes without writing:

```bash
bun run sync-mcp.ts --dry-run
```

Sync only MCP config or only skills:

```bash
bun run sync-mcp.ts --mcp-only
bun run sync-mcp.ts --skills-only
```

Sync one target:

```bash
bun run sync-mcp.ts --target=claude
```

## BGNG CLI

Phase 2 introduces a Clipanion-based `bgng` CLI from the `beginning-agents` package on top of the same core modules used by `sync-mcp.ts`.

Repo-local usage:

```bash
bun run bgng -- --help
bun run bgng -- sync --dry-run
bun run bgng -- skills list
bun run bgng -- mcp list
bun run bgng -- status
bun run bgng -- doctor
```

Global usage:

```bash
bun link
bgng --help
bgng sync --dry-run
bgng skills list
bgng mcp sync --dry-run
```

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

## Add an MCP Server

Edit [mcp-servers.json](./mcp-servers.json) and, if the server is optional, update [config.json](./config.json). Then run:

```bash
bun run sync-mcp.ts
```

`platform-provided` entries stay in the canonical registry but are intentionally excluded from generated local tool configs.

Parallel MCP is handled separately through `config.parallel.mcp.enabled` because it is an integration-mode choice, not just an optional single server toggle.

## Add a Skill

Place the skill in one of these directories:

- `skills/shared/` for skills exposed through `~/.agents/skills/`
- `skills/claude-only/` for Claude-only symlinks
- `skills/codex-only/` for Codex-only symlinks
- `skills/experimental/` for skills not yet curated

For shared skills, add the curated `~/.agents/skills/<name>` symlink to point at the repo copy, then run:

```bash
bun run sync-mcp.ts --skills-only
```

The sync script creates downstream symlinks in `~/.claude/skills/` and `~/.codex/skills/` and reports stale symlinks without removing them.

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
bun run sync-mcp.ts
```

Notes:

- `parallel-search` points at `https://search.parallel.ai/mcp`
- `parallel-task` points at `https://task-mcp.parallel.ai/mcp`
- Search MCP is usable anonymously at lower limits
- Task MCP requires authentication and may require a client-side OAuth or API-key flow after sync, depending on the tool

## Update Superpowers

Refresh the source copies from `~/.codex/superpowers/skills/` into `skills/shared/`, then rerun:

```bash
bun run sync-mcp.ts --skills-only
```

## Markdownify

`markdownify` is treated as an optional local MCP dependency.

The canonical registry assumes a local install path:

```json
"command": "node",
"args": ["markdownify-mcp/dist/index.js"]
```

If you want to enable it, update the path in [mcp-servers.json](./mcp-servers.json) to match your machine and then enable it in [config.json](./config.json).
