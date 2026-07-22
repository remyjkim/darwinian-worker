# OpenCode Configuration Manual — MCP, Plugins (Hooks) & Skills

A practical reference for extending OpenCode (the terminal-first AI coding agent by Anomaly,
`opencode.ai`). Covers the three harness surfaces: connecting external tools via **MCP**,
intercepting the agent loop via **Plugins/hooks**, and packaging on-demand behavior via
**Agent Skills**.

> OpenCode's equivalent of a "hooks system" is its **Plugin** API — JS/TS modules that
> subscribe to lifecycle events and tool hooks. There is no separate `hooks.json`.

---

## 0. Configuration foundations

OpenCode is configured through `opencode.json` (or `opencode.jsonc`). Always include the
schema line for editor autocomplete:

```json
{ "$schema": "https://opencode.ai/config.json" }
```

### Config sources & precedence (low → high)

1. **Remote** — org defaults from a `.well-known/opencode` endpoint (base layer).
2. **Global** — `~/.config/opencode/opencode.json`.
3. **Project** — `opencode.json` in the project root.
4. **Managed** — enterprise settings in the system managed dir / macOS `ai.opencode.managed`
   preference domain (deployable via MDM `.mobileconfig`). Overrides everything.

Later sources override earlier ones. You can also point at a custom dir with
`OPENCODE_CONFIG_DIR`, which loads **after** global and `.opencode` (so it can override them).

### Directory conventions

Both `.opencode/` (project) and `~/.config/opencode/` (global) use **plural** subdirectory
names: `agents/`, `commands/`, `modes/`, `plugins/`, `skills/`, `tools/`, `themes/`.
Singular names are still accepted for backwards compatibility.

| Surface | What it does | Where | Trigger |
| --- | --- | --- | --- |
| **MCP** | External tools/data as agent tools | `mcp` block in `opencode.json` | LLM calls the tool |
| **Plugins** | Hook the agent loop; add custom tools/integrations | `.opencode/plugins/` or npm | Lifecycle event / tool hook |
| **Skills** | On-demand `SKILL.md` instructions | `.opencode/skills/<name>/SKILL.md` | Agent calls the `skill` tool |

---

# 1. MCP servers

MCP adds external tools to OpenCode. Once configured, MCP tools appear **automatically**
alongside built-in tools and can be managed like any other tool. Servers are **local**
(spawned process) or **remote** (HTTP endpoint).

> Caveat: every MCP server's tools add to context. High-tool servers (e.g. the GitHub MCP)
> can blow past the context limit — enable deliberately.

## 1.1 Enabling servers

Define servers under `mcp`, keyed by a unique name you can then reference in prompts
(e.g. "use the `context7` tool"):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "name-of-mcp-server": { /* … */ "enabled": true },
    "name-of-other-server": { /* … */ }
  }
}
```

Set `"enabled": false` to temporarily disable a server without deleting its config.

**Overriding remote defaults.** If your org ships MCP servers (disabled by default) via
`.well-known/opencode`, opt in by re-declaring the server locally with `"enabled": true`;
your local values win.

## 1.2 Local servers

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-local-mcp-server": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-command"],   // or ["bun", "x", "my-mcp-command"]
      "enabled": true,
      "environment": { "MY_ENV_VAR": "my_value" }
    }
  }
}
```

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | ✓ | Must be `"local"` |
| `command` | array | ✓ | Command + args to launch the server |
| `cwd` | string | | Working dir (relative paths resolve from the workspace) |
| `environment` | object | | Env vars for the server process |
| `enabled` | boolean | | Enable/disable on startup |
| `timeout` | number | | ms to fetch tools; default **5000** |

