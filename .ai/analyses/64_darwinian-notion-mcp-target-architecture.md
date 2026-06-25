# ABOUTME: Target architecture for delivering Notion MCP integration through Darwinian Harness across Claude Code, Codex, and Cursor.
# ABOUTME: Defines card shape, auth model, drwn schema extensions required for each phase, and a staged build plan.

# Analysis 64 — Darwinian Harness · Notion MCP Target Architecture

**Date**: 2026-06-15
**Author**: Claude + Remy
**Status**: Draft
**References**: [.ai/analyses/63_notion_mcp_manual.md, .ai/analyses/35_notion_mcp_manual.md, cli/core/mcp.ts, cli/core/types.ts, cli/core/paths.ts, cli/core/sync.ts, registry/mcp-servers.json, .ai/knowledges/11_card-usage-guide.html]

---

## Executive Summary

We deliver Notion access to Claude Code, Codex, and Cursor by shipping a Darwinian Harness Card that wraps **Notion's official hosted MCP server** (`https://mcp.notion.com/mcp`). The card is the unit of distribution; `drwn write` translates it into each tool's native MCP config format. We do **not** build our own Notion MCP server in v1 — the official hosted one covers the workflows.

**Authoring is library-first, not card-first.** The Notion server definition lives once in `~/.agents/drwn/library/mcp.json` (via `drwn library add mcp`). Cards reference that library entry by id (`drwn card source add-mcp <card> notion`), which copies the JSON into the card's own `mcp-servers/notion.json`. The library is an authoring convenience, not a runtime link — published cards are self-contained.

