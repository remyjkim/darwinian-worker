## Recommendation

Build it as a **Notion Agent Gateway**: one canonical **remote Streamable HTTP MCP server** at `/mcp`, with optional stdio/SSE compatibility shims. Do **not** build separate servers for Claude Code, Codex, Cursor, etc., and do **not** mirror every Notion REST endpoint as a raw MCP tool.

The default architecture should be:

> **one hosted MCP server → compact Notion-specific agent tools → Notion API / Notion OAuth / optional internal-token mode → per-user policy, rate limiting, audit, caching**

That is the design most likely to work across Claude Code, Codex, Cursor, ChatGPT/OpenAI clients, and future coding agents because MCP’s standard transports are stdio and Streamable HTTP, and Streamable HTTP is specifically designed for an independent server process that can handle multiple client connections. ([Model Context Protocol][1]) ([Model Context Protocol][1])

## First decision: do you actually need to build it?

If your goal is simply “let agents use Notion,” the best answer is probably **use Notion’s official remote MCP server**. Notion documents direct setup for Claude Code, Cursor, ChatGPT, Codex, and other MCP clients; the recommended endpoint is Streamable HTTP at Notion’s MCP URL. ([Notion Docs][2]) ([Notion Docs][2]) Notion’s open-source local MCP repo also says the remote MCP is now prioritized, supports OAuth, has agent-tailored tools, and the local repo may be sunset / is not actively monitored. ([GitHub][3])

Build your own only if you need one or more of these:

1. **Headless automation** for CI/cloud agents. Notion’s official remote MCP requires user OAuth and does not support bearer-token auth, which Notion says may not fit fully automated workflows. ([Notion Docs][2])
2. **Enterprise gateway controls**: allowlists, per-project permissions, audit logs, approval policies, or workspace-specific restrictions.
3. **Custom coding-agent workflows**: “turn this Notion task into implementation steps,” “sync PR summary back to Notion,” “prepare release notes from pages,” “append investigation findings,” etc.
4. **Better search/ranking/caching** than the raw Notion API, especially if you want cross-workspace indexing, semantic search, stable citations, or lower token usage.
5. **A unified server for several agents at once**, with consistent tool names and behavior across Claude Code, Codex, Cursor, and OpenAI MCP clients.

## Transport strategy

Use this priority order:

### 1. Primary: Streamable HTTP at `/mcp`

This should be your canonical production interface. Claude Code calls remote HTTP “the recommended option” for cloud-based MCP services, and Cursor supports Streamable HTTP for remote multi-user servers. ([Claude Code][4]) ([Cursor][5]) Codex supports Streamable HTTP servers, bearer-token authentication, and OAuth. ([OpenAI Developers][6])

Your endpoint should implement:

```text
POST /mcp
GET  /mcp
```

with Streamable HTTP session support. MCP allows the server to issue an `MCP-Session-Id` during initialization, and clients then include that session ID on later requests. ([Model Context Protocol][1])

### 2. Compatibility: stdio bridge

