# ABOUTME: Completion summary for the MCP multi-target write adapter work (R1-R3).
# ABOUTME: Records what shipped, TDD evidence, real-CLI verification, and deviations from the plan.

# Task 50 Completion: MCP Multi-Target Write Adapter

**Status**: Completed
**Completed**: 2026-06-24
**References**: [.ai/tasks/50_mcp-multi-target-write-adapter-implementation-plan.md, .ai/analyses/70_mcp-multi-target-write-adapter-architecture.md, cli/core/mcp.ts, cli/core/sync.ts, cli/core/paths.ts, cli/core/diagnostics.ts, sync-mcp.ts]

## Summary

One canonical MCP server definition now renders correctly for Claude Code, Cursor, and Codex. Implemented all three increments (R1, R2, R3) plus the doctor fix, TDD throughout, verified with the real `drwn` CLI. Full suite: **775 pass, 1 skip, 0 fail**; `bun run typecheck` clean.

## What shipped

### R1 — Per-target env rendering (`cli/core/mcp.ts`)
- `partitionCodexEnv` + `toCodexServerConfig`: stdio `env` now renders as Codex `env_vars = ["VAR"]` (whole-value `${VAR}` passthroughs, forwarded from Codex's own environment) and a `[mcp_servers.X.env]` table (literals). Previously env was dropped entirely.
- `toCursorEnvValue` + new `toCursorServerConfig`: Cursor env now uses `${env:VAR}` (Cursor's syntax) instead of the literal `${VAR}` it would never expand.
- Claude `.mcp.json` unchanged (`${VAR}`, which Claude expands) — regression-pinned.

### R2 — Codex cross-layer conflict detection (`mcp.ts`, `paths.ts`, `sync.ts`)
- `resolveGlobalCodexConfig(homeDir)` and pure `detectCodexLayerConflicts(globalText, servers)`.
- `syncMcp` codex branch (project scope, non-forced): reads `~/.codex/config.toml`; if a managed server exists there with a different transport, the project entry is skipped with a `SyncResult` warning. `--force` emits anyway. Prevents the `command`+`url` collision error that motivated the work.

### R3 — Drift tracking + non-destructive merge (`mcp.ts`, `sync.ts`, `diagnostics.ts`)
- `stripCodexServerSections` replaces the strip-everything helper: only `[mcp_servers.<name>]` for managed (current ∪ previously-managed) names are stripped; user-authored servers are preserved verbatim.
- `mergeCodexTomlText(current, servers, previousManagedNames)`: previously-managed-but-now-removed servers are stripped; unmanaged preserved.
- `hashCodexManagedServers`: real per-server `fieldHashes` recorded in `write-record.json` (replacing the dead `{}`). `verifyManagedPaths` gained a `managed-fields` branch that refuses managed Codex drift unless `--force` — Codex parity with Claude's `_drwn` mechanism.
- `diagnostics.ts` doctor now compares the managed-server subset by hash (order- and user-server-independent) instead of whole-text equality, avoiding false drift.

## TDD evidence

Red-before-green for every change. New/updated tests:
- `test/sync-mcp.test.ts`: Codex `env_vars`/literal table, Cursor `${env:}`, Claude passthrough regression, `detectCodexLayerConflicts` (3), non-destructive merge + previously-managed removal.
- `test/commands-write-codex-conflict.test.ts` (real CLI): skip+warn on collision; `--force` emits with `env_vars`.
- `test/commands-write-codex-drift.test.ts` (real CLI): user server preserved across runs; managed drift refused, `--force` overwrites.

## Real-CLI verification

- `drwn write` with the real `@remyjkim/notion-token` card produced: Codex `env_vars = [ "NOTION_TOKEN" ]`; Claude `"${NOTION_TOKEN}"`; Cursor `"${env:NOTION_TOKEN}"`.
- Project-scope smoke: a hand-added `[mcp_servers.my_custom]` survived repeated writes; tampering a managed server was refused with the drift message; `--force` overwrote the managed server while preserving `my_custom`.

## Deviations from the plan

- **Renderer split kept minimal**: `renderJsonMcpConfig` remained the Claude renderer; only `renderCursorConfig` was pointed at a Cursor-specific config function. No `sync.ts`/`diagnostics.ts` Claude call-site changes were needed (less churn than the plan's `renderClaudeMcpConfig` rename).
- **Partial-template warning (R1.5) not implemented**: a non-whole-value template (e.g. `sk-${KEY}`) is emitted into the Codex literal `env` table (best effort; Codex won't expand it) without an explicit warning, to avoid threading warnings through a pure renderer. The realistic card inputs are whole-value `${VAR}` or literals. Flagged for future work if a real partial-template case appears.
- **`absent` sentinel**: `hashCodexManagedServers` returns `"absent"` for a managed name missing from the file (rather than hashing `undefined`, which crashes `createHash`). A missing managed server therefore reads as drift, which is correct.
- **HTTP bearer/headers** remain descoped (Open Questions 4); env stays `Record<string,string>` with no schema change (Open Question 5 resolved: zero migration).

## R4 — Empirical Codex validation (Codex CLI 0.140.0)

Run against the real `codex` binary with an isolated `CODEX_HOME` and a trusted temp project (real `~/.codex` untouched). Both design assumptions confirmed; no code changes required.

- **R4.1 — `${VAR}` is not interpolated in `env`.** `codex mcp get probe --json` returned the env value verbatim: `"PROBE_LITERAL": "${HOME}"`, with `env` and `env_vars` as distinct transport fields. Confirms `env_vars = [...]` (what R1 emits for passthroughs) is the supported sourcing mechanism; a `${VAR}` placed in an `env` table is stored/passed literally. (Scope: confirmed at config load/display; Codex exposes no config-stage expansion, and the docs none at spawn — `env_vars` is the sanctioned path regardless.)
- **R4.2 — Codex deep field-merges same-named `[mcp_servers.X]` across the global (`CODEX_HOME`) and project (`.codex/config.toml`) layers** (project loaded because the project was marked `trust_level = "trusted"`).
  - Different transports: global `url` + project `command` merged into one table → hard **whole-config** load failure: `Error: failed to load configuration … url is not supported for stdio in mcp_servers.notion`. Even `codex mcp list` fails. This reproduces the originally reported collision and validates R2's detect-and-skip.
  - Same transport: global `dup.url = …GLOBAL…` vs project `dup.url = …PROJECT…` → `codex mcp get dup` resolved to the **project** value. Confirms closest-layer (project) precedence with per-key field merge — which is exactly why `command`(project)+`url`(global) coexist and break.

Net: R1 (`env_vars`), R2 (skip cross-layer transport collisions), and R3 are all consistent with observed Codex behavior.

## Notes

- Work was done in the main tree on branch `remyjkim/task-44-drwn-card-hooks-with-cicd` alongside pre-existing uncommitted task-46/47 changes; no new commits or worktree per request.
