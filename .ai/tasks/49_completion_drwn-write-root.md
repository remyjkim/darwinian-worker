# ABOUTME: Completion summary for the drwn write --root implementation.
# ABOUTME: Records user-scope MCP materialization, per-server ownership, validation, and no-commit constraints.

# Task 49 Completion: `drwn write --root`

**Completed**: 2026-06-24
**Scope completed**: user-scope MCP materialization for Claude Code, Codex, and Cursor; per-server ownership; drift/removal/doctor coverage; atomic managed writes; CLI flags and tests
**Scope deferred**: authenticated Claude Code OAuth/runtime smoke against the real user home

## What Shipped

- Added `drwn write --root` plus `--user` alias to force machine/default scope even inside a project.
- Added Claude target `userMcpPath` so user-scope Claude MCP writes land in `~/.claude.json` while project-scope Claude MCP writes remain in root `.mcp.json`.
- Extended Claude settings merge logic with side-table, per-server ownership:
  - `~/.claude.json` is not polluted with `_drwn`.
  - drwn-owned entries are tracked as `mcpServers:<name>` hashes in the global write record.
  - hand-managed sibling MCP servers are preserved and ignored by drift checks.
  - removed machine defaults prune only previously owned entries.
- Kept Codex MCP writes on managed-field ownership and Cursor MCP writes on the generated symlink path.
- Updated `drwn doctor --json` to report user-scope Claude MCP drift from the per-server write record.
- Hardened managed writes through temp-file write, file `fsync`, atomic rename, and parent-directory `fsync`.
- Added real CLI scenario tests for `write --root` materialization, drift, force recovery, removal, no-default no-op behavior, project isolation, and doctor drift reporting.

## Files Updated

- `cli/commands/write.ts`
- `cli/core/diagnostics.ts`
- `cli/core/effective-state.ts`
- `cli/core/hook-generator/sync-hooks.ts`
- `cli/core/managed-file.ts`
- `cli/core/mcp.ts`
- `cli/core/paths.ts`
- `cli/core/sync.ts`
- `cli/core/types.ts`
- `registry/config.json`
- `test/helpers.ts`
- `test/scenarios-root-scope.test.ts`
- Existing MCP/write/hook tests updated for the new Claude user-scope path and merge return shape.

## Validation

Commands run:

```bash
bun test test/scenarios-root-scope.test.ts
bun test test/core-mcp-merge-hooks.test.ts test/sync-mcp.test.ts test/commands-mcp.test.ts test/commands-write-drift.test.ts
bun run typecheck
bun test
```

Results:

- Root-scope scenario suite: `6 pass`, `0 fail`.
- Focused MCP/write suite: passed, including a final targeted rerun of `test/commands-mcp.test.ts` and `test/commands-write-drift.test.ts` with `12 pass`, `0 fail`.
- Typecheck: passed.
- Full suite: `781 pass`, `1 skip`, `0 fail`.

## Real CLI Smoke

Ran the repo-local CLI process against a disposable temp home and temp project from `/tmp`-style machine scope:

```bash
AGENTS_REPO_ROOT=/Users/pureicis/dev/darwinian-harness \
AGENTS_HOME_DIR="$tmp/home" \
AGENTS_DIR="$tmp/home/.agents" \
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts library add mcp "$tmp/smoke-http.json" --as smoke-http --json

AGENTS_REPO_ROOT=/Users/pureicis/dev/darwinian-harness \
AGENTS_HOME_DIR="$tmp/home" \
AGENTS_DIR="$tmp/home/.agents" \
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts library defaults add mcp smoke-http --json

AGENTS_REPO_ROOT=/Users/pureicis/dev/darwinian-harness \
AGENTS_HOME_DIR="$tmp/home" \
AGENTS_DIR="$tmp/home/.agents" \
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts write --root --mcp-only --json
```

Verified with real CLI commands:

- `drwn write --help` lists `--root` and `--user`.
- `drwn write --root --mcp-only --dry-run --json` reports writes to `.claude.json`, `.codex/config.toml`, and `.cursor/mcp.json` without mutating pre-existing files.
- `drwn write --root --mcp-only --json` writes `context7` and the custom `smoke-http` user-library MCP server to user-scope Claude, Codex, and Cursor config.
- A second `drwn write --root --mcp-only --json` is idempotent with no changes.
- Hand-editing a non-owned Claude MCP sibling survives the next write.
- Hand-editing owned `mcpServers.context7` makes `drwn write --root --mcp-only --json` fail; `drwn doctor --json` reports `.claude.json` drift; `--force` repairs the owned entry.
- `drwn library defaults remove mcp smoke-http && drwn write --root --mcp-only --json` removes only `smoke-http`, preserves `context7`, and prunes the `mcpServers:smoke-http` write-record hash.
- `drwn write --user --mcp-only --json` from a project with `context7` disabled still writes user scope and does not create project `.mcp.json`.
- `drwn write --root --user --mcp-only` fails with the expected mutual-exclusion usage error.
- `.claude.json` contains no `_drwn` marker.
- `.cursor/mcp.json` is a symlink to the generated Cursor MCP config.

This smoke intentionally did not mutate the real `~/.claude.json`, `~/.codex/config.toml`, or `~/.cursor/mcp.json`.

## Deviations

- Did not run authenticated Claude Code `/mcp` OAuth or `claude mcp get` against the real user home. The user-scope behavior is covered by real CLI temp-home tests and a disposable scratch smoke; OAuth remains user/client-specific.
- Did not perform a manual SIGKILL mid-write smoke. The write path was hardened with atomic temp+rename semantics and validated by the full suite, including existing atomic write tests.

## Constraints Honored

- No `claude mcp add`, `codex mcp add`, or equivalent direct tool add commands were used.
- No separate Git worktree was created.
- No Git commit was created.
