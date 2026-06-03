# Handbook: official hosted Notion MCP for Claude Code or Codex

I’m assuming “Cloud Code” means **Claude Code**, because that is the local coding agent Notion explicitly documents for MCP. The key point: the **official hosted Notion MCP is not installed as a local Notion server**. You install/configure your local MCP client — Claude Code or Codex — to connect to Notion’s hosted MCP endpoint. Notion describes this hosted server as OAuth-based, actively maintained, infrastructure-free, and optimized for AI agents. ([Notion Docs][1])

---

## 1. What the hosted Notion MCP gives you

Notion MCP is a hosted Model Context Protocol server that lets an AI tool read and write to your Notion workspace according to your own Notion access and permissions. Notion says it is designed for AI assistants such as Claude Code, Cursor, VS Code, ChatGPT, Codex, and others. ([Notion Docs][2])

The official hosted server supports the modern **Streamable HTTP** transport at the `/mcp` endpoint, with SSE available as a fallback for older clients. Notion recommends Streamable HTTP. ([Notion Docs][1])

Use the hosted server when you want:

* Read/write access to Notion from a coding agent.
* OAuth-based user authorization.
* No local Notion MCP process to run.
* Tools shaped for AI agents rather than raw Notion REST API JSON.
* Easy setup for individual developers and team-shared config.

Avoid using it as your only path when you need fully headless automation. Notion says hosted Notion MCP requires user OAuth and does **not** support bearer-token auth, which can make it unsuitable for cloud agents running without human interaction. For that case, Notion points to the open-source local server with a Notion API token, while also saying that package is no longer actively maintained. ([Notion Docs][1])

---

## 2. Capabilities and limits

### Core tools

The hosted server exposes tools for search, fetch, page creation, page update, page moves, page duplication, database creation, data-source updates, view creation/update, data-source querying, database-view querying, comments, teams, users, current user, and workspace/bot info. ([Notion Docs][3])

The most important tools for a coding workflow are:

| Workflow                                | Notion MCP tools                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Pull requirements into a coding session | `notion-search`, `notion-fetch`                                                                    |
| Turn implementation notes into docs     | `notion-create-pages`, `notion-update-page`                                                        |
| Update task/project status              | `notion-fetch`, `notion-update-page`                                                               |
| Use Notion databases as task trackers   | `notion-fetch`, `notion-create-pages`, `notion-update-page`, possibly `notion-query-database-view` |
| Comment on specs or reviews             | `notion-create-comment`, `notion-get-comments`                                                     |
| Inspect workspace/team/user context     | `notion-get-teams`, `notion-get-users`, `notion-get-user`, `notion-get-self`                       |

### Plan-gated behavior

`notion-search` can search connected sources such as Slack, Google Drive, and Jira only with Notion AI access; without Notion AI, search is limited to Notion workspace content. `notion-query-data-sources` requires Enterprise with Notion AI, and `notion-query-database-view` requires Business or higher with Notion AI when the broader data-source query tool is unavailable. ([Notion Docs][3])

### File uploads

Notion says image and file uploads are **not currently supported** through Notion MCP, although direct file upload APIs can be used separately. ([Notion Docs][1])

### Rate limits

Notion says standard API request limits apply across Notion MCP tool calls: currently an average of 180 requests per minute, or 3 requests per second, with search additionally limited to 30 requests per minute. ([Notion Docs][3])

---

## 3. Security model

Connecting Notion MCP gives the AI system access according to your Notion user account, so treat it like granting an agent access to your workspace. Notion recommends verifying that you are using the official endpoints, using trusted MCP clients, reviewing tool permissions, and keeping human confirmation enabled to prevent accidental or malicious changes. ([Notion Docs][4])

Practical baseline:

* Use only the official hosted Notion MCP endpoint in config.
* Keep human confirmation on for writes.
* Avoid connecting untrusted MCP servers in the same session as Notion when the agent can also access external networks.
* Prefer project-scoped config for team reproducibility, but do not commit secrets.
* Use workspace permissions and Notion page access to limit what the OAuth user can reach.
* For Codex, use `enabled_tools` and approval modes to reduce the active Notion tool surface.

---

# 4. Claude Code installation

Claude Code’s quickstart says you need a terminal, a code project, and access through a Claude subscription, Claude Console account, or supported cloud provider. It provides native install commands for macOS/Linux/WSL, Windows PowerShell, Windows CMD, Homebrew, and WinGet. ([Claude Code][5])

### Install Claude Code

macOS, Linux, or WSL:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Homebrew:

```bash
brew install --cask claude-code
```

Windows PowerShell:

```powershell
irm https://claude.ai/install.ps1 | iex
```

Windows CMD:

```cmd
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

Then start Claude Code and log in:

```bash
cd /path/to/your/project
claude
```

---

# 5. Configure hosted Notion MCP in Claude Code

Notion’s documented Claude Code setup is: add a remote HTTP MCP server, then authenticate through `/mcp`. ([Notion Docs][1])

### Personal project-local install

Use this when only you need Notion MCP in the current repo:

```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp
```

Then inside Claude Code:

```text
/mcp
```

Choose the Notion server and complete the browser OAuth flow.

### User-wide install

Use this when you want Notion available across all your local projects:

```bash
claude mcp add --transport http notion --scope user https://mcp.notion.com/mcp
```

Claude Code documents three MCP scopes: local, project, and user. Local is current-project/private, project is shared through `.mcp.json`, and user is available across all projects for your user account. ([Claude API Docs][6])

### Team-shared project install

Use this when the team should share the same MCP server definition:

```bash
claude mcp add --transport http notion --scope project https://mcp.notion.com/mcp
```

This creates or updates a `.mcp.json` file in the project root. Claude Code says project-scoped servers are designed to be checked into version control, while still prompting for approval before using project-scoped servers from `.mcp.json`. ([Claude API Docs][6])

Expected `.mcp.json` shape:

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

### Verify in Claude Code

From a running Claude Code session:

```text
/mcp
```

The `/mcp` panel shows connected servers and tool counts; Claude Code also supports `claude mcp list`, `claude mcp get <name>`, and `claude mcp remove <name>` for management. ([Claude Code][7])

Useful checks:

```bash
claude mcp list
claude mcp get notion
```

Inside Claude Code, try:

```text
Search my Notion workspace for pages about the current project.
```

or:

```text
Fetch this Notion page and summarize the acceptance criteria: <paste Notion page URL>
```

### Optional: Notion plugin for Claude Code

Notion also points to a richer Claude Code plugin that bundles the MCP server with prebuilt Skills and slash commands for common Notion workflows. That is optional; for a minimal harness, start with the plain hosted MCP connection first. ([Notion Docs][1])

---

# 6. Codex installation

OpenAI’s Codex CLI docs say Codex runs locally from your terminal and is available on macOS, Windows, and Linux. The setup supports npm and Homebrew installs; the first run prompts you to sign in with ChatGPT or an API key. ([OpenAI Developers][8])

### Install Codex

npm:

```bash
npm i -g @openai/codex
```

Homebrew:

```bash
brew install codex
```

Then:

```bash
cd /path/to/your/project
codex
```

---

# 7. Configure hosted Notion MCP in Codex

Codex supports Streamable HTTP MCP servers with OAuth, and stores MCP config in `config.toml`, either at user scope or project scope. OpenAI’s docs say the CLI and IDE extension share this config. ([OpenAI Developers][9])

Notion’s documented Codex setup is to add this to `~/.codex/config.toml`, then run `codex mcp login notion`. ([Notion Docs][1])

### User-level Codex config

Edit:

```bash
~/.codex/config.toml
```

Add:

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
```

Authenticate:

```bash
codex mcp login notion
```

Then launch Codex:

```bash
codex
```

Inside Codex, check active MCP servers:

```text
/mcp
```

### Project-level Codex config

Create:

```bash
.codex/config.toml
```

Add the same server block:

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
```

Codex project config is loaded only for trusted projects, and user-level config lives at `~/.codex/config.toml`. ([OpenAI Developers][10])

### Recommended Codex tool policy

Codex supports `enabled_tools`, `disabled_tools`, default tool approval modes, and per-tool approval overrides for MCP servers. ([OpenAI Developers][9]) For a minimal Notion setup, start with read-only plus safe write tools:

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
enabled_tools = [
  "notion-search",
  "notion-fetch",
  "notion-create-pages",
  "notion-update-page",
  "notion-create-comment",
  "notion-get-comments"
]
default_tools_approval_mode = "prompt"
tool_timeout_sec = 60
```