Some older/local-only clients only support stdio. Do not make stdio the main architecture. Instead, provide either:

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://your-domain.com/mcp"]
    }
  }
}
```

Notion recommends the same `mcp-remote` bridge pattern for tools that do not support remote MCP. ([Notion Docs][2])

### 3. Optional: legacy SSE

Only support SSE if you need older clients. MCP says Streamable HTTP replaced the older HTTP+SSE transport, but servers can host old SSE endpoints alongside the new MCP endpoint for backward compatibility. ([Model Context Protocol][1])

## Tool design: use a small, high-level surface

The biggest mistake would be exposing 50–100 low-level Notion REST wrappers. Coding agents perform better with **task-level tools** that return compact structured output.

MCP tools need names, descriptions, input schemas, optional output schemas, and annotations; tool names should be short, unique, and avoid spaces/special characters. ([Model Context Protocol][7]) ([Model Context Protocol][7]) Tools should return `structuredContent` plus text for compatibility, and output schemas let clients validate structured results. ([Model Context Protocol][7])

I would ship these layers:

### Core read tools

Use these names if you care about OpenAI / ChatGPT / Deep Research compatibility:

```text
search
fetch
```

OpenAI’s MCP docs say ChatGPT deep research and company knowledge expect two read-only tools named `search` and `fetch`. ([OpenAI Developers][8]) Notion’s own MCP docs note that OpenAI clients omit the `notion-` prefix and expose `notion-search` / `notion-fetch` as `search` / `fetch` for that reason. ([Notion Docs][9])

Design them as:

```ts
search({
  query: string,
  scope?: "workspace" | "page" | "data_source",
  parent_id?: string,
  limit?: number
}) -> {
  results: Array<{
    id: string,
    title: string,
    url: string,
    type: "page" | "database" | "data_source",
    excerpt?: string,
    last_edited_time?: string
  }>
}
```

```ts
fetch({
  id_or_url: string,
  format?: "markdown" | "json" | "summary",
  include_children?: boolean,
  max_depth?: number
}) -> {
  id: string,
  title: string,
  url: string,
  type: string,
  markdown?: string,
  properties?: object,
  children_truncated?: boolean,
  last_edited_time?: string
}
```

### Notion-specific read/query tools

Add these after the basic pair works:

```text
query_data_source
get_data_source_schema
get_page_comments
get_users
get_self
list_recent_pages
```

The Notion API supports pages, databases, users, comments, and similar workspace objects through connections, with permissions set by the connection. ([Notion Docs][10]) Notion’s newer API versions emphasize data sources as the current database abstraction; the older open-source MCP migrated database query/create/update tools toward data source tools. ([GitHub][3])

### Safe write tools

Prefer high-level, previewable write tools:

```text
create_page
update_page_properties
append_page_markdown
update_page_content
create_comment
move_page
duplicate_page
```

For page edits, prefer Notion’s markdown content update capabilities where possible. Notion’s markdown update endpoint supports targeted search-and-replace, full replacement, and insertion, and explicitly recommends `update_content` or `replace_content` over older insertion/range approaches. ([Notion Docs][11])

Every write tool should support:

```ts
dry_run?: boolean
idempotency_key?: string
expected_last_edited_time?: string
```

And every write response should include:

```ts
{
  dry_run: boolean,
  changed: boolean,
  page_id: string,
  url: string,
  diff_summary: string,
  warnings: string[]
}
```

### Admin/schema tools

Keep these disabled by default unless the user or organization explicitly enables them:

```text
create_data_source
update_data_source_schema
create_view
update_view
archive_page
restore_page
```

Notion’s 2026-03-11 API has breaking changes around block positioning, trash/archive semantics, and block type naming, so your server should pin and test against a specific Notion API version rather than drifting silently. ([Notion Docs][12])

## Resources and prompts

Tools are the lowest common denominator, but resources and prompts make the experience better in Claude Code and Cursor.

Expose resources like:

```text
notion://page/{page_id}
notion://data-source/{data_source_id}
notion://database/{database_id}
notion://comment-thread/{page_id}
```

Claude Code lets users reference MCP resources with `@` mentions, fuzzy-searches them, and fetches them as attachments when referenced. ([Claude Code][4]) Cursor supports tools, prompts, resources, roots, and elicitation. ([Cursor][5])

Expose prompts such as:

```text
/mcp__notion__summarize_ticket_for_implementation
/mcp__notion__sync_pr_summary
/mcp__notion__turn_spec_into_tasks
/mcp__notion__prepare_release_notes
```

For server instructions, keep the first paragraph extremely compact. Codex reads MCP `instructions` and says the first 512 characters should be self-contained; Claude Code truncates tool descriptions and server instructions at 2KB each. ([OpenAI Developers][6]) ([Claude Code][4])

## Authentication model

Support two modes.

### Mode A: user OAuth, best for humans

Use this for Claude Code, Cursor, Codex, and ChatGPT-style users who can complete an OAuth flow.

MCP authorization is defined at the HTTP transport level; HTTP MCP servers should conform to the authorization spec, while stdio servers should get credentials from the environment. ([Model Context Protocol][13]) Claude Code supports OAuth for remote MCP servers and uses `401`/`403` plus `WWW-Authenticate` discovery to initiate login. ([Claude Code][4]) Codex supports OAuth for Streamable HTTP MCP servers. ([OpenAI Developers][6]) Cursor supports OAuth configuration for remote servers. ([Cursor][5])

Recommended mapping:

```text
MCP client session
  -> authenticated MCP user
  -> Notion OAuth token / workspace
  -> per-user Notion permissions
```

### Mode B: headless bearer-token / internal integration mode

Use this for CI, Codex cloud-like tasks, backend automations, or shared team agents.

```text
Authorization: Bearer <your-gateway-token>
  -> gateway policy
  -> Notion internal integration token / PAT
  -> restricted parent pages / data sources
```

This is the main reason to build your own, because Notion’s official remote MCP does not support bearer-token auth and requires user OAuth. ([Notion Docs][2])

Do not put Notion tokens in project config. Store them in a secret manager, keychain, or environment variables. Codex’s config supports `bearer_token_env_var`, HTTP headers, env headers, tool allowlists, and approval settings for Streamable HTTP servers. ([OpenAI Developers][6])

## Client setup examples

### Claude Code

```bash
claude mcp add --transport http notion https://your-domain.com/mcp
```

With bearer auth:

```bash
claude mcp add --transport http notion https://your-domain.com/mcp \
  --header "Authorization: Bearer $NOTION_AGENT_GATEWAY_TOKEN"
