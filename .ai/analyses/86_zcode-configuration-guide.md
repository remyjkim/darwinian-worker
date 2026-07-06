# ZCode Configuration Manual — MCP, Hooks & Skills

A practical reference for extending **ZCode**, the Agentic Development Environment (ADE) from
**Z.AI / Zhipu AI**, tuned as the official harness for the GLM-5.2 model family. Covers the
three extension surfaces: connecting external tools via **MCP**, automating the agent loop
via **Hooks**, and packaging on-demand behavior via **Skills** — plus the **Plugin** layer
that bundles them.

> Docs verified against `zcode.z.ai/en/docs` (app v3.x, June 2026). ZCode is a **desktop app**
> (macOS/Windows primary; Linux beta) with a GUI-first configuration model — most wiring is
> done in **Settings**, with JSON/Markdown underneath. It is deliberately **Claude Code-
> compatible**: it imports MCP servers and skills from other agents, reuses `AGENTS.md`, and
> ships with access to the Claude Code plugin marketplace.

---

## 0. Mental model & where things live

ZCode is built *around the agent*, not an editor with AI bolted on. Everything the agent can
do is layered on top of **ZCode Agent** (the primary agent, tuned for GLM-5.2).

| Surface | What it does | Managed in | Trigger |
| --- | --- | --- | --- |
| **MCP** | Connects the agent to external tools/data (files, browser, memory, DBs, vision, search) | Settings → MCP Servers | Agent calls a tool |
| **Hooks** | Runs deterministic automation on lifecycle events | Bundled inside **Plugins** | Lifecycle event |
| **Skills** | On-demand `SKILL.md` "how-to" playbooks (optionally with scripts) | Settings → Skills | `$skill-name`, or agent picks it |
| **Plugins** | Package skills + commands + subagents + MCP + hooks + LSP into one toggle | Settings → Plugins | Enable/disable |

### Config directories & scopes

Almost everything has a **User** scope (all workspaces) and a **Workspace** scope (current
project), mirroring Claude Code's `~/.claude` vs `.claude` split:

| Scope | Path root | Shared how |
| --- | --- | --- |
| User (global) | `~/.zcode/` | Available across all your projects |
| Workspace (project) | `<project>/.zcode/` | Committed with the repo, shared via Git |

Manually-added and imported MCP servers are persisted into the `.zcode` config file of the
chosen scope. Skills live under `…/.zcode/skills/<name>/`. ZCode reads only the **user global
`AGENTS.md`** and the **current workspace `AGENTS.md`** for standing instructions (it does not
merge multiple `AGENTS.md` up the directory tree, and `CLAUDE.md` is used only once during
onboarding migration).

### Companion surfaces

`AGENTS.md` = persistent project rules/conventions · **Commands** (`/name`) = saved prompts ·
**Subagents** (`@name`) = delegated, isolated-context roles (see §5) · **Memory** = persistent
knowledge across sessions.

---

# 1. MCP servers

MCP (Model Context Protocol) connects external capabilities — file systems, browser
automation, memory, databases, vision, web search — to ZCode Agent. ZCode centralizes MCP
configuration so it's managed in one place and well-adapted to GLM-5.2 multi-step workflows.

## 1.1 The MCP Servers page

`Settings → MCP Servers`. The list is grouped by **source**:

- **Configured MCP servers** — added manually; you can edit, delete, enable, or disable them.
- **Plugin MCP servers** — installed together with a plugin and managed by that plugin.

Each row shows **name, source, transport, and command**.

## 1.2 Adding a server (Form mode)

Click **New MCP Server** (upper-right). Form mode is fastest for stdio servers:

1. **Scope** — **User** (all workspaces) or **Workspace** (current project only).
2. **Name** — e.g. `memory`.
3. **Type** — `stdio` (default), or `HTTP` / `SSE` for remote.
4. **Command + args** — e.g. command `npx`, args `-y @modelcontextprotocol/server-memory`.
5. **Environment variables** — expand and add any keys/paths the server needs.
6. **Add**, then confirm the server is enabled in the list.

For **remote** services choose `HTTP` or `SSE`, enter the URL, and expand **Headers
(optional)** to add auth (e.g. `Authorization`).

## 1.3 Full-configuration mode (paste JSON)

Switch to **Full configuration** to paste an existing block. ZCode accepts **both** shapes:

```jsonc
// bare object
{ "server-name": { "type": "stdio", "command": "npx", "args": ["-y", "pkg"] } }
```
```jsonc
// mcpServers wrapper (Claude-style)
{ "mcpServers": { "server-name": { "type": "stdio", "command": "npx", "args": ["-y", "pkg"] } } }
```

Transports and their key fields:

| Transport | Required fields | Optional |
| --- | --- | --- |
| `stdio` (local) | `command`, `args` | `env` / environment variables |
| `HTTP` (remote) | `url` | `headers` (e.g. `Authorization`) |
| `SSE` (remote) | `url` | `headers` |

## 1.4 Importing from another agent

If you already configured MCP servers in Claude Code, Codex CLI, or OpenCode, don't recreate
them. On the MCP Servers page click the **Import** icon (top-right). ZCode scans these sources:

| Source agent | File scanned |
| --- | --- |
| Claude Code | `~/.claude/settings.json` |
| Codex CLI | `~/.codex/config.toml` |
| OpenCode | `~/.config/opencode/opencode.json` |
| Generic `.agents` | `~/.agents/mcp.json` |

Pick the import **scope** (global or current workspace), select servers (or **Select all**),
and **Import**. Imported servers are copied into ZCode's `.zcode` config and are editable
independently — the original external files are left untouched.

## 1.5 Recommended Zhipu servers

These are the suggested starting points (each usually needs a **Zhipu API token**):

| Server | Adds |
| --- | --- |
| `zai-mcp-server` | Visual understanding — analyze images, screenshots, interface context |
| `web-search-prime` | Web search for up-to-date external information |
| `web-reader` | Webpage reading — parse page content, structure, key details |

Example full-config block for the Zhipu vision server (from Z.AI's developer docs):

```jsonc
{
  "mcpServers": {
    "zai-mcp-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@z_ai/mcp-server"],
      "env": { "Z_AI_API_KEY": "your_api_key", "Z_AI_MODE": "ZAI" }
    }
  }
}
```

`zai-mcp-server` exposes tools such as `extract_text_from_screenshot` (OCR),
`diagnose_error_screenshot`, `understand_technical_diagram`, `analyze_data_visualization`,
`ui_diff_check`, `image_analysis`, and `video_analysis`. Prereq: Node.js ≥ 22.

> Team tip: put shared services under **User** scope and project-specific servers under
> **Workspace** scope to keep configs clean. As with any agent, MCP tools consume context —
> enable deliberately, since token-heavy servers (e.g. GitHub) can crowd the window.

---

# 2. Hooks

Hooks are **deterministic automations that fire on lifecycle events**, running outside the
model's reasoning loop so something *always* happens regardless of what the model decides
(guards, formatters, audit logs, notifications).

## 2.1 How hooks are delivered in ZCode

ZCode does not (as of this writing) expose a standalone hooks-editor page. Instead, **Hook is
one of the components a Plugin can bundle** — alongside Skill, Command, Agent, MCP servers, and
LSP. Enabling a plugin registers its hooks into the workspace; disabling removes them. Because
this changes the Agent runtime, the current session **reloads automatically** after you toggle
a plugin.

Practically, that means you author hooks by **packaging them in a plugin** (or enabling a
plugin that already contains them), not by editing a global `hooks.json` in the UI.

## 2.2 Hook format (Claude Code-compatible)

ZCode is built to be Claude Code-compatible, and its hook surface follows the **Claude Code
hook convention**. A hook definition maps a **lifecycle event** → **matcher** → one or more
**command hooks**. Each hook receives event JSON on **stdin** and controls flow via **exit
code** (and optional JSON on stdout).

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/abs/path/.zcode/hooks/check-command.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\"" }
        ]
      }
    ]
  }
}
```

| Field | Meaning |
| --- | --- |
| event key | Lifecycle point (see §2.3) |
| `matcher` | Tool-name filter — e.g. `Bash`, `Write\|Edit`, `*` for all |
| `type` | `command` (shell). Claude-compatible tooling also supports `http` handlers |
| `command` | Executable that reads stdin JSON; use absolute paths |

## 2.3 Lifecycle events (inherited convention)

| Event | Fires | Can block? | Typical use |
| --- | --- | --- | --- |
| `PreToolUse` | Before a tool runs | **Yes** (exit 2 / `deny`) | Block `rm -rf`, protect `.env`/prod paths, gate commands |
| `PermissionRequest` | On an approval request | Yes | Auto-allow/deny specific safe commands |
| `PostToolUse` | After a tool completes | No (can't undo) | Format/lint edited files, log, verify |
| `UserPromptSubmit` | On prompt submit | Yes | Validate or enrich the prompt, inject context |
| `SessionStart` | Session begins | No | Load tickets/branch/checklist as context |
| `Stop` | Agent finishes | Loops (exit 2 continues) | Final validation; guard with `stop_hook_active` |
| `SubagentStart` / `SubagentStop` | Subagent lifecycle | varies | Scope work to delegated runs |
| `PreCompact` / `PostCompact` | Around context compaction | No | Preserve/inject context |
| `Notification` | Agent needs attention | No | Desktop pop-ups / sounds |

## 2.4 Exit codes & control

- **Exit 0** — success. `stdout` may be parsed as JSON for structured control (e.g.
  `permissionDecision: allow|deny|ask` on `PreToolUse`; `decision: block` on
  `PostToolUse`/`Stop`; `additionalContext` to feed text back to the agent).
- **Exit 2** — blocking error. `stderr` is shown to the agent as the reason; blocks per-event
  (deny the tool on `PreToolUse`; force continue on `Stop`).
- **Other non-zero** — non-blocking; surfaces `stderr` in verbose output.

Structured JSON example (block a write and explain why):

```json
{ "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Edits to generated files are not allowed" } }
```

## 2.5 Guard against Stop loops

A `Stop` hook that exits 2 makes the agent keep working — which can loop. Check the
`stop_hook_active` field and bail out on subsequent invocations:

```bash
#!/usr/bin/env bash
INPUT=$(cat)
[ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ] && exit 0
npm test || exit 2   # otherwise: run tests, force-continue on failure
```

## 2.6 Practical hooks

- **Block dangerous shell** — `PreToolUse` / matcher `Bash`: grep the command for
  `rm -rf`/`DROP TABLE`, `exit 2` to deny.
- **Auto-format on save** — `PostToolUse` / matcher `Write|Edit|MultiEdit`: run prettier or
  gofmt on the changed file.
- **Inject branch context** — `SessionStart`: emit `{"additionalContext":"Branch: …"}`.
- **Audible/desktop status** — `Notification` / `Stop`: play a sound or post a notification.

> Safety: hooks run with your user permissions — treat them as executable code. Keep them
> small and fast (a slow `PostToolUse` drags every edit), guard optional tools with
> `command -v <tool> >/dev/null || exit 0`, quote variables, and use absolute paths.

---

# 3. Skills

A Skill is a **reusable working instruction** — a `SKILL.md` file that tells the agent *when*
to use it, *how* to work, and *what output* is expected. Skills are the right layer for
repeated workflows (code review, API debugging, release notes, test reports) where you want a
consistent method and output format. (Use a **Command** for a simple saved prompt; use a
**Skill** when you need a full working method.)

## 3.1 Directory & naming

A skill is a **directory containing a `SKILL.md`**. The **directory name is the skill name**,
and that's what you reference in chat.

```
~/.zcode/skills/<skill-name>/SKILL.md      # user-level (all workspaces)
```

## 3.2 Minimal SKILL.md

```markdown
---
name: code-review-checklist
description: Review code changes with a focused checklist for correctness, regressions,
  tests, and maintainability.
