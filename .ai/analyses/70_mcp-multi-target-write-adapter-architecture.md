# ABOUTME: Target architecture for faithfully adapting one canonical MCP server definition to Claude Code, Cursor, and Codex.
# ABOUTME: Roots each fix in official tool docs; covers env/secret rendering, transport mapping, config-layer collision, and Codex drift tracking.

# MCP Write Path: Multi-Target Adapter Target Architecture

**Date**: 2026-06-23
**Author**: Claude + Remy
**Status**: Draft
**References**: [cli/core/mcp.ts, cli/core/sync.ts, cli/core/types.ts, cli/core/project.ts, registry/mcp-servers.json, test/sync-mcp.test.ts, .ai/tasks/47_completion_claude-code-project-mcp-registry-fix.md, .ai/tasks/46_completion_darwinian-notion-mcp.md, https://developers.openai.com/codex/mcp, https://developers.openai.com/codex/config-reference, https://developers.openai.com/codex/config-basic, https://code.claude.com/docs/en/mcp, https://cursor.com/docs/mcp]

---

## Executive Summary

`drwn write` treats "render one canonical MCP server → a downstream tool config" as a near-identity copy. That assumption holds only for Claude Code. The investigation — grounded in the official Codex, Claude Code, and Cursor docs — shows the three targets disagree on all three axes that matter for a shared definition: **how secrets are referenced, how remote transport is declared, and how config layers merge.** The harness encodes only Claude Code's conventions and copies them verbatim to the other two.

Concretely, a single stdio-with-token server (the `@remyjkim/notion-token` card, which exists precisely for headless/cloud token auth) produces:

- **Claude Code**: a working server (`env: {NOTION_TOKEN: "${NOTION_TOKEN}"}` is expanded — confirmed by docs).
- **Cursor**: a **broken** server — Cursor only expands `${env:NOTION_TOKEN}`, so the emitted `${NOTION_TOKEN}` is passed through as a literal string.
- **Codex**: a **broken** server — the Codex emitter drops `env` entirely, so no token reaches the subprocess; and the project-scope `.codex/config.toml` entry collides with a same-named global HTTP entry, producing Codex's "stdio server but also has a `url` key" error.

This document specifies a target architecture that replaces the verbatim copy with a thin **per-target adapter layer** over a **transport- and secret-neutral canonical model**, plus **cross-layer conflict detection** for Codex and **drift tracking** for the Codex TOML surface. Each fix is tied to a verbatim doc statement or an explicitly-flagged documentation gap.

---

## Context

A user fix to a project `.codex/config.toml` surfaced the question: does the harness write path have a design flaw around adapting a canonical MCP config to both Claude Code and Codex? The triggering symptom was Codex erroring on a `notion` server table that contained both `command` (project layer) and `url` (global layer).

The canonical source for that project's `notion` is the card `@remyjkim/notion-token`, which intentionally defines `notion` as **stdio + `NOTION_TOKEN`** (an "OAuth-free alternative for headless/cloud where the hosted server is not viable"). The built-in registry, by contrast, migrated `notion` to a hosted **HTTP** server (commit `3e79aac`). Both legitimately named `notion`; the card override wins at project scope (`cli/core/project.ts:69` replaces the whole entry).

The goal of this analysis: produce a concrete, doc-grounded fix strategy for every flaw the write path exhibits when one canonical definition must serve Claude Code, Cursor, and Codex.

---

## Investigation

### Method

- Read the write path end to end: `cli/commands/write.ts` → `cli/core/sync.ts` (`syncMcp`, lines 125-186) → `cli/core/mcp.ts` (`toJsonServerConfig` 55-68, `toCodexServerConfig` 70-83, `mergeClaudeSettingsText` 97-139, `mergeCodexTomlText` 165-179) → `cli/core/types.ts` (`RegistryServer`, `TargetConfig`).
- Inspected the live project state in `ai-narratives` (`.agents/drwn/config.json`, `.agents/drwn/write-record.json`, `.agents/drwn/generated/cursor-mcp.json`) and the card source (`sources/@remyjkim/notion-token/card.json`).
- Researched the official docs for all three targets (citations in Appendix A), with explicit attention to env interpolation, transport declaration, and config-layer merge semantics. Two Codex behaviors are **undocumented**; they are flagged as such and the design is made independent of them.

### Finding evidence: the canonical model and the three emitters

`RegistryServer` (`cli/core/types.ts:7-19`) stores secrets as a raw env dict: `env?: Record<string, string>`. The card stores `env: { NOTION_TOKEN: "${NOTION_TOKEN}" }` — i.e., the `${VAR}` token convention is baked into the data, not derived per target.

Three render functions consume that model:

- `toJsonServerConfig` (`mcp.ts:55-68`) — Claude + Cursor. Emits `env` verbatim (line 60) and, for remote, `{ type: server.transport, url }`.
- `toCodexServerConfig` (`mcp.ts:70-83`) — Codex. Stdio branch emits `command/args/startup_timeout_sec` and **no env**. Remote branch emits `{ url, enabled: true }`.
- `mergeCodexTomlText` (`mcp.ts:165-179`) — strips **all** `[mcp_servers.*]` sections (`stripTomlSections`, line 168) and rewrites them; reads/merges only the target file, never the other Codex config layer.

### Grounded doc findings (what each target actually requires)

**Claude Code** (https://code.claude.com/docs/en/mcp):
- Project MCP config is `.mcp.json` (already corrected in task 47).
- `${VAR}` and `${VAR:-default}` **are expanded** in `command`, `args`, `env`, `url`, `headers`. Verbatim: *"Claude Code supports environment variable expansion in `.mcp.json` files ... `${VAR}` - Expands to the value of environment variable `VAR`."* → the harness's current Claude output is **correct**.
- Remote: `type: "http"` + `url` + `headers`. SSE deprecated.
- Cross-scope: *"The entire server entry from that source is used; fields are not merged across scopes."* → Claude does **not** deep-merge; no cross-layer collision risk.

**Cursor** (https://cursor.com/docs/mcp):
- Interpolation syntax is **`${env:NAME}`**, not bare `${NAME}`. Verbatim: *"Cursor resolves variables in these fields: `command`, `args`, `env`, `url`, and `headers`"* with syntax `${env:NAME}`. → the harness emitting `${NOTION_TOKEN}` to Cursor is **broken**: it is passed through literally.
- Remote: `url` (+ optional `headers`, inline `auth{}`); **no `type` field** in the schema. The harness's `type: server.transport` is non-idiomatic (Cursor selects transport by `url` presence).

**Codex** (https://developers.openai.com/codex/mcp, /config-reference, /config-basic):
- Stdio: `[mcp_servers.NAME]` `command`/`args`, plus an `env` table (literal forward) **and** `env_vars` array — *"Additional environment variables to whitelist for an MCP stdio server. String entries default to `source = "local"`"* — i.e., `env_vars = ["NOTION_TOKEN"]` forwards `NOTION_TOKEN` from Codex's own process environment into the subprocess. This is the doc-supported way to inject a secret.
- HTTP: `url` + `bearer_token_env_var` + `http_headers` + `env_http_headers`.
- `${VAR}` interpolation in config values: **undocumented / silent.** The docs provide *sourcing* mechanisms (`env_vars`, `bearer_token_env_var`, `env_http_headers`) but never describe `${}` expansion. Strong inference: a literal `NOTION_TOKEN = "${NOTION_TOKEN}"` is passed through unexpanded. → the design must **not** rely on `${}` for Codex; use `env_vars`.
- Config layering: both `~/.codex/config.toml` (user) and project `.codex/config.toml` load; closest-wins; project layers load only for trusted projects. The **per-table merge strategy** (deep-merge vs replace for `[mcp_servers.notion]` across layers) is **undocumented**. Empirically, the reported error (a table with both `command` and `url`) proves that for this case the layers' keys **coexist** rather than the project entry cleanly replacing the global one.
- `startup_timeout_sec` documented default is **10s**; the harness hardcodes 30 (an intentional, harmless override). `enabled` only matters when `false`; emitting `enabled = true` is redundant but harmless.

### The cross-target rendering matrix (the core of the problem)

A single canonical "env passthrough secret" must render three different ways; the harness renders one:

| Canonical intent | Claude `.mcp.json` | Cursor `mcp.json` | Codex `config.toml` |
|---|---|---|---|
| Forward env var `NOTION_TOKEN` | `env: { NOTION_TOKEN: "${NOTION_TOKEN}" }` | `env: { NOTION_TOKEN: "${env:NOTION_TOKEN}" }` | `env_vars = ["NOTION_TOKEN"]` |
| Literal value | `env: { K: "v" }` | `env: { K: "v" }` | `[mcp_servers.X.env]` `K = "v"` |
| HTTP bearer from env | `headers: { Authorization: "Bearer ${T}" }` | `headers: { Authorization: "Bearer ${env:T}" }` | `bearer_token_env_var = "T"` |
| Remote endpoint | `type: "http"`, `url` | `url` (no `type`) | `url` |

The harness emits the Claude column to all three. That is the root design flaw: **the token convention is data, not a per-target rendering decision.**

---

## Findings

1. **Codex stdio `env` is silently dropped** (`mcp.ts:70-83`). Any stdio server requiring a token (the entire reason the `@remyjkim/notion-token` card exists) is non-functional on Codex. Doc-grounded fix exists (`env_vars`).

2. **The `${VAR}` secret convention is Claude-specific but applied to all targets.** Cursor needs `${env:VAR}`; Codex needs `env_vars`/`bearer_token_env_var`. The Cursor output is **also broken today** (newly discovered during this investigation — broader than the original Codex-only report). The canonical model must store a *neutral* secret reference and let each adapter render it.

3. **No awareness of Codex's global+project config layering → transport collision** (`sync.ts:136-143,170-174`). The harness writes only the project `.codex/config.toml` and never inspects `~/.codex/config.toml`. When the same server name exists in the global layer with a different transport, Codex surfaces a `command`+`url` table error. Docs confirm both layers load; merge semantics are undocumented, so the design must **detect and avoid** rather than rely on merge behavior. (Claude Code is immune — it does not merge across scopes — so this is Codex-specific.)

4. **Codex TOML output has no drift protection and clobbers unmanaged servers.** `sync.ts:173` always records `fieldHashes: {}`; the TOML carries no managed marker (unlike Claude's `_drwn` block / `.mcp.json` contentHash). Consequently the harness cannot detect that its Codex output went stale after a registry/card change (exactly how the broken `${NOTION_TOKEN}` block survived the notion→HTTP migration), and `mergeCodexTomlText` strips **every** `mcp_servers.*` section (`mcp.ts:168`), silently destroying any server a user added by hand to that file.

5. **Registry/card transport divergence is invisible.** Registry `notion` = HTTP; card `notion` = stdio. The override is intentional, but nothing surfaces that the effective server disagrees with a same-named server already configured for the tool at another layer. This is the upstream cause of Finding 3 and should be handled by the same detection.

6. **Minor fidelity gaps**: Cursor receives a non-idiomatic `type` key; Codex `enabled = true` is redundant; Codex `startup_timeout_sec` default differs from docs (10s vs hardcoded 30) — keep the override but make it explicit/configurable.

---

## Recommendations

The unifying change: introduce a **neutral canonical secret/transport model** and a **per-target adapter** that renders it, plus **layer-aware Codex writes**. Implement in four increments, smallest-blast-radius first. Every increment is TDD: add a failing assertion to `test/sync-mcp.test.ts` (or a sibling) first.

### R1 — Codex env rendering + neutral env model (Findings 1, 2, 6)

Stop storing `${VAR}` as the canonical convention. Model env values as a tagged reference so each adapter renders correctly.

Canonical (extend `RegistryServer.env` handling — keep the JSON shape backward-compatible by interpreting the existing `${VAR}` string as a passthrough during a migration window):

```ts
// A value is either a literal or an env passthrough.
type EnvValue = { literal: string } | { fromEnv: string };
// Back-compat parse: "${NOTION_TOKEN}" -> { fromEnv: "NOTION_TOKEN" }; "abc" -> { literal: "abc" }.
```

Adapter rendering:

- **Claude** (`toJsonServerConfig`): `{ fromEnv: V }` → `"${V}"`; `{ literal }` → literal. (No behavior change for existing inputs.)
- **Cursor** (new `toCursorServerConfig`, split from the Claude renderer): `{ fromEnv: V }` → `"${env:V}"`; `{ literal }` → literal; drop the `type` key, emit `url`-only for remote.
- **Codex** (`toCodexServerConfig`): partition env into passthroughs → `env_vars = [...]`, and literals → `[mcp_servers.X.env]`. For HTTP servers with a bearer-from-env, emit `bearer_token_env_var`.

This single increment fixes the Codex (Finding 1) and Cursor (Finding 2) breakage and is fully doc-grounded (Appendix A). It does **not** depend on the two undocumented Codex behaviors.

Tests: assert Codex emits `env_vars = ["NOTION_TOKEN"]` (not an `env` table with `${}`); assert Cursor emits `${env:NOTION_TOKEN}`; assert Claude output is unchanged (regression guard).

### R2 — Codex cross-layer conflict detection (Findings 3, 5)

Before writing the project `.codex/config.toml`, read `~/.codex/config.toml` (path: `${homeDir}/.codex/config.toml`; parse with the already-present `smol-toml`). For each server the harness is about to write at project scope, if the global layer defines the same `[mcp_servers.NAME]` with a **different transport** (one has `command`, the other `url`), do not emit silently. Options, in order of preference:

1. **Warn + skip** that server at project scope and record a `SyncResult.warning` ("`notion` is defined as HTTP in ~/.codex/config.toml; skipping conflicting stdio project entry — remove the global entry or run `codex mcp login`").
2. Behind `--force`, emit anyway.

This is intentionally agnostic to Codex's undocumented merge strategy: whether Codex deep-merges or replaces, emitting two different transports for one name is never what the user wants, so detect-and-avoid is correct in both worlds. Claude/Cursor need no equivalent (no cross-scope merge).

Tests: with a fixture global `config.toml` containing HTTP `notion`, assert the project write warns and omits the stdio `notion`; with `--force`, asserts it emits.

### R3 — Codex drift tracking + non-destructive merge (Finding 4)

Two parts:

- **Drift detection.** Record a real hash of the managed `mcp_servers` section in `write-record.json` (replace the hardcoded `fieldHashes: {}` at `sync.ts:173`). On the next write, if the on-disk `mcp_servers` section hash differs from the recorded one, treat it as drift (same UX as Claude's `_drwn` drift error: redirect the user to `.agents/drwn/config.json` or `--force`). Keep the marker **out-of-band** (in `write-record.json`) rather than embedding a `[_drwn]` table in `config.toml`, because Codex's tolerance of unknown top-level tables in a precedence-merged file is not something we should bet on.
- **Non-destructive strip.** `stripTomlSections` should remove only the server names the harness manages (tracked set), not every `mcp_servers.*` section, so a hand-added Codex server survives a write.

Tests: write, hand-edit the managed section, re-write → expect drift error without `--force`; add an unmanaged `[mcp_servers.custom]`, re-write → assert it is preserved.

### R4 — Empirical validation of the two undocumented Codex behaviors (de-risking)

The design is built to not depend on these, but we should still confirm them to remove footguns and to inform user-facing docs:

1. **Does Codex expand `${VAR}` in an `env` value?** Method: a throwaway project `config.toml` with `[mcp_servers.probe.env] X = "${HOME}"` wrapping a server that echoes its env; observe literal vs expanded. Expected: literal (hence `env_vars` is mandatory).
2. **How does Codex merge `[mcp_servers.NAME]` across layers?** Method: define `notion` HTTP globally and stdio at project scope; run `codex mcp list`/startup and capture the error/merge. Expected: keys coexist (reproduces the reported `command`+`url` error), confirming R2's necessity.

Record results in a follow-up completion doc. If either expectation is wrong, only R2/R3 messaging changes — R1 stands.

### Sequencing

R1 (highest value, lowest risk, fully grounded) → R2 (prevents the exact reported error) → R3 (durability) → R4 can run in parallel any time. R1 alone makes the `@remyjkim/notion-token` card functional on Codex and Cursor.

---

## Open Questions

1. **Codex `${}` interpolation** — undocumented; R4.1 resolves empirically. Design is independent of the answer.
2. **Codex cross-layer table merge** — undocumented; R4.2 resolves empirically. Design (R2) is independent of the answer.
3. **`experimental_use_rmcp_client` / `[features].rmcp_client`** — older Codex versions may have gated HTTP transport behind this flag; current docs show HTTP as first-class. Do we need to support older Codex versions? If yes, the Codex HTTP adapter may need to emit the flag conditionally. Needs a target-version policy decision.
4. **Bearer-token canonical model for HTTP** — the registry type has no `headers`/`auth`/`bearerFromEnv` field today (only `url`, and an undocumented `auth: "oauth"` string in the JSON). R1's HTTP branch needs a small schema addition to carry bearer-from-env; scope this with the catalog owners.
5. **Migration of existing `${VAR}` env data** — interpret legacy `${VAR}` strings as `{ fromEnv: VAR }` during a deprecation window, or require a one-time card-source rewrite? Affects published cards like `@remyjkim/notion-token`.

---

## Appendix A — Citations

- Codex MCP & config: https://developers.openai.com/codex/mcp , https://developers.openai.com/codex/config-reference , https://developers.openai.com/codex/config-basic , https://developers.openai.com/codex/config-advanced , https://developers.openai.com/codex/config-sample ; per-project MCP gap: https://github.com/openai/codex/issues/13056 ; rmcp flag rename: https://github.com/openai/codex/issues/6995
- Claude Code MCP: https://code.claude.com/docs/en/mcp ; settings: https://code.claude.com/docs/en/settings
- Cursor MCP: https://cursor.com/docs/mcp (raw: https://cursor.com/docs/mcp.md)

## Appendix B — Key code references

- `cli/core/mcp.ts:55-68` `toJsonServerConfig` (Claude/Cursor; emits `${}` verbatim, `type` for remote)
- `cli/core/mcp.ts:70-83` `toCodexServerConfig` (drops env; `enabled=true`; `startup_timeout_sec` default 30)
- `cli/core/mcp.ts:141-163` `stripTomlSections` (strips all `mcp_servers.*`)
- `cli/core/mcp.ts:165-179` `mergeCodexTomlText` (single-file merge; no drift marker)
- `cli/core/sync.ts:136-143` `targetConfigPath` (project-scope paths; no global-layer awareness)
- `cli/core/sync.ts:170-174` Codex write (records `fieldHashes: {}`)
- `cli/core/types.ts:7-19` `RegistryServer` (raw `env` dict; no bearer/auth field)
- `cli/core/project.ts:69` whole-entry override (registry/card divergence origin)
- Live broken state: `ai-narratives/.agents/drwn/generated/cursor-mcp.json` (`NOTION_TOKEN: "${NOTION_TOKEN}"` — literal on Cursor)