```

Claude Code documents this exact remote HTTP pattern and says `streamable-http` is accepted as an alias for `http`. ([Claude Code][4])

### Codex

```toml
[mcp_servers.notion]
url = "https://your-domain.com/mcp"
bearer_token_env_var = "NOTION_AGENT_GATEWAY_TOKEN"
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"
```

Codex stores MCP config in `~/.codex/config.toml` or project `.codex/config.toml`, and CLI plus IDE extension share the config. ([OpenAI Developers][6])

### Cursor

```json
{
  "mcpServers": {
    "notion": {
      "url": "https://your-domain.com/mcp",
      "headers": {
        "Authorization": "Bearer ${NOTION_AGENT_GATEWAY_TOKEN}"
      }
    }
  }
}
```

Cursor supports stdio, SSE, and Streamable HTTP, and its CLI uses the same configuration as the editor. ([Cursor][5]) ([Cursor][14])

## Notion API constraints your design must handle

### Rate limits

Notion’s API limit is an average of **three requests per second per connection**, with 429 and 529 responses requiring `Retry-After` handling/backoff. ([Notion Docs][15]) Notion MCP’s published limits are currently 180 requests/minute overall and 30 searches/minute for search. ([Notion Docs][9])

So implement:

```text
per-token request queue
per-tool concurrency limits
retry-after handling
exponential backoff
search result caching
fetch/page markdown caching
```

Also tell agents in server instructions: “Avoid parallel Notion searches; fetch only the specific pages needed.”

### Blocks are recursive and lossy

Notion page content is block-based. Blocks represent headings, toggles, lists, media, and many other content types. ([Notion Docs][16]) Retrieving block children is paginated and only returns one level, so a complete page requires recursive retrieval. ([Notion Docs][17]) Appending block children has limits: existing blocks cannot be moved with that endpoint, nesting is limited to two levels in a single request, and a single append request can add at most 100 children. ([Notion Docs][18])

This means your server needs a **content normalization layer**:

```text
Notion blocks -> enhanced markdown -> compact agent text
enhanced markdown -> Notion markdown/content update API
unsupported blocks -> preserve + warn, never silently delete
```

### Search has product limitations

Notion’s official MCP search can search Notion and connected sources like Slack, Google Drive, and Jira, but that capability depends on Notion AI access; without Notion AI, search is limited to the Notion workspace. ([Notion Docs][9]) A custom Notion API-backed server should not promise connected-source search unless you build or license that separately.

## Security design

Treat Notion content as **untrusted input**. Notion’s own MCP security guide calls out prompt injection risks, including malicious instructions embedded in workspace content that try to exfiltrate private pages. ([Notion Docs][19]) MCP’s tool spec also requires servers to validate inputs, implement access controls, rate-limit tool invocations, and sanitize outputs; clients should prompt for confirmation on sensitive operations and log usage. ([Model Context Protocol][7])

Minimum controls:

```text
1. Validate Origin on HTTP MCP requests.
2. Require auth for every remote request.
3. Bind local dev servers to localhost only.
4. Never expose Notion tokens in tool output, logs, traces, or errors.
5. Sanitize Notion page content before returning it to models.
6. Add approval hints / annotations for destructive tools.
7. Require dry_run or preview for destructive or broad write operations.
8. Enforce per-user and per-project allowlists for parent pages/data sources.
9. Audit every tool call: user, client, tool, target Notion IDs, diff, result.
10. Separate “read-only” and “write-enabled” server profiles.
```

The Streamable HTTP transport spec specifically calls for Origin validation, localhost binding for local servers, and proper authentication. ([Model Context Protocol][1])

## Reference architecture

```text
                         Claude Code
                         Codex
                         Cursor
                         ChatGPT / OpenAI clients
                              |
                              v
                    https://your-domain.com/mcp
                              |
                 MCP transport/session/auth layer
                              |
          +-------------------+-------------------+
          |                                       |
   Tool registry                            Resource/prompt registry
   - search                                 - notion://page/{id}
   - fetch                                  - notion://data-source/{id}
   - create_page                            - implementation prompts
   - update_page_content
   - query_data_source
          |
          v
   Policy + approval layer
   - user/workspace/client scopes
   - read/write allowlists
   - destructive-action rules
   - audit logging
          |
          v
   Notion gateway
   - OAuth token mode
   - internal integration mode
   - rate limiter / retry queue
   - Notion API version pin
          |
          v
   Content/index layer
   - block recursion
   - markdown conversion
   - semantic/cache index
   - page snapshots/diffs
          |
          v
        Notion API
