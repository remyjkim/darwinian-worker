# ABOUTME: Completion summary for fixing Claude Code project MCP materialization.
# ABOUTME: Records the .mcp.json path correction, registry smoke proof, and validation commands.

# Task 47 Completion: Claude Code Project MCP Registry Fix

**Completed**: 2026-06-16  
**Scope completed**: project-scope Claude Code MCP materialization + diagnostics + tests + Notion registry smoke  
**Scope deferred**: authenticated Notion tool execution after user OAuth

## What Changed

- Fixed project-scope Claude Code MCP output to write root `.mcp.json` instead of `.claude/settings.json`.
- Added `claudeMcp` to shared tool path resolution.
- Added a shared JSON MCP renderer for Claude Code project `.mcp.json` and Cursor-style JSON MCP config.
- Updated MCP drift diagnostics to compare project-scope Claude MCP against `.mcp.json`.
- Updated project materialization tests to assert MCP servers land in `.mcp.json`.
- Kept Claude hook materialization on `.claude/settings.json`; hooks and MCP now use their correct Claude Code surfaces.

## Root Cause

Claude Code does not read project-scoped MCP servers from `.claude/settings.json`. Per current Claude Code behavior and docs, shared project MCP config is read from `.mcp.json` in the project root. The previous harness writer landed valid MCP JSON under the wrong Claude file, so `/mcp` did not show the Notion server.

## Files Updated

- `cli/core/paths.ts`
- `cli/core/mcp.ts`
- `cli/core/sync.ts`
- `cli/core/diagnostics.ts`
- `test/core-paths.test.ts`
- `test/commands-mcp.test.ts`
- `test/commands-write.test.ts`
- `test/scenarios-card-materialization.test.ts`
- `test/scenarios-scope-isolation.test.ts`
- `test/scenarios-user-journeys.test.ts`
- `test/cli-hook-write-e2e.test.ts`
- `.ai/tasks/46_darwinian-notion-mcp-implementation-plan.md`
- `.ai/tasks/46_completion_darwinian-notion-mcp.md`

## Validation

Commands run:

```bash
bun test test/core-paths.test.ts test/core-mcp-sync.test.ts test/commands-mcp.test.ts test/commands-write.test.ts test/scenarios-card-materialization.test.ts test/scenarios-scope-isolation.test.ts test/scenarios-user-journeys.test.ts
bun test test/cli-hook-write-e2e.test.ts
bun test
bun run typecheck
```

Results:

- Focused MCP/project suite: `40 pass`, `0 fail`.
- Hook E2E suite: `3 pass`, `0 fail`.
- Full suite: `764 pass`, `1 skip`, `0 fail`.
- Typecheck: passed.

## Scratch Smoke

Scratch project: `/tmp/notion-card-test`

Commands used with the repo-local patched CLI:

```bash
rm -rf /tmp/notion-card-test
mkdir -p /tmp/notion-card-test
cd /tmp/notion-card-test
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts init --non-interactive --no-default-catalogs
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts card apply "file:$HOME/.agents/drwn/sources/@remyjkim/notion-agent"
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts write
```

Verified:

- `.mcp.json` contains `mcpServers.notion = { type: "http", url: "https://mcp.notion.com/mcp" }`.
- `.codex/config.toml` contains `[mcp_servers.notion]` with the Notion URL and `enabled = true`.
- `.cursor/mcp.json` contains `mcpServers.notion` with the Notion URL.
- `.agents/drwn/card.lock` contains `@remyjkim/notion-agent` and its four bundled Notion skills.
- `.agents/drwn/write-record.json` records `.mcp.json` as managed content.
- `drwn doctor --json` reports `mcpDrift: []` and `missingGeneratedFiles: []`.

Claude Code verification from `/tmp/notion-card-test`:

```bash
claude mcp get notion
```

Returned:

```text
Scope: Project config (shared via .mcp.json)
Status: ! Needs authentication
Type: http
URL: https://mcp.notion.com/mcp
```

This confirms Claude Code can discover the registry-materialized Notion MCP server without using `claude mcp add`.

## Remaining User Test

From the project containing `.mcp.json`:

```bash
cd /tmp/notion-card-test
claude
/mcp
```

Select `notion` and complete OAuth. After OAuth, run a Notion query such as `notion-search "<workspace query>"`.

If Claude Code is launched from this repo root, Notion will not appear until this repo has its own `.agents/drwn/config.json`, the card is applied here, and `drwn write` creates this repo's `.mcp.json`.

## Constraints Honored

- No `claude mcp add` or `codex mcp add` commands were used.
- No Git commits were created.
- No separate worktree was created.
- `drwn card publish`, `drwn card push`, and remote creation remained deferred.