Auth is delegated to each tool's own OAuth flow. Drwn writes the URL, not tokens. Tokens live in each tool's credential store (Claude Code's keychain, Codex's OAuth cache, Cursor's secure store). Drwn's job for auth is **observability** (surface auth state in `drwn status`), not **storage**.

Two drwn extensions are needed only when we move beyond hosted-OAuth:

1. **`headers` support on `RegistryServer`** — to ship bearer tokens for headless / CI usage. Small, ~50 LOC change spanning `types.ts`, `mcp.ts`, `mcp-library.ts`, and three writers.
2. **Per-project tool allowlists** (`enabled_tools`) — to constrain what Notion tools an agent can call inside a project. Belongs on `ServerOverride`. ~100 LOC plus writer support.

Both are deferred to Phases 3 and 2 respectively. Phase 1 ships with zero drwn changes.

A custom Darwinian Notion Gateway (the build path from memo 63) is explicitly deferred. We revisit it only if we need cross-workspace search, enterprise audit, or bearer-token auth at scale.

---

## Context

### The problem Remy raised

> "MCP configurations are not transferable between Claude Code, Codex, or Cursor. And that is why we want to use Darwinian Harness."

Today, a developer wiring Notion into three agents must:

- Run `claude mcp add --transport http notion https://mcp.notion.com/mcp` and authenticate via `/mcp`.
- Edit `~/.codex/config.toml` to add `[mcp_servers.notion]` and run `codex mcp login notion`.
- Edit Cursor's MCP config and authenticate via Cursor's MCP UI.

Three different config formats, three OAuth flows, three places to remember to add the server when bootstrapping a new project. Drwn already solves the **config format translation** problem for MCP servers (`cli/core/mcp.ts:55-83` shows the three render paths). What's needed is a **Notion-specific card** that uses that translator.

### What the mentor memos established

**Memo 63** (recommendation): The default move is to use Notion's official hosted MCP unless we need headless automation, enterprise gateway controls, or custom coding-agent workflows. If we build our own, we build one remote Streamable HTTP "Notion Agent Gateway," not per-client servers and not a raw API mirror. Tool surface should be small and high-level: `search`, `fetch`, plus a handful of safe writes. Two auth modes: OAuth (humans) and bearer (CI). Phased build: validate against official → read-only gateway → safe writes → resources/prompts → enterprise hardening.

**Memo 35** (handbook): Concrete per-tool setup steps for the hosted server. Claude Code uses `--transport http`, project-scope writes `.mcp.json`, user-scope is global. Codex stores MCP config in `~/.codex/config.toml` or `.codex/config.toml`. The hosted server requires OAuth and does not support bearer tokens. File uploads not supported. Rate limits: 180 req/min, 30 search/min, 3 req/sec per connection. Plan-gated capabilities (connected-source search needs Notion AI; `query_data_sources` needs Enterprise + AI).

### What drwn provides today

| Layer | Status | Code reference |
| --- | --- | --- |
| `RegistryServer` schema with `transport`, `command`, `args`, `env`, `url` | Present | `cli/core/types.ts:7-19` |
| MCP server bundling inside Harness Cards (`card.json.servers` + `mcp-servers/<id>.json`) | Present | `cli/core/card-source.ts:345-380`, `cli/commands/card/source/add-mcp.ts` |
| Per-tool config rendering: Claude (json-merge into `settings.json`), Codex (toml-merge into `config.toml`), Cursor (json-standalone via symlink) | Present | `cli/core/mcp.ts:55-91`, `cli/core/sync.ts:138-174` |
| `optional` flag for opt-in servers + project-level `optional[<name>] = true` toggle | Present | `cli/core/mcp.ts:40-51` |
| Drift detection on managed fields (rejects out-of-band edits) | Present | `cli/core/mcp.ts:104-110` |
| `headers` field for HTTP transports | **Missing** | n/a |
| `bearer_token_env_var` (Codex-native) | **Missing** | n/a |
| Per-project tool allowlist (`enabled_tools`) | **Missing** | n/a |
| OAuth credential storage / refresh | **Out of scope** — each tool handles | n/a |

### Decision: use the hosted server, ship via a card

We use `https://mcp.notion.com/mcp` and let each tool's MCP client OAuth against it. The card is what drwn delivers. No custom server, no proxy, no token storage in drwn.

This matches memo 63's first decision ("probably use Notion's official remote MCP server"). The Darwinian value-add is **multi-tool config delivery + workflow skills**, not a competing server.

---

## Target Architecture

### Layer diagram

```
            +----------------------------------------------------+
            |  Card source: @darwinian/notion (authoring)        |
            |  ~/.agents/drwn/sources/@darwinian/notion/         |
            |    card.json (servers.notion ref + skills.include) |
            |    mcp-servers/notion.json (canonical server spec) |
            |    skills/<workflow>/SKILL.md (curated patterns)   |
            +----------------------------------------------------+
                                |
                                | drwn card publish + push
                                v
            +----------------------------------------------------+
            |  Distribution: bare repo @ ~/.agents/drwn/cards/   |
            |    + extracted snapshot @ ~/.agents/drwn/extracted |
            |    + optional GitHub remote (private OK)           |
            +----------------------------------------------------+
                                |
                                | drwn card apply / card add (per project)
                                v
            +----------------------------------------------------+
            |  Project state: <project>/.agents/drwn/            |
            |    config.json + card.lock                         |
            +----------------------------------------------------+
                                |
                                | drwn write
                                v
   +------------------+  +---------------------+  +-----------------+
   | .claude/settings | | .codex/config.toml  | | .cursor/mcp.json|
   | mcpServers field | | [mcp_servers.notion]| | mcpServers field|
   | type=http, url=…|  | url = …             | | type=http, url=…|
   +------------------+  +---------------------+  +-----------------+
                                |
                                | First use per tool
                                v
   +-----------------------------------------------------------------+
   | Per-tool OAuth flow → tokens in each tool's own credential store|
   | (Claude keychain, Codex OAuth cache, Cursor secure store)       |
   +-----------------------------------------------------------------+
                                |
                                v
                  https://mcp.notion.com/mcp (Notion's hosted server)
```

### The Notion card — concrete content

**Card name:** `@darwinian/notion` (matches the existing `@darwinian/harness-skills` naming).

**`card.json`:**

```json
{
  "name": "@darwinian/notion",
  "version": "1.0.0",
  "description": "Notion workspace access for Claude Code, Codex, and Cursor via the official hosted MCP server, plus curated workflow skills for coding agents.",
  "skills": {
    "include": [
      "notion-pull-spec",
      "notion-task-implement",
      "notion-pr-summary-sync",
      "notion-release-notes"
    ]
  },
  "servers": {
    "notion": {
      "description": "Notion workspace access via official hosted MCP server.",
      "transport": "http",
      "url": "https://mcp.notion.com/mcp",
      "optional": false,
      "notes": "Requires per-tool OAuth on first use. See drwn status --why notion for auth state per tool."
    }
  }
}
```

**`mcp-servers/notion.json`** (must match `card.json.servers.notion` byte-for-byte or `card source doctor` flags divergence — `card-source.ts:367-369`):

```json
{
  "description": "Notion workspace access via official hosted MCP server.",
  "transport": "http",
  "url": "https://mcp.notion.com/mcp",
  "optional": false,
  "notes": "Requires per-tool OAuth on first use. See drwn status --why notion for auth state per tool."
}
```

**Skills (curated workflow patterns, Phase 2):**

Each skill is a SKILL.md prompt body that names the Notion MCP tools to call. The skills don't ship code — they're trigger-spec'd prompts that lean on the MCP tool surface.

- `notion-pull-spec` — "Fetch and summarize the spec/PRD/task for this project. Uses `notion-search` + `notion-fetch`."
- `notion-task-implement` — "Implement a task from a Notion page. Fetch → implement → propose status update via `notion-update-page`."
- `notion-pr-summary-sync` — "After a PR is opened, write a brief comment to the linked Notion task via `notion-create-comment`."
- `notion-release-notes` — "Diff last release tag to HEAD, draft release notes as a new Notion page via `notion-create-pages`."

These four are starter content. Add more as patterns stabilize.

### Authoring pattern: library-first, embedded-per-card

We do **not** hand-write `mcp-servers/notion.json` and the matching `card.json.servers.notion` entry in each card we want to ship Notion in. Drwn provides a two-step pattern that is dramatically less error-prone: register the server definition **once** in the local MCP library, then **reference it by id** from each card.

#### Step 1 — Register Notion in the library (one-time, machine-wide)

```bash
cat > /tmp/notion-mcp.json <<'EOF'
{
  "description": "Notion workspace access via official hosted MCP server.",
  "transport": "http",
  "url": "https://mcp.notion.com/mcp",
  "optional": false,
  "notes": "Requires per-tool OAuth on first use (Claude /mcp, codex mcp login notion, Cursor MCP settings)."
}
EOF

drwn library add mcp /tmp/notion-mcp.json --as notion
```

What happens under the hood (`cli/commands/library/add/mcp.ts` + `cli/core/mcp-library.ts`):

- `loadMcpLibrary` reads `~/.agents/drwn/library/mcp.json` (initialized empty if absent).
- The entry is validated via `validateMcpLibraryServer` — checks transport + command/args/url consistency.
- The entry is written back under the id `notion` via `saveMcpLibrary`.
- **Nothing is activated.** Neither machine defaults nor any project state changes. The id `notion` is now resolvable in subsequent drwn commands.

The command output prints the two natural next steps so you can choose your surface:

- `drwn library defaults add mcp notion` — activate machine-wide (every project on this machine gets it).
- `drwn add mcp notion` — activate in just the current project (no card needed).
- *(implicit)* `drwn card source add-mcp <card> notion` — bundle into a card for distribution.

#### Step 2 — Reference the library entry from each card (per card)

```bash
drwn card source add-mcp @darwinian/notion notion
drwn card source add-mcp @darwinian/research-card notion
drwn card source add-mcp @darwinian/team-ops notion
```

What happens under the hood (`addCardSourceMcp` in `cli/core/card-source.ts`):

- The id `notion` is resolved via `loadMcpLibrary` → finds the entry registered in Step 1.
- The full JSON is **copied** into `sources/<scope>/<card>/mcp-servers/notion.json`.
- The same JSON is mirrored into `card.json.servers.notion` (the `card source doctor` invariant — these must match byte-for-byte; `card-source.ts:367-369`).

After this, each card is **self-contained**. Its `mcp-servers/notion.json` is its own copy on disk. The library was a resolver convenience at authoring time, not a runtime link.

#### The trade-off this creates

Because the library reference is resolved at authoring time, **library updates do not propagate to existing cards**. To roll forward, re-run `add-mcp --replace` on each card, bump its version, and republish:

```bash
# 1. Update the library entry.
drwn library add mcp /tmp/notion-mcp-v2.json --as notion --replace

# 2. Re-bake into each card.
drwn card source add-mcp @darwinian/notion notion --replace
drwn card source set @darwinian/notion --version 1.1.0
drwn card publish @darwinian/notion
drwn card push @darwinian/notion

# Repeat for each card that ships notion.
```

Manageable for 2–5 cards. Tedious for dozens. If we end up with many cards shipping the same server entry, we'd want a `drwn library cards refresh-mcp <id>` ergonomic that walks all card sources and re-runs `add-mcp --replace` automatically. Treat as a deferred drwn enhancement — not a blocker at our current scale.

#### When to use a card vs a machine default vs both

| Pattern | Setup | Surface | Use when |
| --- | --- | --- | --- |
| **Machine default only** | `library add mcp` + `library defaults add mcp notion` | Every drwn-managed project on the machine | Personal use; Notion should "just be there" regardless of cards |
| **Card only** | `library add mcp` + `card source add-mcp` per card | Projects that apply the card | Team distribution; per-card workflow bundling; per-project scoping |
| **Hybrid** | `library add mcp` + `library defaults` + `card source add-mcp` per card | Both layers; cards win on conflict | Solo + team usage; cards add Notion-specific skills that the bare machine default lacks |

The resolver picks card-provided over machine-default when both are present (same layering rule as skills, `card-skill-resolver.ts:31-65`). Hybrid is safe — not a conflict.

#### Visual: where the JSON actually lives

```
[Step 1: library add mcp]
        |
        v
  ~/.agents/drwn/library/mcp.json
    { servers: { notion: {...} } }
        |
        |  resolved at card-source-add-mcp time
        v
  ~/.agents/drwn/sources/@scope/card-a/
    card.json (servers.notion = {...copy...})
    mcp-servers/notion.json    (byte-equal copy)
        |
        |  drwn card publish + drwn card apply + drwn write
        v
  <project>/.claude/settings.json    mcpServers.notion = { type: "http", url: ... }
  <project>/.codex/config.toml       [mcp_servers.notion] url = "..."
  <project>/.cursor/mcp.json         mcpServers.notion = { type: "http", url: ... }
        |
        |  per-tool OAuth on first use
        v
  https://mcp.notion.com/mcp
```

### Auth model

The auth model is the load-bearing design choice. Three modes, two deferred.

#### Mode 1 — OAuth via official hosted MCP (Phase 1, default)

How it actually works:

1. **Install time** (`drwn apply @darwinian/notion` + `drwn write`):
   - Drwn writes `mcpServers.notion = { type: "http", url: "https://mcp.notion.com/mcp" }` into `.claude/settings.json`.
   - Drwn writes `[mcp_servers.notion] url = "..." enabled = true` into `.codex/config.toml`.
   - Drwn writes `mcpServers.notion = { type: "http", url: "..." }` into `.cursor/mcp.json`.
   - **No tokens involved yet.**

2. **First-use auth per tool** (one-time, per developer, per tool):
   - **Claude Code**: developer runs `/mcp` inside Claude Code → selects `notion` → browser OAuth → tokens stored in Claude Code's credential store.
   - **Codex**: developer runs `codex mcp login notion` → browser OAuth → tokens stored in Codex's OAuth cache.
   - **Cursor**: developer opens Cursor's MCP settings, clicks authenticate for `notion` → browser OAuth → tokens in Cursor's secure store.

3. **Runtime**: each tool's MCP client attaches the OAuth token to requests. Drwn is not in the request path.

4. **Token lifecycle**: each tool handles refresh independently. If revoked at Notion, the user re-auths in each tool. Drwn doesn't proxy or sync tokens.

**Drwn's responsibilities in this mode:**

- **Deliver the same URL to all three tools** via the card → `drwn write` pipeline. ✓ already works.
- **Make auth status observable**. New surface to add: `drwn status --why notion` should call each tool's MCP runtime status (or its config + a known-good ping path) and report `{ tool: connected | needs-login | error }`. Implementation: shell out to `claude mcp get notion`, parse `codex` status if available, inspect Cursor's auth state file. ~150 LOC across `cli/core/diagnostics.ts` and `cli/commands/status.ts`.
- **`drwn doctor`** should flag a connected server whose auth has fallen out of date (e.g., 401 on a test ping). Belongs in the same diagnostic pass.

**Pros**: zero token handling on drwn's side, follows the principle that drwn manages config (not secrets), each tool's existing OAuth UX is preserved.

**Cons**: developer has to authenticate three times per machine (once per tool). This is intrinsic to MCP's auth model, not a drwn limitation. Mentor memo 63 confirms: "MCP authorization is defined at the HTTP transport level."

#### Mode 2 — Bearer token for headless / CI (Phase 3)

When this matters: a cloud-running agent needs Notion access with no human in the loop. Memo 35 calls out that hosted Notion MCP **does not support bearer tokens** — only OAuth. So Mode 2 requires either:

- **Path A**: Notion's deprecated open-source local MCP server with a Notion internal integration token (memo 63 flags this as "no longer actively monitored").
- **Path B**: A custom Darwinian Notion Gateway (per memo 63) that accepts bearer tokens and re-issues per-user permissions internally.

Either path needs **drwn schema extensions**:

```ts
// proposed addition to cli/core/types.ts
export interface RegistryServer {
  // ... existing fields ...
  headers?: Record<string, string>;          // Static headers
  bearerTokenEnvVar?: string;                // Codex-native; render as bearer_token_env_var
  enabledTools?: string[];                   // Project-allowed tool subset
}
```

Writer changes (`cli/core/mcp.ts`):

- `toJsonServerConfig` (Claude/Cursor): add `headers` pass-through for HTTP transports.
- `toCodexServerConfig`: add `headers`, `bearer_token_env_var`, `enabled_tools` pass-through.

Token resolution: drwn writes the env var **name**, not the value. The tool's runtime reads the value from the environment at MCP-client invocation time. This keeps secrets out of drwn config + lockfile + git history.

Card spec for bearer mode:

```json
{
  "name": "@darwinian/notion-headless",
  "version": "1.0.0",
  "servers": {
    "notion": {
      "transport": "http",
      "url": "https://gateway.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:NOTION_BEARER_TOKEN}"
      },
      "bearerTokenEnvVar": "NOTION_BEARER_TOKEN",
      "optional": false
    }
  }
}
```

The literal `${env:NAME}` syntax is rendered as-is into Claude/Cursor MCP configs (Claude Code does shell-expansion at runtime). For Codex, the explicit `bearer_token_env_var` field is preferred. Per-tool nuance handled at the writer.

**Important**: this card is **separate** from `@darwinian/notion`. Two distinct distribution units, two distinct decisions per project. Don't conflate Mode 1 and Mode 2.

#### Mode 3 — Per-project tool allowlist (Phase 2)

Independent of which auth mode is used. Some projects should only get read tools; others get safe writes; admin tools off by default.

Schema addition (project overlay):

```ts
// project config.json
{
  "cards": ["@darwinian/notion@^1.0.0"],
  "serverOverrides": {
    "notion": {
      "enabledTools": ["notion-search", "notion-fetch", "notion-get-comments"]
    }
  }
}
```

Writer changes:

- **Codex**: emit `enabled_tools = [...]` into `[mcp_servers.notion]`. Codex enforces it natively (memo 35).
- **Claude Code**: no native `enabled_tools` per server in `settings.json` today. Best effort: surface the allowlist as a per-skill instruction or rely on Claude Code's `/permissions` system. Document the gap.
- **Cursor**: similar story; no native allowlist. Document and degrade gracefully.

Until Claude Code and Cursor add native allowlist support, **Codex is the only target where the allowlist is enforced at the transport layer**. The other two are advisory.

Add a `drwn status --why notion --tools` to make the allowlist visible per project regardless.

### What drwn writes — per-tool format reference

For `@darwinian/notion@1.0.0` applied to a project, `drwn write` produces:

**`<project>/.claude/settings.json`** (managed `mcpServers` field, drift-protected):

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

**`<project>/.codex/config.toml`** (managed `mcp_servers` table, drift-protected):

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
```

**`<project>/.cursor/mcp.json`** (full file owned by drwn, symlinked from `.agents/drwn/generated/cursor-mcp.json`):

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

User scope vs project scope: drwn supports both via `drwn library defaults add mcp notion` (machine-wide) versus `drwn card add @darwinian/notion` (project-only). For most cases, machine-wide is right — one OAuth per tool, all projects benefit. The card mechanism supports either.

---

## Phased Implementation Plan

### Phase 1 — Ship hosted-OAuth card (no drwn changes required)

Goal: a developer can `drwn apply @darwinian/notion`, run `drwn write`, complete OAuth in each tool once, and use Notion uniformly.

Concrete tasks (library-first, in order):

1. **Register Notion in the local MCP library.** Write `/tmp/notion-mcp.json` per the spec in "Authoring pattern" above, then:
   ```bash
   drwn library add mcp /tmp/notion-mcp.json --as notion
   ```
2. **Smoke-test the library entry on its own** before involving a card:
   ```bash
   # Option A: try it machine-wide
   drwn library defaults add mcp notion --dry-run --json
   # Option B: try it in a scratch project without any card
   cd /tmp/notion-test-project && drwn init --non-interactive
   drwn add mcp notion
   drwn write --dry-run --json
   ```
   This proves the JSON renders correctly into all three tools' formats before we bake it into a card.
3. **Create the card source**: `drwn card new @darwinian/notion --no-git`.
4. **Set description**: `drwn card source set @darwinian/notion --description "Notion workspace access for Claude Code, Codex, and Cursor via the official hosted MCP, plus curated workflow skills."`
5. **Reference the library entry from the card**:
   ```bash
   drwn card source add-mcp @darwinian/notion notion
   ```
   This populates `mcp-servers/notion.json` + `card.json.servers.notion` from the library entry — no hand-editing of either file.
6. **Stage and add the 4 starter skills** (`notion-pull-spec`, `notion-task-implement`, `notion-pr-summary-sync`, `notion-release-notes`) via `drwn card source add-skill --from <staging>` per skill.
7. **Validate source**: `drwn card source doctor @darwinian/notion --json` (must be `ok: true`, zero issues, server `byte-equal` between manifest and bundled JSON).
8. **End-to-end test against a scratch project**:
   ```bash
   cd /tmp/notion-card-test && drwn init --non-interactive
   drwn card apply file:$HOME/.agents/drwn/sources/@darwinian/notion
   drwn write --dry-run --json    # confirm all three tools get the URL
   drwn write
   ```
   Restart each tool, complete OAuth, smoke-test `notion-search`.
9. **Publish**: `drwn card publish @darwinian/notion`.
10. **Decide remote**: `gh repo create darwinian/notion --private` + `drwn card remote add` + `drwn card push @darwinian/notion`.

**Acceptance**: a fresh project gets Notion-in-all-three-tools with one `drwn card add @darwinian/notion@^1.0.0` + one `drwn write` + three OAuth flows. No card-side or drwn-side code changes.

**What we deliberately did not do**: write `mcp-servers/notion.json` by hand into the card source. The library is the canonical authoring surface — the card is the distribution wrapper.

### Phase 2 — `drwn status --why notion` shows auth state per tool

Goal: developers can see at a glance which tool is authenticated, which needs login.

Concrete tasks:

1. Add a diagnostics probe in `cli/core/diagnostics.ts` that for each target:
   - Reads the tool's MCP config to confirm `notion` is registered.
   - Probes the tool's auth state. For Claude Code: `claude mcp get notion --json` reports a `status` field. For Codex: parse `codex mcp status notion` or attempt a connect ping. For Cursor: read its credential store (or rely on absence of a known-good response).
2. Surface in `drwn status --why notion`:
   ```text
   notion (MCP server, via card @darwinian/notion@1.0.0)
     claude:  connected
     codex:   needs login → run: codex mcp login notion
     cursor:  needs login → open Cursor MCP settings
   ```
3. Add a `drwn doctor` check that warns if any target is configured-but-unauthenticated for > 7 days (configurable). Surface as a low-severity diagnostic, not a hard error.

Drwn changes:

- `cli/core/diagnostics.ts` — new auth-state probe (~150 LOC).
- `cli/commands/status.ts` — new `--why <server>` formatter for MCP entries.
- No schema changes.

### Phase 3 — Project-level tool allowlist

Goal: a project can restrict Notion to read-only or to a specific subset of tools.

Concrete tasks:

1. Extend `RegistryServer` (or `ServerOverride`) with `enabledTools?: string[]` (`cli/core/types.ts`).
2. Extend `toCodexServerConfig` to emit `enabled_tools` (`cli/core/mcp.ts:70-83`).
3. Document Claude Code and Cursor as advisory-only on this surface for now. Track upstream support.
4. Add `drwn card source set` flag and project-overlay schema in `config.json`.
5. Smoke-test: a project with `enabledTools: ["notion-search", "notion-fetch"]` should not see the write tools in Codex.

Drwn changes: ~100 LOC, plus tests, plus a knowledge doc for the per-tool support matrix.

### Phase 4 — Bearer-token / headless mode

Goal: CI / headless agents can use Notion without an interactive OAuth flow.

Prerequisite: a bearer-supporting endpoint. Options:

- **A**: Use Notion's deprecated local OSS server with a Notion integration token. Run it inside CI containers.
- **B**: Stand up a Darwinian Notion Gateway per memo 63's design.

Option B is significantly more work but is the right long-term answer if we're serious about cross-workspace, policy-controlled, audited Notion access for fleets of agents.

Drwn changes (needed for both A and B):

1. `RegistryServer.headers?: Record<string, string>` and `bearerTokenEnvVar?: string` in `cli/core/types.ts`.
2. Writer pass-through in `toJsonServerConfig` and `toCodexServerConfig` (`cli/core/mcp.ts`).
3. Env-var literal preservation (don't expand `${env:NAME}` in drwn — let the tool runtime do it; Codex prefers the explicit `bearer_token_env_var` form).
4. Validation: when a server has both `transport: http` and `headers.Authorization`, drwn should warn during `card source doctor` that the user is opting into a bearer-token contract.
5. Ship a separate card `@darwinian/notion-headless` for this; don't conflate with the OAuth flow.

### Phase 5 — Custom Darwinian Notion Gateway (deferred)

Only build if we hit memo 63's "build your own" gate:

- Headless automation at scale.
- Enterprise gateway controls (allowlists, audit logs, approval policies).
- Custom coding-agent workflows.
- Better search/ranking/caching than raw Notion.
- Truly unified server across many agents with consistent tool names.

Until then, the hosted server + drwn card is enough.

---

## Open Questions

1. **Card namespace ownership**: do we ship under `@darwinian/notion` (org-style, mirroring `@darwinian/harness-skills`) or `@remyjkim/notion` (personal)? Org-style is the right choice if this is meant to be the canonical Darwinian Notion card; personal if Remy wants to iterate without a public commitment yet.

2. **Skill naming**: is `notion-task-implement` clear, or should we mirror Notion's own tool-name prefix (`notion-`) more consistently? Affects auto-trigger quality.

3. **Status probe protocol per tool**: does `claude mcp get notion --json` actually expose an auth-state field today, or do we need to issue a no-op tool call and inspect the result? Same question for Codex and Cursor. Phase 2 needs an empirical check before we write the diagnostics code.

4. **Should we ship a card-level README**? Existing cards don't have one (e.g., `@darwinian/harness-skills` keeps everything in `card.json.description`), but Notion-specific OAuth setup has enough per-tool nuance that a README would help. Trade-off: card sources are git-trackable but consumers don't see a rendered README at apply time.

5. **`drwn library defaults add mcp notion` vs `drwn card add`**: for a single-developer scenario, the machine-wide default is simpler. For multi-tenant teams or when scoping by project matters, card-based is right. Recommend defaults for personal, card for shared/team. Worth documenting in the card's description.

6. **Drift between `card.json.servers.notion` and `mcp-servers/notion.json`**: drwn enforces these match byte-for-byte (`card-source.ts:367-369`). For our card, both contain identical JSON. Fine, but adds a small maintenance tax — any edit needs both files updated. Worth a `card source set-server` ergonomic in a future drwn change.

---

## Appendix A — Per-tool config reference

What each tool needs in its own format, for the hosted Notion MCP, derived from memo 35 and the drwn writers:

**Claude Code** — `~/.claude/settings.json` or `.claude/settings.json` (drwn-managed `mcpServers` field):

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

First-use: open Claude Code, run `/mcp`, select `notion`, complete browser OAuth.

**Codex** — `~/.codex/config.toml` or `.codex/config.toml` (drwn-managed `[mcp_servers]` table):

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
startup_timeout_sec = 30
```

First-use: `codex mcp login notion`, complete browser OAuth.

Optional hardening (Phase 3):

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
enabled_tools = ["notion-search", "notion-fetch", "notion-get-comments"]
default_tools_approval_mode = "prompt"
tool_timeout_sec = 60
```

**Cursor** — `~/.cursor/mcp.json` or `.cursor/mcp.json` (drwn writes full file, symlinked from `.agents/drwn/generated/cursor-mcp.json`):

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

First-use: open Cursor → MCP settings → authenticate `notion`.

## Appendix B — Quick command reference for this card

### One-time library setup (machine-wide)

```bash
cat > /tmp/notion-mcp.json <<'EOF'
{
  "description": "Notion workspace access via official hosted MCP server.",
  "transport": "http",
  "url": "https://mcp.notion.com/mcp",
  "optional": false,
  "notes": "Requires per-tool OAuth on first use."
}
EOF
drwn library add mcp /tmp/notion-mcp.json --as notion

# Optional sanity check: render into a throwaway project, no card yet.
mkdir -p /tmp/notion-lib-check && cd /tmp/notion-lib-check
drwn init --non-interactive
drwn add mcp notion
drwn write --dry-run --json   # confirms claude/codex/cursor rendering
```

### Author the card (uses the library entry)

```bash
drwn card new @darwinian/notion --no-git
drwn card source set @darwinian/notion --description "Notion workspace access for Claude Code, Codex, and Cursor via the official hosted MCP, plus curated workflow skills."

# Add the MCP from the library — drwn copies the bytes into the card source.
drwn card source add-mcp @darwinian/notion notion

# Add the 4 starter skills (staged under /tmp/staging/<skill>/SKILL.md):
drwn card source add-skill @darwinian/notion notion-pull-spec --from /tmp/staging/notion-pull-spec
drwn card source add-skill @darwinian/notion notion-task-implement --from /tmp/staging/notion-task-implement
drwn card source add-skill @darwinian/notion notion-pr-summary-sync --from /tmp/staging/notion-pr-summary-sync
drwn card source add-skill @darwinian/notion notion-release-notes --from /tmp/staging/notion-release-notes

drwn card source doctor @darwinian/notion --json
```

### Re-use the same MCP across multiple cards

```bash
# Same library entry, different cards. Each call copies the JSON.
drwn card source add-mcp @darwinian/research-card notion
drwn card source add-mcp @darwinian/team-ops notion
# ... etc.
```

### Distribute

```bash
drwn card publish @darwinian/notion
gh repo create darwinian/notion --private
drwn card remote add @darwinian/notion git@github.com:darwinian/notion.git
drwn card push @darwinian/notion
```

### Consume in a project

```bash
cd <project>
drwn init                                          # if needed
drwn card add @darwinian/notion@^1.0.0
drwn write --dry-run --json
drwn write

# Per-tool OAuth (once per developer per tool):
#   Claude Code: /mcp inside the session
#   Codex:       codex mcp login notion
#   Cursor:      MCP settings → authenticate
```

### Update the Notion definition later

```bash
# 1. Replace the library entry.
drwn library add mcp /tmp/notion-mcp-v2.json --as notion --replace

# 2. Re-bake into every card that ships it. Bump versions; republish.
for card in @darwinian/notion @darwinian/research-card @darwinian/team-ops; do
  drwn card source add-mcp "$card" notion --replace
  drwn card source set "$card" --version 1.0.1
  drwn card publish "$card"
  drwn card push "$card"
done

# Consumers refresh:
cd <project>
drwn card update
drwn write
```

### Diagnose

```bash
drwn library list mcp           # see what's in your library
drwn library show notion        # see the registered definition
drwn card status --json         # see what cards are applied + their MCPs
drwn status --why notion        # (Phase 2: per-tool auth state)
drwn doctor                     # surfaces stale auth + drift
```

## Appendix C — Why not just use machine defaults?

`drwn library defaults add mcp notion` is simpler than a card for a solo developer. Trade-offs:

| Aspect | Card (`@darwinian/notion`) | Machine default |
| --- | --- | --- |
| Versioning | Pinned, `card.lock`, `card outdated` checks | None, latest-always |
| Sharing across machines | Push to GitHub, others `drwn card add` | Manual, each machine edits its own machine.json |
| Per-project scoping | Yes — only projects that `card add` see it | No — every project on the machine sees it |
| Project-level tool allowlist | Possible (Phase 3) | Harder to express |
| Provenance via `drwn status --why` | Card name attribution | "machine default" |
| Update flow | `card publish` + `card update` | Edit machine.json + `drwn write` |

For Remy's case (multi-tool config delivery is the value-add, may want per-project scoping later), **card is the right primary mechanism**. Machine defaults are a fine escape hatch for "I want Notion in every drwn-managed project, period" — they layer underneath and don't conflict with the card.