```

## Suggested implementation stack

I would default to **TypeScript/Node** unless your team is strongly Python-first.

Reason: the official TypeScript MCP SDK includes server libraries for tools/resources/prompts, Streamable HTTP, stdio, auth helpers, clients, and middleware for Express/Hono/Node HTTP. ([GitHub][20]) Notion’s official JS/TS SDK is also directly aligned with current Notion API versioning; the 2026-03-11 upgrade guide specifically calls out upgrading the JS/TS SDK to v5.12.0+ and setting the Notion version. ([Notion Docs][12])

Python is also viable: the official Python SDK supports resources, prompts, tools, stdio, SSE, and Streamable HTTP. ([GitHub][21])

## Build plan

### Phase 1: validate against official Notion MCP

Before building, run your target workflows against Notion’s official MCP:

```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp
codex mcp login notion
```

If it already handles your workflows, use it and only build custom prompts/skills around it.

### Phase 2: build read-only gateway

Ship only:

```text
search
fetch
query_data_source
get_data_source_schema
```

Add OAuth or bearer-token auth, rate limiting, caching, structured outputs, and tests against Claude Code, Codex, and Cursor.

### Phase 3: add safe writes

Add:

```text
create_page
update_page_properties
append_page_markdown
update_page_content
create_comment
```

All writes should support `dry_run`, diff summaries, expected last-edited checks, and clear error messages. MCP distinguishes protocol errors from tool execution errors; tool execution errors should be returned with `isError: true` so models can self-correct. ([Model Context Protocol][7])

### Phase 4: add resources/prompts

Add `notion://` resources and coding workflow prompts. Keep tools as the core compatibility layer; resources/prompts are UX upgrades.

### Phase 5: enterprise hardening

Add:

```text
workspace allowlists
per-client policies
tool allowlists
audit dashboard
secret rotation
semantic index
eval suite
prompt-injection test pages
rate-limit stress tests
```

## Final verdict

The best strategy is:

> **Use Notion’s official MCP unless you need headless automation, custom policies, or coding-agent-specific workflows. If you build your own, build one remote Streamable HTTP “Notion Agent Gateway,” not per-client servers and not a raw Notion API mirror. Make `search`/`fetch` the universal read surface, add a small set of high-level Notion write/query tools, support OAuth plus optional headless bearer mode, and put rate limiting, prompt-injection defense, diff previews, and audit logs at the center of the design.**

[1]: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports "Transports - Model Context Protocol"
[2]: https://developers.notion.com/guides/mcp/get-started-with-mcp "Connecting to Notion MCP - Notion Docs"
[3]: https://github.com/makenotion/notion-mcp-server "GitHub - makenotion/notion-mcp-server: Official Notion MCP Server · GitHub"
[4]: https://code.claude.com/docs/en/mcp "Connect Claude Code to tools via MCP - Claude Code Docs"
[5]: https://cursor.com/docs/mcp.md "cursor.com"
[6]: https://developers.openai.com/codex/mcp "Model Context Protocol – Codex | OpenAI Developers"
[7]: https://modelcontextprotocol.io/specification/2025-11-25/server/tools "Tools - Model Context Protocol"
[8]: https://developers.openai.com/api/docs/mcp "Building MCP servers for ChatGPT Apps and API integrations"
[9]: https://developers.notion.com/guides/mcp/mcp-supported-tools "Supported tools - Notion Docs"
[10]: https://developers.notion.com/guides/get-started/overview "Overview - Notion Docs"
[11]: https://developers.notion.com/reference/update-page-markdown "Update a page's content as markdown - Notion Docs"
[12]: https://developers.notion.com/guides/get-started/upgrade-guide-2026-03-11 "Upgrade guide - Notion Docs"
[13]: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization "Authorization - Model Context Protocol"
[14]: https://cursor.com/docs/cli/mcp.md "cursor.com"
[15]: https://developers.notion.com/reference/request-limits "Request limits - Notion Docs"
[16]: https://developers.notion.com/reference/block "Block - Notion Docs"
[17]: https://developers.notion.com/reference/get-block-children "Retrieve block children - Notion Docs"
[18]: https://developers.notion.com/reference/patch-block-children "Append block children - Notion Docs"
[19]: https://developers.notion.com/guides/mcp/mcp-security-best-practices "Security best practices - Notion Docs"
[20]: https://github.com/modelcontextprotocol/typescript-sdk "GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients · GitHub"
[21]: https://github.com/modelcontextprotocol/python-sdk "GitHub - modelcontextprotocol/python-sdk: The official Python SDK for Model Context Protocol servers and clients · GitHub"
