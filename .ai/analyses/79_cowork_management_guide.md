# Skills & Hooks in Claude Cowork: Storage, Management & Configuration

*A reference report covering macOS and Windows. Compiled June 2026.*

---

## Executive summary

Cowork is built on the same agentic engine as Claude Code and **shares configuration with it** — CLAUDE.md files, MCP servers, hooks, skills, and settings are read from the same `.claude` locations. That single fact drives almost everything in this report.

The practical split:

- **Skills** are first-class, UI-managed objects in Cowork. You manage them through *Customize → Skills* in the desktop app, and on disk they live in the shared `~/.claude/skills/` tree (plus per-project and plugin-bundled variants). This path is identical on macOS and Windows once `~` is resolved.
- **Hooks** are *not* a Cowork-native UI feature. They are a Claude Code construct configured in `settings.json` files. Because Cowork shares Claude Code's configuration, hooks placed in the right `settings.json` layer will apply, but you configure them by editing JSON, not through Cowork's interface.

One important caveat runs through the whole topic: skills *created inside a Cowork session* have historically been written to **ephemeral per-session directories** and can be deleted on cleanup. Canonical, persistent storage is `~/.claude/skills/`. This is the single biggest gotcha.

---

## Part 1 — The shared-configuration foundation

Anthropic's own documentation states that the desktop app runs the same engine as the CLI and that the two **share configuration: CLAUDE.md files, MCP servers, hooks, skills, and settings.** Cowork sits inside that same desktop app alongside Chat and Code.

Claude Code (and therefore Cowork) reads instructions, settings, skills, subagents, and memory from two roots:

- the **project directory** (`.claude/` inside a folder), and
- the **home directory** (`~/.claude/`).

On Windows, `~/.claude` resolves to `%USERPROFILE%\.claude`. If the `CLAUDE_CONFIG_DIR` environment variable is set, every `~/.claude` path lives under that directory instead. This is the master key for understanding cross-platform behavior: **the logical paths are the same; only the home-directory prefix differs.**