## 1.3 Remote servers

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-remote-mcp": {
      "type": "remote",
      "url": "https://my-mcp-server.com",
      "enabled": true,
      "headers": { "Authorization": "Bearer MY_API_KEY" }
    }
  }
}
```

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | ✓ | Must be `"remote"` |
| `url` | string | ✓ | Server URL |
| `enabled` | boolean | | Enable/disable on startup |
| `headers` | object | | Request headers |
| `oauth` | object \| `false` | | OAuth config, or `false` to disable auto-detection |
| `timeout` | number | | ms to fetch tools; default **5000** |

Reference env vars in strings with `{env:VAR_NAME}`.

## 1.4 OAuth

For remote servers, OpenCode handles OAuth automatically: it detects a 401, initiates the
flow, uses **Dynamic Client Registration (RFC 7591)** when supported, and stores tokens in
`~/.local/share/opencode/mcp-auth.json`.

- **Automatic**: just configure the remote server; you'll be prompted to authenticate on
  first use, or trigger it manually.
- **Pre-registered**: supply credentials under `oauth`:

  ```jsonc
  "oauth": {
    "clientId": "{env:MY_MCP_CLIENT_ID}",
    "clientSecret": "{env:MY_MCP_CLIENT_SECRET}",
    "scope": "tools:read tools:execute"
  }
  ```
- **Disable OAuth** (API-key servers): set `"oauth": false` and pass a header instead.

**CLI:**

```bash
opencode mcp auth <server>      # run the browser OAuth flow
opencode mcp list               # list servers + auth status
opencode mcp logout <server>    # remove stored credentials
opencode mcp auth list          # auth status of all OAuth-capable servers
opencode mcp debug <server>     # test connectivity + OAuth discovery
```

## 1.5 Managing which tools are active

MCP tools are just tools, so control them under `tools` (globally) or per-agent.

**Globally disable** a server (or all matching, via glob):

```jsonc
{
  "mcp": {
    "my-mcp-foo": { "type": "local", "command": ["bun", "x", "my-mcp-command-foo"] },
    "my-mcp-bar": { "type": "local", "command": ["bun", "x", "my-mcp-command-bar"] }
  },
  "tools": { "my-mcp*": false }   // disable every server whose name starts with my-mcp
}
```

> Tool names are registered as `<servername>_<tool>`, so to disable all of one server's
> tools use `"mymcpservername_*": false`.

**Per-agent enable** (keep it off globally, on for one agent):

```jsonc
{
  "mcp": { "my-mcp": { "type": "local", "command": ["bun", "x", "my-mcp-command"], "enabled": true } },
  "tools": { "my-mcp*": false },
  "agent": { "my-agent": { "tools": { "my-mcp*": true } } }
}
```

Glob semantics: `*` = zero+ chars, `?` = exactly one char, everything else literal.

## 1.6 Worked examples

**Sentry (OAuth):**

```jsonc
{ "mcp": { "sentry": { "type": "remote", "url": "https://mcp.sentry.dev/mcp", "oauth": {} } } }
```
Then `opencode mcp auth sentry`, and prompt: *"Show me the latest unresolved issues. use sentry"*.

**Context7 (docs search, optional API key):**

```jsonc
{ "mcp": { "context7": {
    "type": "remote", "url": "https://mcp.context7.com/mcp",
    "headers": { "CONTEXT7_API_KEY": "{env:CONTEXT7_API_KEY}" } } } }
```

**Playwright (local):**

```jsonc
{ "mcp": { "playwright": { "type": "local", "command": ["npx", "@playwright/mcp@latest"], "enabled": true } } }
```

Tip: rather than adding "use X" to each prompt, add routing guidance to your `AGENTS.md`
(e.g. *"When you need to search docs, use `context7` tools."*).

---

# 2. Plugins (the hooks system)

Plugins extend OpenCode by hooking into lifecycle events and customizing behavior — add
features, integrate services, gate/modify tool calls, or register custom tools. A plugin is
a **JS/TS module** exporting one or more plugin functions; each receives a context object
and returns a **hooks object**.

## 2.1 Loading plugins

**Local files** (auto-loaded at startup):

- `.opencode/plugins/` — project-level
- `~/.config/opencode/plugins/` — global

**From npm** — list packages in config (installed automatically with Bun at startup; cached
in `~/.cache/opencode/node_modules/`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-helicone-session", "opencode-wakatime", "@my-org/custom-plugin"]
}
```

You can also install via `opencode plugin add …` (updates your config).

**Load order:** global config → project config → global plugin dir → project plugin dir. All
hooks from all sources run in sequence. Duplicate npm packages (same name+version) load once;
a local and an npm plugin with similar names both load.

## 2.2 Dependencies

Local plugins/custom tools may use npm packages. Add a `package.json` to your config dir and
OpenCode runs `bun install` at startup:

```json
// .opencode/package.json
{ "dependencies": { "shescape": "^2.1.0" } }
```

## 2.3 Plugin structure

```js
// .opencode/plugins/example.js
export const MyPlugin = async ({ project, directory, worktree, client, $ }) => {
  console.log("Plugin initialized!")
  return {
    // hook implementations go here
  }
}
```

The context object provides:

| Field | Description |
| --- | --- |
| `project` | Current project info |
| `directory` | Current working directory |
| `worktree` | Git worktree path |
| `client` | OpenCode SDK client (for interacting with the app/AI; use `client.app.log(...)`) |
| `$` | Bun shell API for running commands |

**TypeScript** — import the type for full type-safety:

```ts
import type { Plugin } from "@opencode-ai/plugin"
export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return { /* type-safe hooks */ }
}
```

## 2.4 Hook functions vs. events

Two ways to react:

1. **Named hook functions** returned from the plugin — these can **modify or block** behavior
   (e.g. mutate tool args, throw to abort). Key ones:
   - `tool.execute.before` `(input, output)` — inspect/mutate `output.args` before a tool
     runs, or `throw` to block it.
   - `tool.execute.after` — post-process results.
   - `shell.env` `(input, output)` — inject env vars into all shell execution (agent tools
     and user terminals).
   - `experimental.session.compacting` `(input, output)` — inject/replace the compaction
     prompt (`output.context.push(...)` or set `output.prompt`).
   - `tool` — register custom tools (see 2.6).
2. **The generic `event` hook** — subscribe to the event bus for observation/notifications:

   ```js
   return {
     event: async ({ event }) => {
       if (event.type === "session.idle") { /* notify */ }
     }
   }
   ```

### Available events

| Group | Events |
| --- | --- |
| Command | `command.executed` |
| File | `file.edited`, `file.watcher.updated` |
| Installation | `installation.updated` |
| LSP | `lsp.client.diagnostics`, `lsp.updated` |
| Message | `message.part.removed`, `message.part.updated`, `message.removed`, `message.updated` |
| Permission | `permission.asked`, `permission.replied` |
| Server | `server.connected` |
| Session | `session.created`, `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`, `session.status`, `session.updated` |
| Todo | `todo.updated` |
| Shell | `shell.env` |
| Tool | `tool.execute.after`, `tool.execute.before` |
| TUI | `tui.prompt.append`, `tui.command.execute`, `tui.toast.show` |

## 2.5 Example hooks

**Notify on completion (macOS):**

```js
// .opencode/plugins/notification.js
export const NotificationPlugin = async ({ $ }) => ({
  event: async ({ event }) => {
    if (event.type === "session.idle")
      await $`osascript -e 'display notification "Session completed!" with title "opencode"'`
  }
})
```

**Block reading `.env` files:**

```js
// .opencode/plugins/env-protection.js
export const EnvProtection = async () => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool === "read" && output.args.filePath.includes(".env"))
      throw new Error("Do not read .env files")
  }
})
```

**Inject env vars into every shell call:**

```js
export const InjectEnvPlugin = async () => ({
  "shell.env": async (input, output) => {
    output.env.MY_API_KEY = "secret"
    output.env.PROJECT_ROOT = input.cwd
  }
})
```

**Sanitize bash commands (uses an npm dep):**

```ts
import { escape } from "shescape"
export const MyPlugin = async (ctx) => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool === "bash") output.args.command = escape(output.args.command)
  }
})
```

## 2.6 Custom tools from a plugin

```ts
import { type Plugin, tool } from "@opencode-ai/plugin"
export const CustomToolsPlugin: Plugin = async (ctx) => ({
  tool: {
    mytool: tool({
      description: "This is a custom tool",
      args: { foo: tool.schema.string() },      // Zod-style schema
      async execute(args, context) {
        const { directory, worktree } = context
        return `Hello ${args.foo} from ${directory} (worktree: ${worktree})`
      }
    })
  }
})
```

A `tool` definition has `description`, `args` (Zod schema), and `execute`. Custom tools sit
alongside built-ins; if a plugin tool shares a built-in's name, the **plugin tool wins**.
(Standalone custom tools can also live in `.opencode/tools/` — see the Custom Tools docs.)

## 2.7 Logging

Prefer structured logging over `console.log`:

```ts
await client.app.log({
  body: { service: "my-plugin", level: "info", message: "Plugin initialized", extra: { foo: "bar" } }
})
```

Levels: `debug`, `info`, `warn`, `error`.

## 2.8 Compaction control

```ts
export const CompactionPlugin: Plugin = async () => ({
  "experimental.session.compacting": async (input, output) => {
    output.context.push("## Custom Context\n- Current task status\n- Key decisions\n- Files in flight")
    // or replace the whole prompt: output.prompt = "…"  (then output.context is ignored)
  }
})
```

---

# 3. Agent Skills

Skills define **reusable behavior** via `SKILL.md` files that OpenCode discovers from your
repo or home dir. They load **on demand** through the native `skill` tool — the agent sees
available skills (name + description) and loads full content only when needed.

## 3.1 Where skills live

One folder per skill, each with a `SKILL.md`. OpenCode searches:

| Path | Scope |
| --- | --- |
| `.opencode/skills/<name>/SKILL.md` | Project |
| `~/.config/opencode/skills/<name>/SKILL.md` | Global |
| `.claude/skills/<name>/SKILL.md` | Project (Claude compat) |
| `~/.claude/skills/<name>/SKILL.md` | Global (Claude compat) |
| `.agents/skills/<name>/SKILL.md` | Project (agent compat) |
| `~/.agents/skills/<name>/SKILL.md` | Global (agent compat) |