---

# Code Review Checklist

Use this skill when reviewing a pull request, merge request, or local diff.
Focus on correctness, regressions, missing tests, risky API changes, and maintainability.
```

Frontmatter is minimal: **`name`** and **`description`**. The description is what the agent
uses to decide relevance, so make it specific and state *when* to use it. The markdown body is
the working method.

## 3.3 Scripts inside skills

Skills can bundle **executable scripts** (Python, Node.js, or other languages). The agent runs
the script and **only the output consumes context tokens — not the script source** — which
keeps large procedures cheap to invoke.

## 3.4 Managing & creating skills

`Settings → Skills` lists skills by source with name, description, and an enable switch. You
can:

- **Search** by name; **enable/disable** with the switch.
- Click **New Skill** — ZCode guides you through generating one with the agent in chat.
- After creating/editing a skill, click **Refresh** and confirm it appears under the right
  source with the switch on.

## 3.5 Importing skills from another agent

If you maintain skills in Claude Code, Codex CLI, OpenClaw, Augment, or Windsurf, click the
**Import** icon on the Skills page. In the dialog:

- Browse detected skills grouped by agent (each shows its directory path and skill count).
- **Select** the ones you want (or **Select All**).
- Choose an **import mode**:
  - **Symlink** — link to the external skill dir; ZCode follows later source changes, but
    depends on the source path staying available.
  - **Copy** — copy into ZCode as an independent, decoupled copy.
- Choose an **import target** — **Global** (user level) or the current **Project**.

Imported skills behave like ones you created — enable, disable, and invoke them with
`$skill-name`.

## 3.6 Invoking a skill

Type `$` in the chat input and select a skill; it becomes a tag, then keep typing your
request:

```
$code-review-checklist review my current changes
$release-notes write release notes for this change set
```

ZCode passes the referenced skill to the active agent, which follows its instructions.

## 3.7 What should become a skill

Make a skill when the task follows a **repeated workflow**, needs a **consistent output
format**, relies on **background knowledge / checklists / templates**, or will be **reused
across projects or conversations**.

---

# 4. Plugins — the packaging layer

Plugins are how ZCode **bundles and distributes** the other surfaces. A single plugin can
contain any mix of:

| Component | Description |
| --- | --- |
| **Skill** | `SKILL.md` playbooks |
| **Command** | Quick `/` commands |
| **Agent** | Subagents registered with the plugin |
| **MCP servers** | Shown under **Plugin MCP servers** in the MCP list |
| **Hook** | Automation hooks fired on events (see §2) |
| **LSP** | Language servers adding completion/diagnostics |

ZCode detects components from the plugin's **directory layout** and shows them as badges.
Enabling a plugin registers **all** its components; disabling removes them together, and the
session reloads.

**Managing:** `Settings → Plugins` shows name, version, source tag (e.g. `Official`), and
component counts. Before disabling, ZCode warns which skills/commands/MCP servers depend on it.

**Built-in official plugins** ship ready to use — notably **`android-emulator`** and
**`ios-simulator`** (each: 1 skill · 1 command · 1 MCP), letting ZCode Agent drive an emulator
or simulator end-to-end (build, install, launch, verify UI) in one conversation.

**Marketplaces:** ZCode ships with access to the **Claude Code official plugin marketplace**.
You can add third-party or private team marketplaces by pointing ZCode at a **Git repository**
or a hosted **`marketplace.json`**.

---

# 5. Note on subagents (accuracy caveat)

Some third-party reviews describe creating custom subagents via Markdown files in
`.zcode/agents/` with `name`/`description`/`model` frontmatter (Claude Code-style). **Per
ZCode's own current docs, that is not supported yet.** Today ZCode ships **one built-in
subagent, `Explore`** — a read-only codebase-research specialist the primary agent delegates
to for search, call-chain mapping, and evidence gathering. The docs explicitly list these as
*not available yet*: defining new subagents with Markdown, adding agent files under
`~/.zcode/cli/agents/`, custom-subagent frontmatter, `@`-selecting custom roles, and assigning
per-subagent models/tools/prompts. Treat custom-agent instructions from blog posts with
caution and verify against the version you're running. (Plugins *can* register subagents, so
this may expand.)

---

## Appendix A — file / settings map

```
~/.zcode/                         # USER scope (all workspaces)
├── skills/<name>/SKILL.md        # user skills  → invoke with $name
├── <mcp config in .zcode>        # user-scope MCP servers (also editable in UI)
└── AGENTS.md                     # user global standing instructions

