# ABOUTME: Step-by-step manual for adding Notion MCP tooling to any repo for Claude Code, Codex, or Cursor.
# ABOUTME: Covers the official hosted Notion MCP server, three install paths, OAuth identity pitfalls, and verification.

# Notion MCP Setup Guide

**Category**: Reference
**Tags**: notion, mcp, claude-code, codex, cursor, oauth, setup
**Last Updated**: 2026-05-24
**References**: [analyses/35_notion_mcp_manual.md, registry/mcp-servers.json, cli/core/mcp.ts]

---

## Overview

Notion MCP lets a coding agent (Claude Code, Codex, Cursor) read and write to a Notion workspace using OAuth-bound user access. The recommended endpoint is the **official hosted server** at `https://mcp.notion.com/mcp`. Do not install multiple Notion MCP servers — pick one path and stick with it.

There are three valid setup paths. Pick the one that matches the coworker's stack, not all of them.

| Path | Best for | Repo-level config? | Cross-project? |
| --- | --- | --- | --- |
| **A. Claude.ai connector** | Claude Code users on a Claude.ai plan | No | Yes (per Claude.ai account) |
| **B. Direct CLI install** | Claude Code or Codex without harness | No (user scope) or `.mcp.json` (project scope) | Configurable |
| **C. bgng harness sync** | Repos using `bgng` / `sync-mcp.ts` | Yes (`registry/mcp-servers.json` + `optional.notion`) | Per-repo |

---

## Prerequisites

- A Notion account that is a member of the target workspace.
- The target client installed: Claude Code, Codex CLI, or Cursor.
- A browser session logged into Notion **as the account you want bound to the MCP integration**. This matters — OAuth binds to whatever Notion account is signed in at consent time.

---

## Path A — Claude.ai connector (Claude Code only)

If the coworker uses Claude Code and has a Claude.ai account, this is the lowest-friction option. Tools surface as `mcp__claude_ai_Notion__*` across every project automatically. No repo changes.

1. Open https://claude.ai → **Settings → Connectors**.
2. Find **Notion** and click **Connect**.
3. Confirm in the browser OAuth flow as the correct Notion account.
4. Restart Claude Code in any session you want the connector active in.

That path is what's currently working in `beginning-harness`. The harness's own `notion` registry entry (Path C) does not drive Claude Code's MCP runtime in current versions — `claude mcp list` reads from `~/.claude.json` and platform connectors, not `~/.claude/settings.json mcpServers`. For Claude Code, the connector is the supported path. The harness entry remains useful for Codex and Cursor.

**Skip Paths B and C if Path A meets the need.**

---

## Path B — Direct CLI install

### Claude Code (user scope, all projects)

```bash
claude mcp add --transport http notion --scope user https://mcp.notion.com/mcp
```

### Claude Code (project scope, committed to repo)

```bash
cd /path/to/repo
claude mcp add --transport http notion --scope project https://mcp.notion.com/mcp
```

Creates a `.mcp.json` at the repo root that the coworker can commit. Expected shape:

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

### Codex CLI (user scope)