| Concept | macOS | Windows |
|---|---|---|
| User/home config root | `~/.claude/` → `/Users/<you>/.claude/` | `%USERPROFILE%\.claude\` → `C:\Users\<you>\.claude\` |
| Project config root | `<project>/.claude/` | `<project>\.claude\` |
| Override variable | `CLAUDE_CONFIG_DIR` | `CLAUDE_CONFIG_DIR` |

---

## Part 2 — Skills

### 2.1 Where skills are stored

Skills are folders. The only required file is `SKILL.md`; scripts, references, and assets are optional. There are three storage scopes:

| Scope | Path | Shared with team? | Notes |
|---|---|---|---|
| **Personal / user** | `~/.claude/skills/<skill-name>/SKILL.md` | No (personal) | Available across all projects on the machine. This is the canonical store. |
| **Project** | `<project>/.claude/skills/<skill-name>/SKILL.md` | Yes (commit to git) | Ships with the repo so the whole team gets it. |
| **Plugin-bundled** | Inside an installed plugin package | Via plugin distribution | A plugin bundles skills, connectors, and sub-agents into one install. |

The canonical personal path is identical across operating systems once `~` resolves:

- **macOS:** `/Users/<you>/.claude/skills/`
- **Windows:** `C:\Users\<you>\.claude\skills\`
- **Linux:** `/home/<you>/.claude/skills/`

A correctly structured skill is `~/.claude/skills/<skill-name>/SKILL.md` — exactly one folder deep. The most common installation error is double-nesting (`.../skill-name/another-folder/SKILL.md`), which causes the skill to be ignored. A folder without a `SKILL.md` directly inside it is also silently ignored.

### 2.2 How skills are managed in Cowork

For day-to-day use, you don't touch the filesystem. Cowork (and Chat) expose skills through the desktop UI:

- **Customize → Skills** in the left sidebar lists your skills, each with an on/off toggle. Disabled skills aren't available to Claude.
- The **"+" button → Browse skills** opens the unified directory (skills, connectors, plugins in one place). Installing a skill from the directory adds it to your list, enabled by default. Directory-installed skills are **view-only** — to modify one, download a copy, edit it, and re-upload as your own.
- **Custom skills you upload are private to your account.** On Team/Enterprise plans they can be shared with colleagues or org-wide (sharing is off by default and must be enabled by an owner).

A skill enabled in your Claude settings is automatically available everywhere Claude operates — Cowork, Chat, the Code tab, the API, and the Excel/PowerPoint/Word/Outlook add-ins. Build a skill once; it works across surfaces.

**Prerequisite:** Skills depend on **Code execution and file creation** being enabled (*Settings → Capabilities*). On Enterprise, an owner must enable both *Code execution and file creation* and *Skills* at the org level first; on Team it's on by default; on Max/Pro/Free you enable it yourself.

### 2.3 The ephemeral-skill gotcha (critical)

This is the most important operational risk. Skills **created during a Cowork session** by the skill-creator have historically been written to an ephemeral per-session directory (a `local_<uuid>/.claude/skills/` path), and that directory is **permanently deleted when the session is cleaned up** — with no warning and no built-in promotion step.

The practical implications:

- Don't treat a skill you just had Claude build mid-session as saved. Until it lives in `~/.claude/skills/`, it's at risk.
- The reliable pattern is to ensure user-created skills land in (or are copied to) the persistent `~/.claude/skills/` store. A known community workaround is to create `~/.claude/skills/` as the persistent store and symlink skills into Cowork's per-session skills directory.
- Note that historically Cowork did **not** read Claude Code's `~/.claude/CLAUDE.md` persistent memory, and the four desktop surfaces (Chat, Cowork, Code terminal, Code VS Code) have used somewhat isolated storage silos. Behavior here is actively evolving, so verify against current docs for your app version.

### 2.4 Cowork's own customization layers (not the same as skills)

Cowork adds higher-level customization that sits alongside skills and shouldn't be confused with them:

- **Global instructions** — standing instructions for every Cowork session. *Settings → Cowork → Global instructions → Edit.*
- **Folder instructions** — project-specific context attached when you select a local folder; Claude can update these itself during a session.
- **Plugins** — bundle skills + connectors + sub-agents into one install; managed via *Use plugins in Cowork*, with admin-created private marketplaces on Team/Enterprise.
- **Projects** — persistent workspaces with their own files, links, instructions, and memory (memory persists *within* a project but not across standalone sessions).
- **Scheduled tasks** — created with `/schedule`; stored by default under `~/Documents/Claude/Scheduled/` (a user-visible, permissions-gated location, distinct from the app-managed config tree). On Windows this rides on the Documents folder, which causes problems if Documents is redirected to a non-system drive.

---

## Part 3 — Hooks

### 3.1 What hooks are

Hooks run your own shell commands (or other handlers) at fixed lifecycle checkpoints in an agent session — before a tool call, after a file edit, when a session ends, and so on. Unlike CLAUDE.md or rules, which are *guidance* Claude may or may not follow, **hooks execute deterministically** and are the mechanism for things that must happen (auto-formatting, secret scanning, logging) or hard rules that must be enforced.

Hook handler types: **command** (shell script), **http** (POST to a URL), **mcp_tool** (invoke a connected MCP server's tool), **prompt** (ask a model for a decision), and **agent** (run a subagent to validate). Most are command hooks. A command hook receives JSON on stdin (`tool_name`, `tool_input`, `cwd`, `session_id`, etc.) and can return JSON on stdout to allow, block, or inject context. **Exit code 2 blocks** the tool call and surfaces stderr to Claude.

Common lifecycle events include `PreToolUse`, `PostToolUse`, `Stop`, `Notification`, `ConfigChange`, and `WorktreeCreate`.

### 3.2 Where hooks are configured

Hooks are **not configured through a Cowork UI**. They live as a top-level `hooks` field inside `settings.json`, at the same level as `permissions`. Because Cowork shares Claude Code's configuration, the same `settings.json` layering applies. The layers, lowest to highest precedence:

| Layer | macOS path | Windows path | Committed? |
|---|---|---|---|
| **User** | `~/.claude/settings.json` | `%USERPROFILE%\.claude\settings.json` | No (personal, all projects) |
| **Project (shared)** | `<project>/.claude/settings.json` | `<project>\.claude\settings.json` | Yes (git) |
| **Project (local)** | `<project>/.claude/settings.local.json` | `<project>\.claude\settings.local.json` | No (auto-gitignored) |
| **CLI flags** | (invocation only) | (invocation only) | — |
| **Managed / enterprise** | `/Library/Application Support/ClaudeCode/managed-settings.json` | `C:\Program Files\ClaudeCode\managed-settings.json` | IT-deployed, cannot be overridden |

(On Linux the managed path is `/etc/claude-code/managed-settings.json`.)

A minimal hook block looks like this and goes in whichever `settings.json` layer is appropriate:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write" }
        ]
      }
    ]
  }
}
```

### 3.3 Precedence and merge behavior for hooks

- **Hooks from multiple layers are merged and all run** — they are not overwritten. The effective precedence chain is enterprise/policy > project > user > local for *conflicts*, but hook arrays generally concatenate so multiple sources' hooks coexist.
- **Scalar settings** (like `model`) take the highest-precedence value; **array settings** (like `permissions.allow` and hooks) concatenate and dedupe across scopes.
- **Workspace trust is required:** hooks are silently skipped in untrusted workspaces. This matters in Cowork, where you grant access folder-by-folder.
- **Config is snapshotted at session start** for hooks; Claude Code watches settings files and reloads many keys live, but for a running agent session you should assume hook changes apply on the next session.

### 3.4 Enterprise lockdown of hooks and skills

