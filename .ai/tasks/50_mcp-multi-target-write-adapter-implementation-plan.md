# ABOUTME: TDD implementation plan to make one canonical MCP definition render correctly for Claude Code, Cursor, and Codex.
# ABOUTME: Covers Codex env rendering, Cursor env-dialect translation, cross-layer conflict detection, and Codex drift tracking.

# Task 50: MCP Multi-Target Write Adapter — Implementation Plan

**Status**: Planning
**Created**: 2026-06-23
**Updated**: 2026-06-23
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2-3 days (R1 ~0.5d, R2 ~0.5d, R3 ~1-1.5d)
**Dependencies**: none
**References**: [.ai/analyses/70_mcp-multi-target-write-adapter-architecture.md, cli/core/mcp.ts, cli/core/sync.ts, cli/core/paths.ts, cli/core/diagnostics.ts, cli/core/write-record.ts, cli/core/managed-fields.ts, test/sync-mcp.test.ts, test/commands-write-drift.test.ts, https://developers.openai.com/codex/mcp, https://code.claude.com/docs/en/mcp, https://cursor.com/docs/mcp]

---

## Objective

Make `drwn write` faithfully adapt a single canonical MCP server definition to all three targets, so a stdio-with-token server (e.g. the `@remyjkim/notion-token` card) works on Claude Code, Cursor, **and** Codex without manual fixes or hard errors. Today the canonical `${VAR}` env convention is rendered verbatim to all targets — correct only for Claude; broken on Cursor (needs `${env:VAR}`) and on Codex (env dropped entirely), and the Codex project entry collides with a same-named global HTTP entry.

## Success Criteria

- [ ] A stdio server with `env: { NOTION_TOKEN: "${NOTION_TOKEN}" }` renders as `env_vars = ["NOTION_TOKEN"]` in `.codex/config.toml`, `env: { NOTION_TOKEN: "${env:NOTION_TOKEN}" }` in `.cursor/mcp.json`, and unchanged `${NOTION_TOKEN}` in `.mcp.json`.
- [ ] A literal env value renders as a `[mcp_servers.X.env]` table entry for Codex and verbatim for Claude/Cursor.
- [ ] When a project-scope Codex write would emit a server whose name already exists in `~/.codex/config.toml` with a different transport, the write warns and skips that server by default; `--force` emits anyway.
- [ ] The Codex `.codex/config.toml` write preserves user-authored `[mcp_servers.*]` servers (no longer strips the whole table) and refuses drift on its managed servers unless `--force`, matching Claude's behavior.
- [ ] `bun test` and `bun run typecheck` pass; no regression in existing Claude/Cursor/Codex assertions except the intended ones listed below.

## Approach

Render-time reinterpretation, **no canonical schema change**. The canonical model stays `RegistryServer.env: Record<string,string>` with the existing `${VAR}` convention (exactly what the card stores → zero migration). Each target gets its own adapter. HTTP bearer/header auth is **out of scope** (no server uses it; OAuth is handled by `codex mcp login` / `/mcp`, not config emission).

Grounding (verbatim doc facts, see analysis 70 Appendix A):
- Claude expands `${VAR}` / `${VAR:-default}` in `.mcp.json` (env/url/headers) → keep as-is.
- Cursor expands `${env:NAME}` only → translate.
- Codex `env_vars` is an **array of strings** that forwards named vars from Codex's own environment; `env` is a literal-value table; `${}` is not interpolated. Verified `smol-toml` emits `env_vars = ["X"]` (array) and `[mcp_servers.X.env]` correctly.

### Shared helper (new, in `cli/core/mcp.ts`)

```ts
// A pure passthrough is a value that is exactly "${NAME}".
const PASSTHROUGH = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
function classifyEnv(value: string): { fromEnv: string } | { literal: string } {
  const m = value.match(PASSTHROUGH);
  return m ? { fromEnv: m[1] } : { literal: value };
}
// Cursor dialect: ${NAME} -> ${env:NAME} (every occurrence; ${NAME:-default} is left as-is — Cursor has no default syntax).
function toCursorEnvValue(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "${env:$1}");
}
```

---

## Implementation Plan

### Phase R1: Per-target env rendering (highest value, lowest risk)

Fixes Codex (env dropped) and Cursor (`${VAR}` literal) in `cli/core/mcp.ts`. Split the shared JSON renderer so Claude and Cursor diverge.

- [ ] **R1.1 (test first)** In `test/sync-mcp.test.ts`, add a stdio server with `env` to the test registry helper and add failing tests:
  - Codex: `mergeCodexTomlText` emits `env_vars: ["NOTION_TOKEN"]` (array) for a `${NOTION_TOKEN}` value and a `[mcp_servers.X.env]` table for a literal value. (Replaces the test-mapping draft that incorrectly used an object-shaped `env_vars`.)
  - Cursor: `renderCursorConfig` emits `env: { NOTION_TOKEN: "${env:NOTION_TOKEN}" }`.
  - Claude: `renderClaudeMcpConfig`/`mergeClaudeSettingsText` emits `env: { NOTION_TOKEN: "${NOTION_TOKEN}" }` (regression guard — unchanged).
- [ ] **R1.2** `toCodexServerConfig` (mcp.ts:70-83): for stdio, partition `server.env` via `classifyEnv` → collect `fromEnv` names into `env_vars: string[]` (omit if empty) and `literal` pairs into `env: Record<string,string>` (omit if empty). Keep `command`/`args`/`startup_timeout_sec`. Leave the http branch (`url`/`enabled`) unchanged.
- [ ] **R1.3** Split `renderJsonMcpConfig` into `renderClaudeMcpConfig` (env verbatim) and `renderCursorConfig` (env via `toCursorEnvValue`). Introduce `toClaudeServerConfig` (current `toJsonServerConfig`, unchanged) and `toCursorServerConfig` (env translated; keep the remote `type` key — deliberate existing behavior asserted at test/sync-mcp.test.ts:228-246). `mergeClaudeSettingsText` uses `toClaudeServerConfig`.
- [ ] **R1.4** Update call sites: `cli/core/sync.ts:158` (Claude project `.mcp.json` → `renderClaudeMcpConfig`); `cli/core/diagnostics.ts:467` (same); cursor call sites already use `renderCursorConfig`.
- [ ] **R1.5** Partial-template guard: if a stdio env value is neither pure passthrough nor literal (e.g. `sk-${KEY}`), Codex cannot express it via `env_vars`. Emit it into the `env` literal table **and** push a `SyncResult.warning` ("`X` uses a partial template; Codex will not expand it — use a whole-value `${VAR}` or a literal"). Cursor/Claude handle it via interpolation. (YAGNI: don't build partial-template support; just warn.)
- [ ] **R1.6** Run `bun test test/sync-mcp.test.ts`; confirm new tests pass and the Claude regression test is green.

### Phase R2: Codex cross-layer conflict detection

Prevents the `command`+`url` collision that motivated this work. Project-scope only.

- [ ] **R2.1** `cli/core/paths.ts`: add `resolveGlobalCodexConfig(homeDir) => join(homeDir, ".codex", "config.toml")`.
- [ ] **R2.2 (test first)** In `test/sync-mcp.test.ts` (or `test/commands-write.test.ts` for the CLI path), add a fixture where `~/.codex/config.toml` contains `[mcp_servers.notion]` with `url=...` and the project would write stdio `notion`. Assert: default write pushes a warning and omits `notion` from the project `.codex/config.toml`; `--force` emits it.
- [ ] **R2.3** In `syncMcp` (sync.ts:170-174), when `writeScope === "project"` and target is codex: read+parse `resolveGlobalCodexConfig(options.homeDir)` if it exists (`smol-toml` `parseToml`). For each managed server, if the global layer defines the same name with a different transport (one side has `command`, the other `url`), and not `options.force`: push a warning with remediation and exclude that server from the set passed to `mergeCodexTomlText`. (`homeDir` is available in project scope — confirmed via `scopedOptions` spread.)
- [ ] **R2.4** Confirm Claude/Cursor are unaffected (Claude does not merge across scopes; Cursor project-wins). No equivalent detection needed there.
- [ ] **R2.5** Run the focused suite.

### Phase R3: Codex drift tracking + non-destructive merge (durability; splittable)

Brings Codex to Claude-parity for drift and stops clobbering user-authored servers. Larger; can ship after R1/R2.

- [ ] **R3.1 (test first)** Add tests: (a) a hand-added `[mcp_servers.custom]` survives a `drwn write`; (b) editing a drwn-managed server in `.codex/config.toml` then re-running `write` fails with a drift error, and `write --force` overwrites — mirroring `test/commands-write-drift.test.ts:22-48` for Claude.
- [ ] **R3.2** Non-destructive strip: change `stripTomlSections` (mcp.ts:141-163) to accept the set of managed server names and strip only `mcp_servers.<name>` (+ subtables) for those names, preserving unmanaged servers. Thread managed names from `mergeCodexTomlText` (the keys of `servers`, plus previously-managed names — see R3.4). Both callers (sync.ts:172, diagnostics.ts:477) reuse `mergeCodexTomlText`, so they stay consistent.
- [ ] **R3.3** Real drift hashes: at sync.ts:173 populate `fieldHashes: { mcp_servers: canonicalJsonHash(managedSubset) }` (reuse `canonicalJsonHash` from managed-fields.ts; `managedSubset` = `{ [name]: codexConfig[name] }` for managed names only, so user servers don't trigger false drift).
- [ ] **R3.4** Wire verification for the `managed-fields` kind (currently dead — never verified): in `verifyManagedPaths`/`cleanupRemovedManagedPaths` (sync.ts) add a branch that, for `.codex/config.toml`, re-parses the on-disk `mcp_servers`, hashes the managed subset, and throws "managed Codex MCP drift" unless `--force`. Persist the managed server-name list in the `managed-fields` entry's `fields` (or a sibling) so removed-managed servers are stripped on the next write and the verifier knows which names it owns.
- [ ] **R3.5** Re-check `diagnostics.ts` codex drift (lines 475-481): now that unmanaged servers are preserved, ensure the doctor compares only the managed subset (avoid false positives from user servers). Adjust the comparison to parse + compare the managed `mcp_servers` subset rather than whole-text equality.
- [ ] **R3.6** Run full suite.

### Phase R4 (parallel, optional): empirical Codex validation

- [ ] **R4.1** Confirm Codex does not expand `${VAR}` in an `env` table value (throwaway project config + echo server). Expected: literal → validates that `env_vars` is mandatory.
- [ ] **R4.2** Confirm Codex's cross-layer merge coexists `command`+`url` (reproduce the original error). Records the behavior behind R2.
- [ ] **R4.3** Capture results in a `NN_completion_*` doc; if either expectation is wrong, only R2/R3 messaging changes — R1 stands.

---

## Acceptance Criteria

- [ ] All Success Criteria met.
- [ ] `bun test` green; `bun run typecheck` clean.
- [ ] Intended test changes only: update Codex emission tests to expect `env_vars`/`env`; add Cursor `${env:}` test; add cross-layer conflict test; add Codex drift tests. No unrelated assertions altered.
- [ ] Scratch smoke: re-create the `notion-token` scenario in `/tmp`, run `drwn write`, verify `.codex/config.toml` has `env_vars = ["NOTION_TOKEN"]` and no transport collision with a seeded global HTTP `notion`.
- [ ] `.ai/analyses/70` Open Questions 4 (bearer) and 5 (migration) recorded as resolved/descoped in the completion doc.

## Testing Strategy

TDD throughout — every phase starts with a failing test. Tests parse-and-compare TOML/JSON (the established pattern at test/sync-mcp.test.ts:337-375), not substring matching. Reuse `scaffoldCliFixture` (test/helpers.ts:65) which already seeds `homeDir/.codex/config.toml`; R2 extends it with a global HTTP `notion` entry. CLI-level drift behavior mirrors `test/commands-write-drift.test.ts`.

## Risks & Mitigation

- **Codex `${}`/merge behavior is officially undocumented.** Mitigation: the design is independent of both (use `env_vars` regardless of interpolation; detect-and-avoid regardless of merge). R4 confirms empirically.
- **Splitting `renderJsonMcpConfig` touches Claude `.mcp.json`.** Mitigation: `toClaudeServerConfig` is byte-identical to today's `toJsonServerConfig`; a regression test pins unchanged Claude output.
- **R3 doctor false positives** from preserved user servers. Mitigation: compare only the managed subset (R3.5).
- **Cursor `${VAR:-default}` not translated** (Cursor lacks default syntax). Mitigation: out of scope; only whole-name `${VAR}` is translated; document the limitation. The card uses simple `${VAR}`.

## Notes

- **Decision — no schema change.** Env stays `Record<string,string>` with `${VAR}`; adapters reinterpret at render time. Zero migration for published cards. Verified env is pure passthrough today (no validation, no schema, no interpolation code anywhere).
- **Decision — `env_vars` is an array** (`["NOTION_TOKEN"]`), per Codex docs and confirmed with `smol-toml`. (Corrects an object-shaped draft from investigation.)
- **Decision — HTTP bearer/headers descoped.** `RegistryServer` has no headers/bearer field; notion/slack `auth` is dead metadata; OAuth is a login-flow concern, not config emission. Future work if a bearer-token HTTP server is added.
- **Decision — remote `type` key retained** for Claude/Cursor JSON (deliberate, test-asserted); only env dialect changes for Cursor.
- **Sequencing**: R1 alone makes the motivating card work on Codex and Cursor; ship it first. R2 prevents the hard collision error. R3 is durability and can land separately.