For a stricter first rollout:

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
enabled_tools = [
  "notion-search",
  "notion-fetch",
  "notion-get-comments"
]
default_tools_approval_mode = "prompt"
```

Then expand only after you trust the workflow.

---

# 8. Minimal recommended tool surface

For your “don’t add too many toolings” goal, do **not** install multiple Notion MCP servers. Use the official hosted server and constrain usage at the client/harness layer.

### Phase 1: read-only discovery

Use:

```text
notion-search
notion-fetch
notion-get-comments
```

This lets the agent pull PRDs, specs, project notes, task context, and comments into a coding session.

### Phase 2: controlled writing

Add:

```text
notion-create-pages
notion-update-page
notion-create-comment
```

This lets the agent draft implementation notes, update task status, and leave comments, while avoiding database/schema operations.

### Phase 3: database/admin operations

Add only for trusted workflows:

```text
notion-create-database
notion-update-data-source
notion-create-view
notion-update-view
notion-move-pages
notion-duplicate-page
notion-query-data-sources
notion-query-database-view
```

These are powerful but easier to misuse. Keep approval prompts on.

---

# 9. Practical workflows for a code harness

### Pull requirements into a coding session

Prompt:

```text
Use Notion to find the PRD or task spec for this project. Fetch the relevant page, summarize the acceptance criteria, then inspect the repo and propose an implementation plan.
```

Likely tools:

```text
notion-search → notion-fetch
```

### Implement from a Notion task

Prompt:

```text
Fetch this Notion task, identify the expected behavior, implement the smallest high-confidence change, run tests, and then draft a Notion status update for my approval.
```

Likely tools:

```text
notion-fetch → local code tools → notion-update-page or notion-create-comment
```

### Write release notes to Notion

Prompt:

```text
Review the diff from the last release tag to HEAD, summarize notable user-facing changes, and create a Notion release notes draft under the Release Notes parent page.
```

Likely tools:

```text
git/local shell → notion-fetch → notion-create-pages
```

### Sync code review findings back to Notion

Prompt:

```text
Review the current branch for correctness, security, and test coverage. Add a concise Notion comment to the linked task with any risks or follow-up items.
```

Likely tools:

```text
local code review → notion-create-comment
```

---

# 10. Troubleshooting

### Claude Code: Notion server not visible

Run:

```bash
claude mcp list
claude mcp get notion
```

Then open Claude Code and run:

```text
/mcp
```

Claude Code’s `/mcp` panel shows status and tool counts. It also handles OAuth for remote HTTP servers through the `/mcp` flow. ([Claude Code][7])

### Codex: Notion server not visible

Check config location:

```bash
cat ~/.codex/config.toml
cat .codex/config.toml
```

Check Codex’s active MCP list:

```text
/mcp
```

Codex stores MCP config in `config.toml`; user config is `~/.codex/config.toml`, project config is `.codex/config.toml` for trusted projects, and the CLI/IDE extension share config. ([OpenAI Developers][9])

### OAuth fails or keeps prompting

For Claude Code, clear authentication in `/mcp` and reconnect. Claude Code docs say OAuth tokens are stored securely and refreshed automatically, and `/mcp` offers a “Clear authentication” option. ([Claude API Docs][6])

For Codex:

```bash
codex mcp login notion
```

Codex supports OAuth for Streamable HTTP MCP servers through `codex mcp login <server-name>`. ([OpenAI Developers][9])

### Client does not support remote HTTP MCP

Notion documents `mcp-remote` as a bridge for clients that only support stdio MCP servers. ([Notion Docs][1])

Generic JSON form:

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
    }
  }
}
```

Use this only when the client cannot connect to remote HTTP directly. Claude Code and Codex both support Streamable HTTP now, so they should not need this bridge. ([Claude Code][7])

### Need headless automation

The official hosted Notion MCP is OAuth/user-based. For fully automated, no-human flows, use direct Notion API calls or the open-source local server with a Notion API token, recognizing Notion’s warning that the open-source server is not actively maintained. ([Notion Docs][11])

---

# 11. Recommended rollout plan

### Individual developer

Use Claude Code or Codex user-level config.

Claude Code:

```bash
claude mcp add --transport http notion --scope user https://mcp.notion.com/mcp
```

Codex:

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
default_tools_approval_mode = "prompt"
```

### Team repo

Commit a project-level config, but keep OAuth per-user.

Claude Code `.mcp.json`:

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

Codex `.codex/config.toml`:

```toml
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
enabled = true
enabled_tools = [
  "notion-search",
  "notion-fetch",
  "notion-create-pages",
  "notion-update-page",
  "notion-create-comment",
  "notion-get-comments"
]
default_tools_approval_mode = "prompt"
```

Each developer authenticates locally with their own Notion account.

### Harness / platform policy

Use one official Notion MCP server, then enforce:

```text
Read tools by default:
- notion-search
- notion-fetch
- notion-get-comments

Write tools behind confirmation:
- notion-create-pages
- notion-update-page
- notion-create-comment

Schema/reorg tools disabled by default:
- notion-create-database
- notion-update-data-source
- notion-create-view
- notion-update-view
- notion-move-pages
- notion-duplicate-page
```

This gives you the core Notion functionality without proliferating toolings or third-party MCP servers.

[1]: https://developers.notion.com/guides/mcp/get-started-with-mcp "Connecting to Notion MCP - Notion Docs"
[2]: https://developers.notion.com/guides/mcp/overview "Notion MCP - Notion Docs"
[3]: https://developers.notion.com/guides/mcp/mcp-supported-tools "Supported tools - Notion Docs"
[4]: https://developers.notion.com/guides/mcp/mcp-security-best-practices "Security best practices - Notion Docs"
[5]: https://code.claude.com/docs/en/quickstart?utm_source=chatgpt.com "Quickstart - Claude Code Docs"
[6]: https://docs.anthropic.com/en/docs/claude-code/mcp "Connect Claude Code to tools via MCP - Claude Code Docs"
[7]: https://code.claude.com/docs/en/mcp "Connect Claude Code to tools via MCP - Claude Code Docs"
[8]: https://developers.openai.com/codex/cli?utm_source=chatgpt.com "Codex CLI"
[9]: https://developers.openai.com/codex/mcp "Model Context Protocol – Codex | OpenAI Developers"
[10]: https://developers.openai.com/codex/config-basic "Config basics – Codex | OpenAI Developers"
[11]: https://developers.notion.com/guides/mcp/hosting-open-source-mcp "Hosting a local MCP server - Notion Docs"