For managed environments, administrators can constrain both surfaces:

- **`strictPluginOnlyCustomization`** blocks skills, agents, hooks, and MCP servers from user and project sources, so they can only come from plugins or managed settings. Set it to `true` to lock all four, or pass an array like `["skills", "hooks"]` to lock only the named ones (requires a recent Claude Code version).
- **`allowManagedHooksOnly`** prevents users from adding their own hooks.
- Managed settings are the absolute floor: a deny rule or hook policy there cannot be relaxed by any lower layer or CLI flag. If the managed JSON is malformed, it is silently ignored and users fall back to their own settings — so validate before deploying.
- Within the managed tier itself, sources do **not** merge: server-managed wins, then MDM, then the on-disk file.

---

## Part 4 — Programmatic management

Both surfaces are file-based, so both can be scripted — with important caveats.

### Skills
Create or update a skill by writing a `<skill-name>/SKILL.md` folder into the right scope:

- **macOS:** `~/.claude/skills/<name>/SKILL.md`
- **Windows:** `%USERPROFILE%\.claude\skills\<name>\SKILL.md`

Keep it exactly one level deep. The desktop UI syncs with this filesystem location, so a skill written here should appear in *Customize → Skills*. For skills you want Claude to invoke automatically, the `description` frontmatter is what drives auto-invocation; `disable-model-invocation: true` makes it user-only, and `user-invocable: false` hides it from the `/` menu while still letting Claude invoke it.

### Hooks
Hooks are edited as JSON inside the appropriate `settings.json`. You can script edits with any tool (or `jq`), but:

- Validate the JSON before saving — a stray trailing comma silently disables the block.
- Place the hook in the layer matching its intended scope (user vs project vs local vs managed).
- Assume a **session restart** is needed for a running Cowork/agent session to pick up hook changes.

### What you cannot fully script
Org-level toggles (enabling Skills / Code execution on Team/Enterprise), directory-installed view-only skills, and OAuth-based remote connectors are governed through the UI / admin console rather than local files.

---

## Part 5 — macOS vs Windows: the consolidated differences

For skills and hooks specifically, the OS differences are small and mostly about path prefixes:

| Aspect | macOS | Windows |
|---|---|---|
| Home config root | `/Users/<you>/.claude/` | `C:\Users\<you>\.claude\` |
| Skills (canonical) | `~/.claude/skills/` | `%USERPROFILE%\.claude\skills\` |
| Hooks / settings (user) | `~/.claude/settings.json` | `%USERPROFILE%\.claude\settings.json` |
| Managed settings | `/Library/Application Support/ClaudeCode/managed-settings.json` | `C:\Program Files\ClaudeCode\managed-settings.json` |
| Scheduled-task storage | `~/Documents/Claude/Scheduled/` | `%USERPROFILE%\Documents\Claude\Scheduled\` |
| Notable platform pitfall | TCC/permissions prompts can gate the Documents-based scheduled-task path | Documents redirected to a non-system drive (e.g. `D:\`) breaks scheduled-task/skill mounting; non-standard Documents paths cause SKILL.md "not accessible from session VM" errors |

The logical model is identical on both platforms because both resolve from `~/.claude` (or `CLAUDE_CONFIG_DIR`). The real Windows-specific risks cluster around **non-standard Documents-folder locations**, not around skills/hooks config paths themselves.

---

## Part 6 — Practical recommendations

1. **Treat `~/.claude/skills/` as the source of truth for skills.** Author or copy skills there for persistence across all surfaces and projects, rather than relying on anything created transiently inside a Cowork session.
2. **After creating a skill mid-session, verify it persisted** to `~/.claude/skills/` before closing the session.
3. **Configure hooks in the narrowest appropriate `settings.json` layer** — `settings.local.json` to test personally, project `settings.json` to share with a team, managed settings for enforcement.
4. **Validate hook JSON** before saving and **restart the session** to be sure changes take effect.
5. **On Windows, keep your Documents folder in its default location** (or be ready to troubleshoot) if you use scheduled tasks or session-VM-mounted skills.
6. **For org control,** use `strictPluginOnlyCustomization` / `allowManagedHooksOnly` plus managed settings to lock the supply chain to plugins and IT-approved sources.

---

## Sources & verification note

This report synthesizes Anthropic's official Claude Code and Claude Help Center documentation (the `.claude` directory reference, Cowork getting-started and safety articles, the skills and unified-directory help pages, and the settings/hooks references) together with corroborating community documentation and tracked GitHub issues (notably the ephemeral-skill-storage and Windows Documents-path issues).

Cowork has moved quickly — from research preview to GA across macOS and Windows — and behaviors around cross-surface skill/memory sharing and scheduled-task storage are actively changing. **Before relying on any specific path or precedence detail for a production or enterprise setup, confirm against the current docs at code.claude.com/docs and support.claude.com for your installed app version.**