<project>/.zcode/                 # WORKSPACE scope (per project, Git-shared)
├── skills/<name>/SKILL.md
├── hooks/<script>                # hook scripts referenced by a plugin's hooks
└── <mcp config in .zcode>

<project>/AGENTS.md               # workspace standing instructions (not merged up-tree)

Managed centrally in the app (Settings):
  MCP Servers · Plugins · Skills · Commands
```

## Appendix B — where each concept is configured

| Want to… | Do this |
| --- | --- |
| Add an external tool | Settings → MCP Servers → New MCP Server (Form or Full config) |
| Reuse tools from another agent | MCP Servers → Import (Claude Code / Codex / OpenCode / .agents) |
| Teach a repeatable workflow | Settings → Skills → New Skill; invoke with `$name` |
| Enforce a deterministic rule | Package a **hook** in a plugin (PreToolUse/PostToolUse/…) |
| Ship a bundle to your team | Build a **plugin** (skills+commands+MCP+hooks+LSP) via Git/marketplace |
| Set standing project rules | Edit `AGENTS.md` (user or workspace) |
| Research code safely | Ask the agent to use the built-in **Explore** subagent |

## Appendix C — quick facts

- **App:** desktop only (macOS/Windows primary, Linux beta); no web/VS Code extension.
- **Models:** BYO — GLM-5.2/GLM-5-Turbo via Z.AI/BigModel, or Anthropic, OpenAI, OpenRouter,
  Moonshot, MiniMax, DeepSeek, and any OpenAI/Anthropic-compatible endpoint.
- **Compatibility:** imports MCP + skills from Claude Code/Codex/OpenCode/others; reuses
  `AGENTS.md`; Claude Code-style hook + skill formats; Claude Code plugin marketplace.
- **Execution safety:** plan / confirm-before-change / auto-edit / full-access modes, with a
  confirmation flow for sensitive commands, file edits, and network/high-permission actions.

**Primary sources:** ZCode Docs — MCP Servers (`zcode.z.ai/en/docs/mcp-services`), Plugin
(`/docs/plugin`), Skill (`/docs/skill`), Subagents (`/docs/subagents`), ZCode Agent
(`/docs/agents`); Z.AI Developer Docs — Vision MCP Server (`docs.z.ai/devpack/mcp`). Hook
event/exit-code details reflect the Claude Code-compatible convention ZCode inherits; ZCode's
own docs currently surface hooks only as a plugin component, so validate specifics against your
installed version.
