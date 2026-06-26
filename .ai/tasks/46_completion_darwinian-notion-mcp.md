# ABOUTME: Completion summary for the Notion agent card source execution.
# ABOUTME: Records source contents, materialization proof, OAuth boundary, and no-commit deviations.

# Task 46 Completion: `@remyjkim/notion-agent`

**Completed**: 2026-06-16  
**Scope completed**: no-git card source authoring + scratch materialization smoke + Claude Code project MCP path correction  
**Scope deferred**: local card publish, GitHub remote push, authenticated Notion tool call

## What Shipped

- Created editable card source: `~/.agents/drwn/sources/@remyjkim/notion-agent`
- Card source was created with `drwn card new @remyjkim/notion-agent --no-git`; verified no `.git` directory exists under the source.
- Added built-in registry MCP server `notion` via:
  ```bash
  drwn card source add-mcp @remyjkim/notion-agent notion
  ```
- Added 4 bundled skills:
  - `notion-pull-spec`
  - `notion-task-implement`
  - `notion-pr-summary-sync`
  - `notion-release-notes`

## Validation

- `drwn card source doctor @remyjkim/notion-agent --json` returned `ok: true` with zero issues.
- `drwn card source show @remyjkim/notion-agent --json` showed 4 bundled skills and 1 MCP file.
- `card.json.servers.notion` and `mcp-servers/notion.json` are canonically equivalent.
- No `claude mcp add`, `codex mcp add`, or equivalent direct tool add commands were used.

## Scratch Materialization Smoke

Scratch project: `/tmp/notion-card-test`

Commands used:

```bash
drwn init --non-interactive --no-default-catalogs
drwn card apply "file:$HOME/.agents/drwn/sources/@remyjkim/notion-agent"
drwn write --dry-run --json
drwn write
```

Verified after `drwn write`:

- `.agents/drwn/card.lock` contains `@remyjkim/notion-agent` with `manifest.servers.notion.url = "https://mcp.notion.com/mcp"`.
- `.mcp.json` contains `mcpServers.notion = { type: "http", url: "https://mcp.notion.com/mcp" }` for Claude Code project scope.
- `.codex/config.toml` contains `[mcp_servers.notion]`, `url = "https://mcp.notion.com/mcp"`, and `enabled = true`.
- `.cursor/mcp.json` contains `mcpServers.notion = { type: "http", url: "https://mcp.notion.com/mcp" }`.
- All 4 skills materialized into both `.claude/skills/<name>/SKILL.md` and `.codex/skills/<name>/SKILL.md`.
- Follow-up `drwn write --dry-run --json` after materialization returned `warnings: []`.
- `claude mcp get notion` from `/tmp/notion-card-test` on Claude Code 2.1.153 reports:
  - `Scope: Project config (shared via .mcp.json)`
  - `Status: ! Needs authentication`
  - `Type: http`
  - `URL: https://mcp.notion.com/mcp`

Correction after Claude Code `/mcp` verification: project-scoped Claude Code MCP servers are materialized to root `.mcp.json`, not `.claude/settings.json`. The harness writer and tests were updated accordingly.

## Hosted MCP Endpoint Check

Unauthenticated MCP initialize request to `https://mcp.notion.com/mcp` returned:

```text
HTTP/2 401
www-authenticate: Bearer realm="OAuth", resource_metadata="https://mcp.notion.com/.well-known/oauth-protected-resource/mcp", error="invalid_token", error_description="Missing or invalid access token"
```

This confirms the configured URL is live and OAuth-gated. A real `notion-search` runtime smoke still requires authenticating the configured client.

## OAuth Notes

- Claude Code: after applying the card and running `drwn write`, open Claude Code in the project and use `/mcp` to authenticate `notion`. Do not run `claude mcp add`.
- Codex: after applying the card and running `drwn write`, authenticate the existing configured server with `codex mcp login notion` if runtime testing in Codex is desired. Do not run `codex mcp add`.
- Cursor: after applying the card and running `drwn write`, use Cursor MCP settings to authenticate `notion`.

## Deviations

- Card name changed from the original `@darwinian/notion` plan to `@remyjkim/notion-agent`.
- Local `drwn card publish`, remote creation, and `drwn card push` were skipped because the user requested no worktree and no new commits.
- Authenticated `notion-search` was not executed in this run because OAuth is user/client-specific. The integration path and hosted server OAuth challenge were verified without using tool-specific add commands.