**Discovery:** for project-local paths, OpenCode walks up from the CWD to the git worktree,
loading matching `skills/*/SKILL.md` (under `.opencode/`, `.claude/`, `.agents/`) along the
way, plus the global equivalents.

## 3.2 Frontmatter

Each `SKILL.md` must start with YAML frontmatter. **Only** these fields are recognized
(unknown fields ignored):

| Field | Required | Notes |
| --- | --- | --- |
| `name` | ✓ | See naming rules below; must match the containing directory |
| `description` | ✓ | 1–1024 chars; specific enough for the agent to choose correctly |
| `license` | | optional |
| `compatibility` | | optional |
| `metadata` | | optional string→string map |

**Name rules:** 1–64 chars, lowercase alphanumeric with single-hyphen separators, no
leading/trailing `-`, no `--`, and it must match the folder name. Regex:

```
^[a-z0-9]+(-[a-z0-9]+)*$
```

## 3.3 Example

`.opencode/skills/git-release/SKILL.md`:

```markdown
---
name: git-release
description: Create consistent releases and changelogs
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: github
---

## What I do
- Draft release notes from merged PRs
- Propose a version bump
- Provide a copy-pasteable `gh release create` command

## When to use me
Use this when preparing a tagged release.
Ask clarifying questions if the versioning scheme is unclear.
```

## 3.4 How the agent sees & loads skills

OpenCode lists skills in the `skill` tool description:

```xml
<available_skills>
  <skill>
    <name>git-release</name>
    <description>Create consistent releases and changelogs</description>
  </skill>
</available_skills>
```

The agent loads one by calling: `skill({ name: "git-release" })`.

## 3.5 Permissions

Gate skill access with pattern-based permissions in `opencode.json`:

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "pr-review": "allow",
      "internal-*": "deny",
      "experimental-*": "ask"
    }
  }
}
```

| Permission | Behavior |
| --- | --- |
| `allow` | Skill loads immediately |
| `deny` | Hidden from the agent; access rejected |
| `ask` | User prompted for approval before loading |

Wildcards apply (`internal-*` matches `internal-docs`, `internal-tools`, …). Note that
`skill` is also one of OpenCode's permission keys generally (alongside `read`, `edit`,
`bash`, `task`, etc.).

## 3.6 Per-agent overrides

**Custom agent** (in agent markdown frontmatter):

```yaml
---
permission:
  skill:
    "documents-*": "allow"
---
```

**Built-in agent** (in `opencode.json`):

```json
{ "agent": { "plan": { "permission": { "skill": { "internal-*": "allow" } } } } }
```

## 3.7 Disabling skills entirely

For agents that shouldn't use skills at all, turn off the `skill` tool — this omits the
`<available_skills>` section completely.

```yaml
# custom agent frontmatter
---
tools:
  skill: false
---
```

```json
// built-in agent
{ "agent": { "plan": { "tools": { "skill": false } } } }
```

## 3.8 Troubleshooting

If a skill doesn't appear:

1. Verify the file is named `SKILL.md` in **all caps**.
2. Ensure frontmatter has both `name` and `description`.
3. Make skill names **unique** across all locations.
4. Check permissions — anything set to `deny` is hidden from the agent.

---

## Appendix A — file/config map

```
~/.config/opencode/
├── opencode.json          # global config (mcp, plugin, tools, agent, permission, …)
├── plugins/*.{js,ts}      # global plugins (hooks)
├── skills/<name>/SKILL.md # global skills
├── agents/  commands/  tools/  themes/

<project>/
├── opencode.json          # project config (overrides global)
├── AGENTS.md              # rules / routing guidance for the agent
└── .opencode/
    ├── package.json       # deps for local plugins/tools (bun install at startup)
    ├── plugins/*.{js,ts}
    ├── skills/<name>/SKILL.md
    ├── agents/  commands/  tools/

Runtime/state:
~/.local/share/opencode/mcp-auth.json   # MCP OAuth tokens
~/.local/share/opencode/auth.json       # provider credentials
~/.cache/opencode/node_modules/         # cached npm plugin deps
```

## Appendix B — quick command reference

```bash
opencode auth login                 # configure provider API keys
opencode mcp auth <server>          # OAuth for a remote MCP server
opencode mcp list | debug <server>  # status / diagnostics
opencode plugin add <pkg>           # install a plugin + update config
opencode run "…"                    # headless run (respects default_agent)
opencode serve [--port N]           # headless HTTP server (avoids MCP cold starts)
```

**Primary sources:** OpenCode Docs — MCP servers (`opencode.ai/docs/mcp-servers`), Plugins
(`opencode.ai/docs/plugins`), Agent Skills (`opencode.ai/docs/skills`), Agents
(`opencode.ai/docs/agents`), and Config (`opencode.ai/docs/config`).