Edit `~/.codex/config.toml` and add:

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
```

Then authenticate:

```bash
codex mcp login notion
```

### Codex CLI (project scope)

Same TOML block in `.codex/config.toml` at the repo root. Codex only loads project config for trusted projects.

### Cursor

Edit `~/.cursor/mcp.json`:

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

Restart Cursor, then trigger the OAuth flow from Cursor's MCP UI.

---

## Path C — bgng harness sync (only if the target repo uses bgng)

If the coworker's repo already uses the `bgng` harness (i.e., has `registry/mcp-servers.json`, `sync-mcp.ts`, and `registry/config.json`):

1. **Confirm the registry entry exists.** In `registry/mcp-servers.json`:

   ```json
   "notion": {
     "description": "Notion workspace access via the official hosted MCP server",
     "transport": "http",
     "url": "https://mcp.notion.com/mcp",
     "auth": "oauth",
     "notes": "OAuth per user. After sync, run /mcp in Claude Code or `codex mcp login notion` to authenticate.",
     "optional": true
   }
   ```

   If absent, add it. The renderer in `cli/core/mcp.ts` must emit `{ type: "http", url }` for JSON targets and `{ url, enabled: true }` for Codex TOML. If your repo's harness predates that fix, both `slack` and `notion` http entries will be emitted without `type` / `enabled` and will not connect properly.

2. **Opt in.** In `registry/config.json`, set:

   ```json
   "optional": {
     "notion": true
   }
   ```

3. **Sync.**

   ```bash
   bun sync-mcp.ts --mcp-only
   ```

   Verify the emitted files contain a `notion` block in the expected shape:
   - `~/.claude/settings.json` — `mcpServers.notion: { type: "http", url: "..." }` (note: as observed, current Claude Code does not appear to consume this path; Path A or B is the working route for Claude Code).
   - `~/.codex/config.toml` — `[mcp_servers.notion]` with `url` and `enabled = true`.
   - `~/.cursor/mcp.json` (or its symlink target) — `notion: { type: "http", url: "..." }`.

4. **Authenticate per client** (see Authentication section below).

---

## Authentication

Notion MCP uses OAuth. There is no bearer-token mode for the hosted server.

**Critical pre-step:** open `notion.so` in the same browser you'll use for OAuth and confirm you're logged in as the intended account. The OAuth flow uses whatever Notion session is active in that browser. A stale or wrong-account login is the most common cause of the connector ending up bound to the wrong identity — see Pitfalls below.

| Client | Trigger |
| --- | --- |
| Claude Code (Path A) | claude.ai → Settings → Connectors → Notion → Connect |
| Claude Code (Path B/C) | In a session, run `/mcp`, select `notion`, complete OAuth |
| Codex | `codex mcp login notion` |
| Cursor | Cursor's MCP UI prompts on first use |

---

## Verification

Always verify identity *before* using Notion MCP for any real work. From the agent:

1. Call `notion-get-self` (or `notion-get-users` with `user_id: "self"`). Confirm `name` and `email` match the intended account.
2. Call `notion-get-teams`. Confirm the **joined** team(s) include the target workspace.
3. Do a benign read: `notion-search` with a known query and `page_size: 3`. Confirm results come back from the right workspace.
4. Do a benign write into a known shared parent page: `notion-create-pages` with `parent: { type: "page_id", page_id: "..." }`. Confirm the URL resolves in a separate browser logged in as the intended account.

If any of steps 1–4 reveal the wrong identity, do not proceed with writes. Fix the OAuth binding first (see Pitfalls).

---

## Workspace and parent-page conventions

- **Default parent is private.** `notion-create-pages` without a `parent` creates a workspace-level page in the authenticated user's **Private** section. Other workspace members cannot see it. Avoid this default for any page intended to be shared.
- **Always specify a shared parent for shared work.** Use `parent: { type: "page_id", page_id: "<id>" }` pointing at a page anyone on the team can already access. The new page inherits the parent's permissions.
- **Database rows are valid parents.** A page that is itself a row inside a database can still parent a child sub-page. The child appears as a sub-page attached to that row.
- **For database inserts**, fetch the database first, get its `data_source_id` from the `<data-source url="collection://...">` tag, then use `parent: { type: "data_source_id", data_source_id: "..." }`.

---

## Tool surface — phased rollout

The hosted server exposes ~16 tools. Don't enable all of them on day one. Phase enablement and keep human confirmation on for writes.

**Phase 1 — read-only discovery:** `notion-search`, `notion-fetch`, `notion-get-comments`. Pull specs and notes into coding sessions.

**Phase 2 — controlled writes:** add `notion-create-pages`, `notion-update-page`, `notion-create-comment`. Draft notes, update status, leave comments.

**Phase 3 — admin / schema:** `notion-create-database`, `notion-update-data-source`, `notion-create-view`, `notion-update-view`, `notion-move-pages`, `notion-duplicate-page`, `notion-query-data-sources`, `notion-query-database-view`. Powerful; easy to misuse. Enable only after Phase 2 is trusted.

In Codex this can be enforced via `enabled_tools` in the TOML block. In Claude Code, gating happens at runtime via `/mcp` per-tool approvals.

---

## Rate limits and capabilities

- Standard Notion API limits: ~180 req/min, 3 req/sec across MCP tool calls. `notion-search` capped at 30/min.
- **File uploads are not supported** through the hosted MCP server. Use Notion's direct file API for that.
- `notion-search` against connected sources (Slack, Google Drive, Jira, etc.) requires Notion AI access. Without it, search is limited to Notion workspace content.

---

## Troubleshooting

**Notion server not visible in Claude Code:**
- `claude mcp list` — does it appear?
- `claude mcp get notion` — should return server details, not "No MCP server found."
- If absent for Path A, re-check Settings → Connectors at claude.ai.
- If absent for Path B/C, re-run `claude mcp add` or your harness sync, then restart Claude Code.

**Notion server not visible in Codex:**
- `cat ~/.codex/config.toml` — confirm the `[mcp_servers.notion]` block is present.
- `/mcp` inside a Codex session should list it.
- Re-run `codex mcp login notion` if it shows as unauthenticated.

**OAuth bound to the wrong account:** in Claude Code, run `/mcp`, find the Notion entry, choose **Clear authentication**, then re-OAuth with the correct Notion browser session. For Path A specifically, do this from claude.ai → Settings → Connectors. For Codex, run `codex mcp login notion` again after logging into the correct Notion account in the browser.

**Page created but invisible in Notion:** the OAuth is bound to a different account than the one you're browsing as, AND the page was created without a shared parent, so it landed in the wrong user's Private section. See Pitfalls #1.

**Headless or CI use:** the hosted server requires interactive OAuth and does not support bearer-token auth. For unattended automation, use the Notion REST API directly with an integration token, or run the open-source local MCP server (which Notion maintains but flags as not actively developed).

---

## Pitfalls

1. **OAuth binds to the active Notion browser session.** If your browser is signed into `colleague@example.com` when you click "Connect," the MCP integration becomes `colleague@example.com`'s, even if you intended your own account. Always verify with `notion-get-self` immediately after authentication. Fix: clear auth, log into the correct Notion account in the browser, re-OAuth.
2. **Pages created without a parent are private to the authenticated user.** Shared teammates cannot see them. Always pass a `parent` (page or data source) for anything you want shared.
3. **Don't install multiple Notion MCP servers.** One hosted server, gated at the client layer. Two servers will fight over tool names and produce duplicate OAuth flows.
4. **`~/.claude/settings.json mcpServers` is not the path Claude Code's MCP runtime consumes** in current versions. `claude mcp list` reads from `~/.claude.json` (user / project scope written by `claude mcp add`) and from platform connectors. If a harness writes Notion to `~/.claude/settings.json`, that entry will be silently ignored by Claude Code. Use Path A or Path B for Claude Code. The harness's sync is still useful for Codex and Cursor.
5. **Rate-limit ricochet.** Loops over `notion-search` (cap of 30/min) will hit limits fast. Keep page_size low, cache where possible.
6. **Title-in-content trap.** When using `notion-create-pages`, set the title under `properties.title`, not at the top of `content`. The tool will render the title automatically; including it in content duplicates it.

---

## Quick handoff checklist

For the coworker setting this up in a new repo:

- [ ] Decide which client(s) need Notion MCP: Claude Code, Codex, Cursor.
- [ ] Pick a path: A (Claude.ai connector), B (direct CLI), or C (bgng harness).
- [ ] Confirm correct Notion account is logged in in the OAuth browser.
- [ ] Run the install command(s) for the chosen path.
- [ ] Trigger OAuth in each client.
- [ ] Run `notion-get-self`, `notion-get-teams`, `notion-search` to verify identity and workspace.
- [ ] Identify a shared parent page in the team's Notion for all future writes. Document its URL/ID for the team.
- [ ] Start with Phase 1 read-only tools; add writes only after the read path is trusted.
