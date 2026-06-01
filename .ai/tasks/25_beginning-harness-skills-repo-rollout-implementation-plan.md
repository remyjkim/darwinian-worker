<!-- ABOUTME: Implementation plan for the beginning-harness-skills GitHub repo (v1.0) -->
<!-- ABOUTME: One-PR rollout of 7 current-lane skills + 1 future-lane stub across Claude Code/Codex/Cursor/Vercel channels -->

# Beginning Harness Skills — Repo Rollout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Status**: Revised After CLI Audit
**Created**: 2026-05-26
**Updated**: 2026-05-27
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 2–3 focused sessions
**Dependencies**: analyses/38_bharness-agent-skills.md, analyses/39_beginning-harness-prd-v2-cards-era.md, tasks/24_plan1_matt-prd-cards-era-realignment.md
**References**: [analyses/38_bharness-agent-skills.md, analyses/39_beginning-harness-prd-v2-cards-era.md, tasks/24_plan1_matt-prd-cards-era-realignment.md, https://github.com/parallel-web/parallel-agent-skills, https://agentskills.io/specification, https://code.claude.com/docs/en/plugins.md, https://developers.openai.com/codex/skills, https://www.npmjs.com/package/skills]

---

## Goal

Create a new GitHub repository `beginning-harness-skills` that distributes the seven current-lane Beginning Harness agent skills (plus one future-lane stub) across four channels — Claude Code plugin/marketplace, Codex Plugin, Codex `$skill-installer`, and Vercel `npx skills add` — in a single v1.0.0 release.

## Architecture

The repo mirrors [`parallel-web/parallel-agent-skills`](https://github.com/parallel-web/parallel-agent-skills) (MIT, v0.4.4). One file layout satisfies all four distribution channels because `SKILL.md` is the universal currency (per [agentskills.io spec](https://agentskills.io/specification)) and each channel reads either the convention path (`skills/<name>/SKILL.md`) or one of two manifest files (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`) that all coexist.

Each `SKILL.md` is a thin agent-driven wrapper over the `bgng` CLI in `beginning-harness`. The skills are read-only or use `bgng`'s built-in `--dry-run` + `--json` flags for preview, with explicit user-ask checkpoints before any consequential mutation. The plugin name in `plugin.json` is `beginning` (not `beginning-harness-skills`) so user-facing invocations match the PRD notation `/beginning:bootstrap-project`.

## Tech Stack

- **Markdown** — `SKILL.md`, `README.md`, `CLAUDE.md`, `MAINTAINERS.md`
- **JSON** — plugin manifests, marketplace manifest, package metadata
- **YAML** — GitHub Actions workflows, pre-commit config, markdownlint config
- **Node / npm** (devDependencies only) — `markdownlint-cli2` for local + CI validation
- **GitHub Actions** — CI (lint + validate), create-tag, publish-release
- **No runtime dependencies** — the skills shell out to `bgng` only; the repo itself ships only markdown + manifests

## Out of Scope (deferred to follow-up tasks)

- bgng CLI changes (e.g., adding `--dry-run` / `--json` to card mutation commands) — tracked separately as future bgng work
- Real Harness Card catalog (we ship 1–2 minimal examples only)
- Cloudflare Worker CDN for skills distribution (parallel ships one; we don't need it at v1.0)
- Cursor-specific or Cline-specific manifests beyond what `npx skills add` auto-discovers
- Submission to `anthropics/claude-plugins-community` marketplace (post-v1.0 follow-up)
- Renaming of v2 PRD artifacts from `beginning-agent-skills` to `beginning-harness-skills` (small post-merge task; see Phase 9)
- Future-lane `organize-workspace` skill body (we ship only a stub explaining its future status)

## Decision Log (locked before drafting)

| # | Decision | Source |
|---|---|---|
| Repo name | `beginning-harness-skills` | Remy, this session |
| Plugin name (internal, in plugin.json) | `beginning` | Matches PRD `/beginning:*` invocation notation |
| Repo owner | Same GitHub identity as `beginning-harness` (`remyjkim`) | Remy, this session |
| Visibility | Private at creation; public at v1.0.0 tag | Remy, this session |
| License | MIT | Mirrors `parallel-agent-skills` and `beginning-harness` |
| Implementation depth | One big PR with full v1.0 | Remy, this session |
| bgng CLI coordination | Frozen; document gaps as future bgng work | Remy, this session |
| Seed cards | Hybrid — 1–2 minimal examples under `examples/cards/` | Remy, this session |
| Distribution channels at v1.0 | All four (Claude Code plugin + marketplace, Codex Plugin, Codex `$skill-installer`, Vercel `npx skills add`) | Remy, this session |

---

## Plan Structure

| Phase | What it produces |
|---|---|
| 0 — Local repo bootstrap | Local git repo with base scaffolding |
| 1 — Plugin manifests | `.claude-plugin/{plugin.json, marketplace.json}` + `.codex-plugin/plugin.json` |
| 2 — Current-lane skills | 7 fully-written `SKILL.md` files under `skills/<name>/` |
| 3 — Future-lane stub | `skills/organize-workspace/SKILL.md` with experimental notice |
| 4 — Documentation | `README.md`, `CLAUDE.md`, `MAINTAINERS.md`, install guides |
| 5 — CI / release plumbing | `.github/workflows/*.yml`, `.markdownlint.yaml`, `VERSION` |
| 6 — Example cards | `examples/cards/` with one minimal reference card |
| 7 — Local validation | Smoke-tested install in Claude Code (Codex/Cursor manual) |
| 8 — Remote repo + PR | GitHub repo created; PR opened for team review |
| 9 — Post-merge follow-ups | Tag v1.0.0, flip public, propagate rename to PRD artifacts |

---

## Execution Notes

- This plan has been reconciled against the live cards-era CLI on 2026-05-27.
- If implementation is requested under a `no new commit` constraint, treat the
  per-phase commit tasks as checkpoint markers only. The repo may be scaffolded
  fully and left uncommitted for review.

## Phase 0 — Local Repo Bootstrap

### Task 0.1: Decide and create the local working directory

**Files:** None yet — directory only.

**Step 1:** Pick the local directory. Recommendation: sibling to `beginning-harness`, i.e., `/Users/pureicis/dev/beginning-harness-skills/`. Verify the path is free.

```bash
ls /Users/pureicis/dev/beginning-harness-skills 2>/dev/null && echo "EXISTS — pick another path" || echo "OK"
```

Expected: `OK`.

**Step 2:** Create the directory and `cd` into it.

```bash
mkdir -p /Users/pureicis/dev/beginning-harness-skills
cd /Users/pureicis/dev/beginning-harness-skills
```

**Step 3:** Initialize git.

```bash
git init -b main
```

Expected: `Initialized empty Git repository in .../beginning-harness-skills/.git/` with `main` as the initial branch.

### Task 0.2: Add MIT LICENSE

**Files:**
- Create: `LICENSE`

**Step 1:** Create `LICENSE` with the standard MIT text. Copyright holder: `Remy Kim` (or match the spelling on `beginning-harness`'s LICENSE — verify by reading `/Users/pureicis/dev/beginning-harness/LICENSE` first).

```
MIT License

Copyright (c) 2026 <holder>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Task 0.3: Add `.gitignore`

**Files:**
- Create: `.gitignore`

**Content:**

```
# Node
node_modules/
npm-debug.log*
.pnpm-store/

# macOS
.DS_Store

# Editor
.idea/
.vscode/
*.swp

# Build artifacts (none today, reserved)
dist/
build/

# Local environment overrides
.env
.env.local
```

### Task 0.4: Add `.editorconfig`

**Files:**
- Create: `.editorconfig`

**Content:**

```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

### Task 0.5: Add `VERSION`

**Files:**
- Create: `VERSION`

**Content (literal single line, no trailing newline beyond what editorconfig adds):**

```
0.1.0
```

Rationale: start at `0.1.0`; bump to `1.0.0` only after manual smoke-tests pass (Phase 7) and team review approves (Phase 8). Subsequent releases follow SemVer via `release/v*` branches.

### Task 0.6: Add `package.json` (minimal, dev-only)

**Files:**
- Create: `package.json`

**Content:**

```json
{
  "name": "beginning-harness-skills",
  "private": true,
  "version": "0.1.0",
  "description": "Agent skills wrapping the bgng CLI for Claude Code, Codex, and Cursor.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/<owner>/beginning-harness-skills.git"
  },
  "scripts": {
    "lint:md": "markdownlint-cli2 \"**/*.md\" \"!node_modules/**\"",
    "validate:skills": "node scripts/validate-skills.mjs"
  },
  "devDependencies": {
    "markdownlint-cli2": "^0.13.0"
  }
}
```

Notes:
- `<owner>` is filled in once the GitHub repo is created (Phase 8). Keep as literal placeholder until then.
- `scripts/validate-skills.mjs` is created in Task 5.3.

### Task 0.7: Initial commit

**Step 1:** Stage and commit the bootstrap files.

```bash
git add LICENSE .gitignore .editorconfig VERSION package.json
git commit -m "[chore:repo] bootstrap beginning-harness-skills"
```

Expected: one commit on `main`.

---

## Phase 1 — Plugin Manifests

### Task 1.1: Write `.claude-plugin/plugin.json`

**Files:**
- Create: `.claude-plugin/plugin.json`

**Content:**

```json
{
  "name": "beginning",
  "version": "0.1.0",
  "description": "Agent-driven layer over the cards-era bgng CLI. Bootstrap projects, apply and author Harness Cards, manage defaults, inspect or repair harness state.",
  "author": {
    "name": "Remy Kim"
  },
  "homepage": "https://github.com/<owner>/beginning-harness-skills",
  "repository": "https://github.com/<owner>/beginning-harness-skills",
  "license": "MIT",
  "keywords": [
    "bgng",
    "beginning-harness",
    "harness-cards",
    "claude-code",
    "codex",
    "cursor",
    "agent-skills"
  ],
  "skills": "./skills"
}
```

Notes:
- `name: "beginning"` is intentional — keeps user-facing invocation `/beginning:bootstrap-project` as per PRD.
- `skills: "./skills"` tells Claude Code where to find the SKILL.md directories.

### Task 1.2: Write `.claude-plugin/marketplace.json`

**Files:**
- Create: `.claude-plugin/marketplace.json`

**Content:**

```json
{
  "name": "beginning-harness-skills",
  "owner": {
    "name": "Remy Kim"
  },
  "metadata": {
    "description": "Beginning Harness agent skills marketplace.",
    "version": "0.1.0",
    "pluginRoot": "."
  },
  "plugins": [
    {
      "name": "beginning",
      "description": "Agent skills wrapping the bgng CLI: bootstrap, cards, defaults, diagnostics, repair, recommendations.",
      "version": "0.1.0",
      "source": "./",
      "author": {
        "name": "Remy Kim"
      },
      "homepage": "https://github.com/<owner>/beginning-harness-skills",
      "repository": "https://github.com/<owner>/beginning-harness-skills",
      "license": "MIT",
      "keywords": ["bgng", "beginning-harness", "harness-cards"],
      "category": "developer-tools",
      "tags": ["cli-wrapper", "agent-driven", "cards-era"]
    }
  ]
}
```

### Task 1.3: Write `.codex-plugin/plugin.json`

**Files:**
- Create: `.codex-plugin/plugin.json`

**Content (Codex Plugin format with `interface` block, modeled on parallel's pattern):**

```json
{
  "name": "beginning",
  "version": "0.1.0",
  "description": "Agent-driven layer over the cards-era bgng CLI for Codex.",
  "author": {
    "name": "Remy Kim"
  },
  "homepage": "https://github.com/<owner>/beginning-harness-skills",
  "repository": "https://github.com/<owner>/beginning-harness-skills",
  "license": "MIT",
  "keywords": ["bgng", "beginning-harness", "harness-cards", "codex"],
  "skills": "./skills/",
  "interface": {
    "displayName": "Beginning Harness Skills",
    "shortDescription": "Agent skills wrapping the bgng CLI.",
    "longDescription": "Bootstrap projects, apply and author reusable Harness Cards, manage machine defaults, and inspect or repair harness state — with user-ask checkpoints at consequential writes.",
    "developerName": "Remy Kim",
    "category": "developer-tools",
    "capabilities": ["Read", "Write"],
    "websiteURL": "https://github.com/<owner>/beginning-harness-skills",
    "defaultPrompt": [
      "Bootstrap my harness in this repo",
      "Apply a Beginning Harness card",
      "Inspect why this skill is active",
      "Repair my harness state"
    ]
  }
}
```

### Task 1.4: Commit Phase 1

```bash
git add .claude-plugin/ .codex-plugin/
git commit -m "[feat:manifests] add Claude Code plugin/marketplace + Codex plugin manifests"
```

---

## Phase 2 — Current-Lane Skills (7 SKILL.md files)

Each skill follows the same SKILL.md template:

```yaml
---
name: <kebab-name>
description: "Use when <specific trigger conditions and scope>. <Optional short capability summary.>"
---

# <skill name>

## Purpose

<2–3 sentences>

## Procedure

<numbered LLM steps wrapping bgng commands>

## User-ask points

<bullets for each halt-and-confirm step>

## Wraps

<bgng commands listed with `code` formatting>

## Scope

<project / machine / card source / downstream>

## Failure modes

<bullets — what to do when bgng exits non-zero or returns ambiguous state>

## Related skills

<list other skills that complement this one>
```

The seven SKILL.md tasks below give the **full content** for each file. The engineer pastes verbatim, adjusting only `<version>` placeholders and any author info.

Important portability rule:

- Use the minimum portable frontmatter contract: `name` and `description`
  only.
- Put scope, blast radius, prerequisites, and operational constraints in the
  Markdown body, not in custom frontmatter keys.
- This keeps the skills closer to the common `agentskills.io` shape while still
  working inside Claude Code plugins and Codex plugin distributions.

### Task 2.1: `skills/bootstrap-project/SKILL.md`

**Files:**
- Create: `skills/bootstrap-project/SKILL.md`

**Full content:**

````markdown
---
name: bootstrap-project
description: "Use when initializing Beginning Harness in the current project, enabling extensions, or applying starter cards with approval checkpoints before downstream writes."
---

# bootstrap-project

## Purpose

Initialize the Beginning Harness for the current repo. Optionally enable extensions (Parallel, Beads, MarkItDown) and apply a starter card. Surface every mutation as a JSON `changes` preview and ask the user to approve before writing to `.claude/`, `.codex/`, or `.cursor/`.

Requires `bgng` on PATH. Scope is primarily **project**. Blast radius is
**medium** because this skill can mutate project config, card.lock, and
downstream generated agent-tool files.

## Procedure

1. Verify bgng is installed: `bgng --version`. If exit ≠ 0, halt and tell the user to install bgng before proceeding.
2. Read current state: `bgng status --json`. If `project` is null, the current directory is not a bgng project — confirm with the user before continuing (User-ask point 1).
3. Preflight the store: `bgng store status --json`. If `legacyLayoutDetected: true`, pause and ask the user to confirm running `bgng store migrate` before any other work (User-ask point 2).
4. If `project` is null and the user confirmed in step 2, run `bgng init` (interactively if a TTY, else `bgng init --non-interactive`).
5. Ask the user about **scope**: project-only, or also machine defaults? (User-ask point 3). Record the answer; subsequent steps respect this.
6. Ask the user which extensions to enable from `{parallel, beads, markitdown}` (User-ask point 4). For each chosen extension:
   1. Run `bgng extensions add <name> --dry-run --json`. Show the user the `projectChanges` and `next` arrays.
   2. On approval (User-ask point 5), run `bgng extensions add <name>`.
   3. If the extension recommends setup, run `bgng extensions setup <name> --dry-run --json`. Show `steps` and `warnings`.
   4. On approval (User-ask point 6), run `bgng extensions setup <name>` with the appropriate flags (Beads may want `--target=<targets>`, MarkItDown may want `--install`).
7. If the user mentioned a domain ("react", "python", "node-cli", etc.), surface a starter card:
   1. Run `bgng card list --json`. There is no `bgng search card` today, so filter the published local cards heuristically by name and manifest description.
   2. Optionally run `bgng search skill "<query>" --json` as a separate read-only aid if the user may want direct skill recommendations rather than a card.
   3. Show the user any matching cards. If they pick one, capture the spec (e.g., `@me/backend@^1.0.0`).
8. Apply the chosen card (User-ask point 7): `bgng apply <card-spec>`. Note: this mutates `.agents/bgng/config.json` and `.agents/bgng/card.lock` immediately. The downstream effect is not yet visible to the agents — that happens at the next `bgng write`.
9. Preview the final write: `bgng write --dry-run --json`. Show the `changes` array to the user.
10. On approval (User-ask point 8), run `bgng write`.
11. Confirm with `bgng status --why <skill-or-server>` for any new skill or MCP server the user is curious about.

## User-ask points

1. **Init the project?** — when `bgng status --json` shows `project: null`.
2. **Run store migrate?** — when `bgng store status --json` shows `legacyLayoutDetected: true`.
3. **Scope** — project-only, or also machine defaults?
4. **Which extensions?** — pick from `parallel`, `beads`, `markitdown` (multi-select).
5. **Confirm extension add** — show the `dry-run --json` output before mutating.
6. **Confirm extension setup** — show the `dry-run --json` `steps` + `warnings`.
7. **Confirm card application** — `bgng apply <spec>` mutates project config; surface the card spec and explain the change.
8. **Confirm final write** — show `bgng write --dry-run --json` `changes` before running `bgng write`.

## Wraps

`bgng --version` · `bgng status --json` · `bgng status --why` · `bgng store status --json` · `bgng store migrate` · `bgng init` · `bgng extensions add` · `bgng extensions setup` · `bgng card list --json` · `bgng search skill` · `bgng apply` · `bgng write --dry-run --json` · `bgng write`

## Scope

**Project** (with optional touch on machine defaults if the user chose that in step 5; in that case, additionally run `bgng library defaults add skill <name>` or `bgng library defaults add mcp <name>` per the scope choice).

## Failure modes

- **bgng not on PATH** → halt, suggest installation per `beginning-harness` README.
- **Project not a git repo** → warn (bgng will too), but allow continuation if the user agrees.
- **Card resolution fails** (`bgng apply` exit ≠ 0 with an unresolved card name) → surface the unresolved name verbatim, do NOT proceed to `bgng write`.
- **Extension setup fails** → surface stderr, halt, do not proceed to the next extension or to write.
- **`bgng write --dry-run --json` returns empty `changes`** → harness is already in the desired state; tell the user and skip the write.

## Related skills

`apply-harness-card` · `recommend-harness` · `inspect-harness`
````

### Task 2.2: `skills/apply-harness-card/SKILL.md`

**Files:**
- Create: `skills/apply-harness-card/SKILL.md`

**Full content:**

````markdown
---
name: apply-harness-card
description: "Use when applying, adding, pinning, removing, updating, detaching, or inspecting Harness Cards in the current project before materializing downstream changes."
---

# apply-harness-card

## Purpose

Manage the project's Harness Card set: apply a fresh set, add or remove individual cards, pin to exact versions, refresh the lockfile, detach the entire project from cards, or inspect what's currently applied. All consequential writes are previewed via `bgng write --dry-run --json` and confirmed with the user.

Requires `bgng` on PATH. Scope is **project**. Blast radius is **medium**
because this skill mutates project config, card.lock, and often downstream
generated state after `bgng write`.

## Procedure

1. Read current project card state: `bgng card status --json` and `bgng card list --json`. Show the user what's currently applied: `specs`, `locked`, `outdated`.
2. Disambiguate user intent. Likely paths:
   - "Apply this card" → `bgng apply <spec>` (replaces full card set with the new spec(s))
   - "Add card X" → `bgng card add <spec>`
   - "Pin card Y to version Z" → `bgng card pin <spec>` (where spec includes the exact version)
   - "Remove card X" → `bgng card remove <name>`
   - "Detach all cards from this project" → `bgng card detach`
   - "Update lockfile" → `bgng card update`
   - "What's outdated?" → `bgng card outdated --json` (read-only; surface results)
3. Confirm the card-set change with the user (User-ask point 1). Show the exact mutation: before-set vs after-set, and for pins/updates show requested-vs-locked version transitions.
4. Run the chosen `bgng card *` command. **Note**: these card commands lack `--dry-run` today — the mutation to `.agents/bgng/config.json` + `.agents/bgng/card.lock` happens immediately. Downstream effect on `.claude/`, `.codex/`, `.cursor/` is deferred until `bgng write`.
5. Preview downstream effect: `bgng write --dry-run --json`. Show the `changes` array.
6. On approval (User-ask point 2), run `bgng write` (or pass `--write` to the card command in a single step if the user prefers).
7. Confirm the result: `bgng card status --json` for the new state, and `bgng status --why <skill>` if the user wants to see provenance for any newly active skill.

## User-ask points

1. **Confirm card set change** — show the requested mutation (apply/add/pin/remove/detach/update) and exact spec(s). For pins, show requested vs. current version explicitly.
2. **Confirm final write** — show `bgng write --dry-run --json` `changes` before running `bgng write`.

## Wraps

`bgng card status --json` · `bgng card list --json` · `bgng card outdated --json` · `bgng apply` · `bgng card add` · `bgng card pin` · `bgng card remove` · `bgng card detach` · `bgng card update` · `bgng write --dry-run --json` · `bgng write` · `bgng status --why`

## Scope

**Project** (card consumption is always project-scoped).

## Failure modes

- **Unresolved card spec** (`bgng apply` exit ≠ 0) → surface the unresolved name; do not proceed.
- **Duplicate card name on add** → bgng rejects; surface the conflict and ask the user whether they meant `pin` or `update` instead.
- **Card not found on remove/pin** → surface the missing name; offer `bgng card list --json` to help the user pick.
- **`outdated --json` returns empty** → nothing to do; tell the user.
- **bgng card mutations have no `--dry-run` today** → the agent must describe the planned mutation in prose before invoking the command. Do not chain `--write` until the user has explicitly approved.

## Related skills

`author-harness-card` · `inspect-harness` · `recommend-harness`
````

### Task 2.3: `skills/author-harness-card/SKILL.md`

**Files:**
- Create: `skills/author-harness-card/SKILL.md`

**Full content:**

````markdown
---
name: author-harness-card
description: "Use when creating, publishing, diffing, inspecting, or deprecating reusable Beginning Harness Cards from a local card source."
---

# author-harness-card

## Purpose

Drive the full card authoring lifecycle. `card new` creates an editable source folder under `~/.agents/bgng/sources/<name>/`; `card publish` snapshots it to `~/.agents/bgng/cards/<name>/<version>/` as an immutable artifact; `card diff` and `card show` inspect content; `card deprecate` marks an existing version as deprecated.

Requires `bgng` on PATH. Scope is **card source**. Blast radius is **medium**
because this skill creates local source directories, publishes immutable store
versions, and can mark versions deprecated.

## Procedure

1. Disambiguate user intent. Likely paths:
   - "Start a new card" → `card new`
   - "Publish my card" → `card publish`
   - "Show me card X" → `card show`
   - "Diff card X version A vs B" → `card diff`
   - "Deprecate card X" → `card deprecate`
2. For **`card new`**:
   1. Confirm the card name with the user (User-ask point 1). Unscoped names require either `--scope=<scope>` or a saved `authoring.scope` in machine config.
   2. There is no dedicated read-only CLI command for inspecting saved `authoring.scope`. If the user gives an unscoped name, prefer asking for an explicit `--scope=<scope>` (User-ask point 2) or tell them to use a fully-qualified name.
   3. Run `bgng card new <name>` (with `--scope=<scope>` if needed). The source dir is created under `~/.agents/bgng/sources/<name>/` and `git init` runs by default (suppress with `--no-git` if the user wants).
   4. Show the user the source dir path and the skeleton files (`card.json`, `skills/`, `mcp-servers/`).
3. For **`card publish`**:
   1. Confirm the card name and version with the user (User-ask point 3). `bgng card publish <name>` reads the version from `card.json`.
   2. `bgng card show` only inspects already-published card versions. Before first publish, inspect the source manifest directly from `~/.agents/bgng/sources/<name>/card.json` and show that to the user.
   3. On approval (User-ask point 4), run `bgng card publish <name>`. Once published, the version is immutable — cannot be overwritten.
4. For **`card show`**: run `bgng card show <ref> --json` and display the full card.json structure.
5. For **`card diff`**: run `bgng card diff <ref-a> <ref-b> --json` and display the diff.
6. For **`card deprecate`**:
   1. Confirm with the user (User-ask point 5). Deprecation is a metadata flag; it does not remove the card from the store.
   2. Run `bgng card deprecate <ref> --message "<reason>"` and surface the plain-text confirmation.

## User-ask points

1. **Confirm new card name** — verify spelling, kebab-case, scope.
2. **Confirm scope for `card new`** — ask `--scope=<scope>` if not saved in `authoring.scope`.
3. **Confirm publish target name + version** — surface what `card.json` declares.
4. **Confirm publish (immutable!)** — explicitly remind the user the version cannot be overwritten once published.
5. **Confirm deprecation** — name + version to mark deprecated.

## Wraps

`bgng card new` · `bgng card publish` · `bgng card show --json` · `bgng card diff --json` · `bgng card deprecate`

## Scope

**Card source** (the user's authoring workspace under `~/.agents/bgng/sources/`).

## Failure modes

- **Unscoped name without `--scope`** → bgng rejects; ask the user for `--scope=<scope>` and retry.
- **Existing version on publish** → bgng refuses to overwrite; tell the user and ask whether they want to bump the version in `card.json` first.
- **`card.json` invalid** → surface the parse error verbatim.
- **`card new` has no `--dry-run` today** → describe the action in prose before invoking; the operation is filesystem-creation, no `.claude/.codex/.cursor/` impact.

## Related skills

`apply-harness-card` · `manage-defaults` · `inspect-harness`
````

### Task 2.4: `skills/inspect-harness/SKILL.md`

**Files:**
- Create: `skills/inspect-harness/SKILL.md`

**Full content:**

````markdown
---
name: inspect-harness
description: "Use when inspecting Beginning Harness state, provenance, or drift without mutating anything, including explaining why a skill, MCP server, extension, or card is active."
---

# inspect-harness

## Purpose

Explain harness state without mutating anything. Provenance via `bgng status --why <name>`, drift via `bgng doctor --json`, card lineage via `bgng card status --explain`, store health via `bgng store status --json`, extension health via `bgng extensions status --json` and `bgng extensions doctor --json`. This is the diagnosis surface; repair is delegated to `repair-harness`.

Requires `bgng` on PATH. Scope is **project**, read-only. Blast radius is
**none**.

## Procedure

1. Read current state: `bgng status --json`. Surface the project block (if any), enabled targets, skill/MCP counts.
2. If the user named a specific skill / MCP server / extension / card: run `bgng status --why "<name>"`. Surface the provenance chain from the text output.
3. If the user asked "explain everything" or "show full state": run `bgng status --explain`. Surface the full text explanation.
4. Run `bgng doctor --json` to surface any drift, broken symlinks, stale generated files, MCP drift. **Important**: doctor is read-only; do not propose fixes here — that's for `repair-harness`.
5. Run `bgng card status --explain` to surface card-level provenance (which cards contributed which skills/servers).
6. Run `bgng store status --json` to surface store health (schema version, card count, source count, `legacyLayoutDetected`).
7. If the user mentioned an extension specifically: run `bgng extensions status [<name>] --json` and `bgng extensions doctor --json`.
8. Summarize findings in plain prose. If repair is needed, tell the user to invoke `repair-harness` next; do NOT mutate anything from this skill.

## User-ask points

**None by default.** This skill is strictly read-only.

Escalation only: if the user explicitly asks "and fix it," halt and recommend invoking `repair-harness` — do not perform repair from here.

## Wraps

`bgng status --json` · `bgng status --why` · `bgng status --explain` · `bgng doctor --json` · `bgng card status --explain` · `bgng store status --json` · `bgng extensions status --json` · `bgng extensions doctor --json`

## Scope

**Project** (read-only). Touches no other scope.

## Failure modes

- **Not in a bgng project** (`bgng status --json` returns `project: null`) → say so plainly; suggest `bootstrap-project`.
- **`--why <name>` returns no provenance** → the name is not active in this harness; surface that fact, suggest `bgng search skill "<query>" --json` to discover what is available.
- **`bgng doctor` returns errors** → report them verbatim; do NOT propose repair. Suggest `repair-harness`.
- **Legacy layout detected** → flag it loudly; suggest `repair-harness` (which can run `store migrate`).

## Related skills

`repair-harness` (for any mutation) · `apply-harness-card` (for card changes) · `recommend-harness` (for new additions)
````

### Task 2.5: `skills/repair-harness/SKILL.md`

**Files:**
- Create: `skills/repair-harness/SKILL.md`

**Full content:**

````markdown
---
name: repair-harness
description: "Use when repairing Beginning Harness drift, missing generated files, outdated card locks, or legacy layout, with previews and approvals before mutation."
---

# repair-harness

## Purpose

Guide repair of harness state when `inspect-harness` (or the user) reports drift. Use `bgng doctor --json` and related diagnostics to identify the issue, propose a fix, preview it via `bgng write --dry-run --json`, and only execute on explicit user approval. Migration of pre-cards layout, `--force` overwrites of stale generated files, and card lockfile refreshes all flow through here.

Requires `bgng` on PATH. Scope is primarily **project**, but this skill also
touches the machine-wide store during `bgng store migrate`. Blast radius is
**high** because it can overwrite generated files and mutate the local store.

## Procedure

1. Read drift state: `bgng doctor --json` (and `bgng card status --explain` if cards are involved, and `bgng store status --json` to check for legacy layout).
2. Classify the issue:
   - `legacyLayoutDetected: true` → migrate path (step 3)
   - `brokenSymlinks` / `staleSkillSymlinks` / `mcpDrift` / `missingGeneratedFiles` non-empty → write/force path (step 4)
   - Card lock outdated (`bgng card outdated --json` returns entries) → card refresh path (step 5)
   - Extension health failures → extension repair path (step 6)
3. **Migrate path**:
   1. Run `bgng store status --json` to confirm legacy layout.
   2. Explain to the user that migration archives the old layout under a `legacy/` directory and activates the cards-era store at `~/.agents/bgng/`.
   3. Run `bgng store migrate --json --yes`'s **dry-run-equivalent first**: `bgng store status --json` to preview what's archived. Then explicitly ask the user to confirm (User-ask point 1).
   4. On approval, run `bgng store migrate` (interactive) or `bgng store migrate --yes` if scripted.
4. **Write/force path**:
   1. Run `bgng write --dry-run --json`. Show `changes` to the user.
   2. If the dry-run shows the right fix, ask the user to confirm `bgng write` (User-ask point 2). On approval, run `bgng write`.
   3. If drift requires overwriting BGNG-owned files marked as stale, ask the user to confirm `bgng write --force` (User-ask point 3). Be explicit that `--force` overwrites any drift, including manual edits to generated files.
5. **Card refresh path**:
   1. Run `bgng card outdated --json`. If non-empty, ask the user to confirm `bgng card update` (User-ask point 4).
   2. On approval, run `bgng card update`. Then `bgng write --dry-run --json` and proceed to step 4.2.
6. **Extension repair path**:
   1. Run `bgng extensions doctor --json` and `bgng extensions status <name> --json`.
   2. Diagnose. If the fix is re-running setup, ask the user to confirm `bgng extensions setup <name>` (User-ask point 5). On approval, run it.
   3. After any extension repair, run `bgng write --dry-run --json` and proceed to step 4.2 to materialize downstream.

## User-ask points

1. **Confirm store migrate** — archives legacy layout; non-trivial. Explain the archive path.
2. **Confirm `bgng write`** — show `--dry-run --json` `changes` before writing.
3. **Confirm `bgng write --force`** — explicitly warn that `--force` overwrites BGNG-owned stale files; ask twice if the drift includes anything the user might have hand-edited.
4. **Confirm `bgng card update`** — show what cards have newer versions available before refreshing the lock.
5. **Confirm extension setup re-run** — Beads may invoke `bd init`/`bd setup`; MarkItDown may run `uv` installer; Parallel writes config. Show the planned steps from `--dry-run --json`.

## Wraps

`bgng doctor --json` · `bgng card status --explain` · `bgng store status --json` · `bgng store migrate` · `bgng write --dry-run --json` · `bgng write` · `bgng write --force` · `bgng card outdated --json` · `bgng card update` · `bgng extensions doctor --json` · `bgng extensions status --json` · `bgng extensions setup`

## Scope

**Project** primarily. Touches **machine-wide store** during `bgng store migrate`. Touches **downstream materialization** (`.claude/`, `.codex/`, `.cursor/`) on every `bgng write`.

## Failure modes

- **`bgng doctor --json` clean** → nothing to repair; tell the user.
- **Migration aborted** (user declines) → preserve current state; no partial mutation.
- **`bgng write` fails on unresolved `skills.include`** → surface the unresolved name; do not retry with `--force` (forcing here only masks the real problem).
- **Extension setup failure** → surface stderr; do not chain into `bgng write`.

## Related skills

`inspect-harness` (run first to diagnose) · `apply-harness-card` (for card-specific mutations) · `manage-defaults` (for machine-wide repair)
````

### Task 2.6: `skills/manage-defaults/SKILL.md`

**Files:**
- Create: `skills/manage-defaults/SKILL.md`

**Full content:**

````markdown
---
name: manage-defaults
description: "Use when managing machine-wide Beginning Harness defaults, the local library, or the curated publication layer for all projects on this machine."
---

# manage-defaults

## Purpose

Mutate `~/.agents/bgng/machine.json` machine defaults (default skill set + default MCP servers), install or remove library bundles, and manage the curated publication layer at `~/.agents/skills/`. Because every action here affects **all future projects** on this machine, scope confirmation is mandatory before any mutation.

Requires `bgng` on PATH. Scope is **machine**. Blast radius is **high** because
defaults affect all future projects on this machine.

## Procedure

1. Read current state: `bgng library defaults list --json`, `bgng library list --json`, `bgng skills list --json`.
2. Confirm **machine-wide scope** with the user (User-ask point 1). State plainly: "This changes defaults for every project on this machine." Do not proceed if the user wanted project-scope — redirect them to `bootstrap-project` or `apply-harness-card`.
3. Disambiguate user intent. Likely paths:
   - "Add default skill" → `bgng library defaults add skill <name>`
   - "Remove default skill" → `bgng library defaults remove skill <name>`
   - "Add default MCP" → `bgng library defaults add mcp <name>`
   - "Remove default MCP" → `bgng library defaults remove mcp <name>`
   - "Install skill bundle" → `bgng library add skill <package-spec>`
   - "Install MCP definition" → `bgng library add mcp <json-file-or-spec> --as <server-id>`
   - "Curate skill into publication layer" → `bgng skills curate <name>`
   - "Uncurate skill" → `bgng skills uncurate <name>`
4. Preview the mutation: every `library defaults` command and `library add mcp` supports `--dry-run --json`. Run that first. `library add skill`, `skills curate`, `skills uncurate` do not — describe the action in prose instead.
5. Confirm with the user (User-ask point 2). Show the JSON dry-run output where available.
6. Run the chosen command.
7. (Optional) Run `bgng write --dry-run --json` in any open project to surface downstream impact. If the user is currently in a project, run this and surface `changes`; ask whether to apply (User-ask point 3) and if yes, run `bgng write`.
8. Confirm: re-read `bgng library defaults list --json`.

## User-ask points

1. **Confirm machine-wide scope** — mandatory. Explicitly say "This affects every project on this machine."
2. **Confirm the specific mutation** — show `--dry-run --json` where available; otherwise describe in prose.
3. **Confirm downstream write** — if the user is in a project, ask whether to materialize the change to that project now (via `bgng write`).

## Wraps

`bgng library list --json` · `bgng library defaults list --json` · `bgng library defaults add skill --dry-run --json` · `bgng library defaults add skill` · `bgng library defaults remove skill --dry-run --json` · `bgng library defaults remove skill` · `bgng library defaults add mcp --dry-run --json` · `bgng library defaults add mcp` · `bgng library defaults remove mcp --dry-run --json` · `bgng library defaults remove mcp` · `bgng library add skill --json` · `bgng library add mcp --dry-run --json` · `bgng library add mcp` · `bgng skills curate --json` · `bgng skills uncurate --json` · `bgng skills list --json` · `bgng write --dry-run --json` · `bgng write`

## Scope

**Machine** (machine-wide defaults under `~/.agents/bgng/machine.json` and curated publication layer at `~/.agents/skills/`). Downstream materialization (`.claude/`, `.codex/`, `.cursor/`) for any open project on the next `bgng write`.

## Failure modes

- **Non-shared skill rejected by `library defaults add skill`** → some skills are claude-only / codex-only / experimental; bgng refuses to default them. Surface the rejection and suggest the user curate the skill manually instead.
- **Package not found** (`library add skill <spec>` exit ≠ 0) → surface the npm/local error verbatim.
- **Skill not found on curate/uncurate** → surface the name; offer `bgng skills list --json` to help the user pick.

## Related skills

`bootstrap-project` (uses machine defaults at init) · `inspect-harness` (read-only inspection of machine state) · `recommend-harness` (suggests additions)
````

### Task 2.7: `skills/recommend-harness/SKILL.md`

**Files:**
- Create: `skills/recommend-harness/SKILL.md`

**Full content:**

````markdown
---
name: recommend-harness
description: "Use when suggesting Beginning Harness Cards, extensions, skills, or MCP servers for the current project without mutating state."
---

# recommend-harness

## Purpose

Discover what's available and recommend the best fit for the current project. **Strictly read-only.** Outputs prose recommendations plus copy-paste-ready `bgng` command sequences for the user to execute (or to ask `apply-harness-card`, `bootstrap-project`, or `manage-defaults` to run). Never mutates state — that's a deliberate contract (see Design Decision Q4 in the PRD).

Requires `bgng` on PATH. Scope is **project**, read-only. Blast radius is
**none**.

## Procedure

1. Read current project state: `bgng status --json`. Note enabled extensions, current cards, and skill/MCP counts.
2. Read what's available:
   - `bgng card status --json` (project cards currently applied)
   - `bgng card list --json` (published local cards available to apply)
   - `bgng library list --json` (machine library)
   - `bgng skills list --json` (curated publication layer + repo skills)
   - `bgng extensions list --json` (known extensions)
3. Ask the user for their **intent** if not already clear (User-ask point: optional clarifying question, not a checkpoint — purely conversational).
4. Search for matches:
   - `bgng search skill "<query>" --json` (use `--library` or `--catalog` to scope the search if helpful)
   - `bgng search mcp "<query>" --json`
5. Synthesize the recommendation as prose. For each suggested item, include:
   - What it is and why it's relevant
   - Which skill should be invoked to apply it (e.g., "ask `apply-harness-card` to run `bgng apply @vendor/card-x@^1.0`")
   - The exact `bgng` command sequence the user can copy-paste
6. **Do NOT** emit a draft card manifest. If the user wants to start authoring a card from a recommendation, suggest invoking `author-harness-card` and provide the exact `bgng card new <name>` command — do not synthesize `card.json` yourself.
7. **Do NOT** invoke any mutating `bgng` command from this skill. The user (or a sibling skill) executes the recommendations explicitly.

## User-ask points

**None** — this skill never mutates. Optional clarifying questions about user intent are normal conversational behavior, not formal checkpoints.

If the user asks "and apply it," halt and recommend invoking `apply-harness-card` (or `bootstrap-project`, depending on context). Do not perform the apply from here.

## Wraps

`bgng status --json` · `bgng card status --json` · `bgng card list --json` · `bgng library list --json` · `bgng skills list --json` · `bgng extensions list --json` · `bgng search skill --json` · `bgng search mcp --json`

## Scope

**Project** (read-only inspection of project + machine state to synthesize recommendations). Touches no other scope.

## Failure modes

- **No matches for the query** → tell the user plainly; offer broader search terms or suggest `library add` / `skills packages add` to import new skills from npm.
- **bgng catalog unavailable** (network issue with `--catalog`) → fall back to `--library` and tell the user.

## Related skills

`apply-harness-card` (to execute card recommendations) · `bootstrap-project` (for fresh-repo recommendations) · `author-harness-card` (to start authoring a recommended card from scratch) · `manage-defaults` (for machine-wide recommendations)
````

### Task 2.8: Commit Phase 2

```bash
git add skills/
git commit -m "[feat:skills] add 7 current-lane SKILL.md files wrapping bgng CLI"
```

---

## Phase 3 — Future-Lane Stub

### Task 3.1: `skills/organize-workspace/SKILL.md`

**Files:**
- Create: `skills/organize-workspace/SKILL.md`

**Full content:**

````markdown
---
name: organize-workspace
description: "Use when the user asks for cross-project Beginning Harness organization; this placeholder explains that workspace-level scanning and categorization are not implemented yet."
---

# organize-workspace

> ⚠️ **This skill is not active.** It is a placeholder for the future-lane workspace organizer described in the [Beginning Harness PRD V2](https://www.notion.so/36df1fbef8c28154a802ebe69d8c21c5) (Future Implications section).

## Why this stub exists

The original Beginning Harness PRD envisioned a cross-project organizer that scans the user's `~/Documents/projects/` directory, categorizes repos by domain (e.g., frontend / research / latex-writing), and creates a symlink hierarchy under a workspace root. The cards-era PRD V2 preserved that ambition as a deliberate future track.

This skill is **not implemented in v1.0** because:

1. `bgng scan` is intentionally a no-op (`"implemented": false` in JSON mode) — there is no CLI primitive for classification or recency analysis today.
2. The cross-project organizer is a different job-to-be-done from per-repo harness work and may eventually spin out as a separate product (Design Decision Q1 in the PRD).

Treat this as a non-mutating explanatory stub. If a user invokes it directly,
the skill should explain the limitation and redirect them to
`bootstrap-project`.

## Graduation criteria

This skill becomes active in a future release once **either** of the following holds:

- (a) `bgng scan` ships with real classification + recency primitives in `beginning-harness`, **or**
- (b) The skill itself takes on filesystem-scan logic (recency, categorization, symlink trees) — at which point it likely belongs in a separate product, not this skill set.

## What to do now

If you reached this skill via natural-language intent ("organize my projects"), the right next move is to ask the user to run `bootstrap-project` on each repo individually. The cross-project organizer is not yet available.

## Related skills

`bootstrap-project` (per-project harness setup is the current substitute)
````

### Task 3.2: Commit Phase 3

```bash
git add skills/organize-workspace/
git commit -m "[feat:skills] add organize-workspace future-lane stub"
```

---

## Phase 4 — Documentation

### Task 4.1: Root `README.md`

**Files:**
- Create: `README.md`

**Content (template — fill in `<owner>` after Phase 8):**

````markdown
# Beginning Harness Skills

Agent skills wrapping the [`bgng`](https://github.com/<owner>/beginning-harness) CLI for Claude Code, Codex, Cursor, and other agentic environments. Ships seven current-lane skills (bootstrap, cards, defaults, diagnostics, repair, recommendations) plus one future-lane stub.

Distributed via Claude Code Plugin Marketplace, Codex Plugin / `$skill-installer`, and Vercel `npx skills add`.

## What's in this repo

| Skill | Purpose | Scope | Blast radius |
|---|---|---|---|
| `bootstrap-project` | Initialize a per-repo harness; enable extensions; apply starter cards | project | medium |
| `apply-harness-card` | Apply, pin, update, remove, detach, inspect Harness Cards | project | medium |
| `author-harness-card` | Create, publish, diff, deprecate reusable cards | card source | medium |
| `inspect-harness` | Read-only inspection of state and provenance | project | none |
| `repair-harness` | Guide safe repair of drift, migrate legacy layout | project + machine | high |
| `manage-defaults` | Machine-wide defaults and curated publication layer | machine | high |
| `recommend-harness` | Suggest cards, extensions, skills, MCPs (read-only) | project | none |
| `organize-workspace` | **[FUTURE]** Cross-project organizer — not active yet | workspace | deferred |

Each skill is a thin agent-driven wrapper over `bgng` commands, with user-ask checkpoints before any consequential write.

## Prerequisites

- `bgng` CLI installed and on PATH (see [beginning-harness](https://github.com/<owner>/beginning-harness))
- One of: Claude Code, Codex CLI, Cursor, or any agent runtime supported by [Vercel `npx skills`](https://www.skills.sh)

## Install

### Claude Code (recommended)

```bash
# In Claude Code:
/plugin marketplace add <owner>/beginning-harness-skills
/plugin install beginning@beginning-harness-skills
```

Then invoke any skill with `/beginning:<skill-name>` (e.g., `/beginning:bootstrap-project`).

### Codex CLI — full plugin (recommended for Codex)

```bash
codex plugin marketplace add <owner>/beginning-harness-skills
codex plugin install beginning
```

### Codex CLI — single skill via `$skill-installer`

Inside a Codex session:

```
$skill-installer https://github.com/<owner>/beginning-harness-skills/tree/main/skills/<skill-name>
```

Restart Codex to load. Installs to `~/.codex/skills/<skill-name>/`.

### Vercel `npx skills add` (Cursor, Cline, OpenCode, others)

```bash
npx skills add <owner>/beginning-harness-skills
```

Symlinks each skill into the detected agent's skills directory. Use `--agent <agent>` to target a specific runtime; `-g` for global install.

## Quick start

```
> Bootstrap my harness in this repo

[Claude Code invokes /beginning:bootstrap-project]
[Agent runs `bgng status --json`, asks about scope and extensions, previews `bgng write --dry-run`, asks for approval, writes]
```

## Safety contract

Every mutating skill follows this pattern:

1. Inspect current state via `bgng status`, `bgng doctor`, or equivalent.
2. Declare scope explicitly (project / machine / card source / downstream).
3. Preview the mutation via `bgng <cmd> --dry-run --json` where available, or describe in prose where not.
4. Ask for user approval.
5. Run the real mutation.
6. Verify with a follow-up read-only query.

The `recommend-harness` and `inspect-harness` skills are strictly read-only — they never mutate state.

## Examples

A reference Harness Card is shipped under [`examples/cards/`](./examples/cards/) for documentation purposes. It is not a published card; do not depend on it.

## Compatibility

- `bgng` CLI v0.x (cards-era)
- Claude Code (latest)
- Codex CLI (latest)
- Cursor (latest)
- Other runtimes via `npx skills add` (Cline, OpenCode, etc.)

## Development

This repo is markdown-first; the only build dependency is `markdownlint-cli2` (devDependency) for local + CI lint.

```bash
npm install
npm run lint:md
npm run validate:skills
```

## Contributing

See [MAINTAINERS.md](./MAINTAINERS.md) for the release process and contribution conventions.

## License

MIT — see [LICENSE](./LICENSE).
````

### Task 4.2: `CLAUDE.md` (instructions for AI agents working IN this repo)

**Files:**
- Create: `CLAUDE.md`

**Content:**

````markdown
# Working in beginning-harness-skills

This repo distributes agent skills. The bulk of the content is markdown (`SKILL.md` files); there is almost no executable code.

## What you can change safely

- `skills/<name>/SKILL.md` — the skills themselves
- `README.md`, `MAINTAINERS.md` — top-level docs
- `.markdownlint.yaml`, `.editorconfig`, `.gitignore` — dev tooling
- `.github/workflows/*.yml` — CI

## What requires extra care

- `.claude-plugin/plugin.json` — plugin identity (name `beginning`). Renaming breaks user-facing invocation paths (`/beginning:*`).
- `.claude-plugin/marketplace.json` — marketplace catalog. Removing or renaming a plugin entry breaks installed users.
- `.codex-plugin/plugin.json` — Codex plugin identity. Same constraints as Claude Code's.
- `VERSION` — drives the release tag workflow. Bump on every release; SemVer.

## What NOT to do

- **Do not add MCP servers, hooks, or slash commands at the plugin level.** This repo is intentionally skills-only. The skills wrap `bgng`; they don't ship their own MCP infrastructure.
- **Do not synthesize draft card manifests inside `recommend-harness`.** That violates the contract clarity decision in the PRD (Q4). The skill is strictly read-only.
- **Do not invoke mutating `bgng` commands from `inspect-harness` or `recommend-harness`.** Those two skills are read-only by design.

## Where the bgng CLI surface is documented

The bgng CLI lives in [`beginning-harness`](https://github.com/<owner>/beginning-harness). Authoritative surface map lives in that repo's `.ai/analyses/` directory; if you're updating SKILL.md procedures and the CLI surface seems wrong, cross-check there.

## Where the PRD lives

- Plain-markdown: `beginning-harness/.ai/analyses/39_beginning-harness-prd-v2-cards-era.md`
- Notion v2: https://www.notion.so/36df1fbef8c28154a802ebe69d8c21c5
- Notion v1 (Matt's original): https://www.notion.so/356f1fbef8c281c5b193c09754aeef59

## Common edits

- **Adjusting a SKILL.md procedure**: edit `skills/<name>/SKILL.md`, run `npm run lint:md` and `npm run validate:skills` to verify, then commit.
- **Adding a new skill**: create `skills/<new-name>/SKILL.md` with the standard frontmatter (see existing skills for templates), update `README.md`'s skills table, bump `VERSION` (minor), commit.
- **Releasing**: see `MAINTAINERS.md`.
````

### Task 4.3: `MAINTAINERS.md`

**Files:**
- Create: `MAINTAINERS.md`

**Content:**

````markdown
# Maintainers Guide

## Release process

Releases are SemVer, driven by the single-line `VERSION` file at the repo root.

### Cutting a release

1. Update `VERSION` to the new SemVer value (e.g., `0.2.0`).
2. Update `version` field in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, and `package.json` to match.
3. Open a PR from a `release/v<version>` branch (e.g., `release/v0.2.0`).
4. On merge to `main`, the `create-tag.yml` workflow auto-tags `v<version>`.
5. The `publish-release.yml` workflow then creates a GitHub Release with auto-generated notes.

### Manual checks before release

- [ ] All `SKILL.md` files pass `npm run lint:md`.
- [ ] All `SKILL.md` files pass `npm run validate:skills` (portable frontmatter shape, required fields).
- [ ] At least one skill (e.g., `inspect-harness`) is smoke-tested in Claude Code locally.
- [ ] `README.md` skills table reflects current skill set.
- [ ] All bgng commands referenced in SKILL.md procedures exist in the current `bgng` version (cross-check against `beginning-harness`).

## Reviewing skill changes

When reviewing a PR that adds or modifies a SKILL.md:

1. **Frontmatter**: `name` matches directory name, kebab-case. `description` is a single sentence that describes when to use the skill.
2. **Procedure**: every mutating step is preceded by a `--dry-run --json` preview (where bgng supports it) or an explicit prose description.
3. **User-ask points**: numbered and aligned with the procedure steps that mutate state.
4. **Wraps**: every `bgng` command referenced in the procedure is listed.
5. **Scope**: declared explicitly (project / machine / card source / downstream).
6. **Failure modes**: cover the most likely bgng exit-non-zero paths.

## Adding a new distribution channel

This repo currently supports four channels (Claude Code plugin/marketplace, Codex Plugin, Codex `$skill-installer`, Vercel `npx skills add`). To add a fifth:

1. Determine whether the new channel reads the existing `skills/<name>/SKILL.md` convention or requires an additional manifest.
2. If a new manifest is required, add it under `.<channel>-plugin/` and document the field schema in this file.
3. Update `README.md` install instructions.
4. Bump VERSION minor.

## Coordinating with `beginning-harness`

The skills in this repo wrap the `bgng` CLI in [`beginning-harness`](https://github.com/<owner>/beginning-harness). When the CLI changes:

- **Additive changes** (new flags, new JSON fields) — update SKILL.md procedures opportunistically; no urgent release.
- **Breaking changes** (renamed commands, removed flags, schema changes) — bump VERSION minor and update affected SKILL.md bodies to mention the new supported `bgng` version where relevant.
- **CLI gaps that affect skill safety** (e.g., the current lack of `--dry-run` on card mutation commands) — file an issue in `beginning-harness`. Do not work around the gap silently in this repo.

## Owners

- Primary: Remy Kim
- Backup: TBD
````

### Task 4.4: Commit Phase 4

```bash
git add README.md CLAUDE.md MAINTAINERS.md
git commit -m "[doc:repo] add README, CLAUDE.md, MAINTAINERS guide"
```

---

## Phase 5 — CI / Release Plumbing

### Task 5.1: `.markdownlint.yaml`

**Files:**
- Create: `.markdownlint.yaml`

**Content:**

```yaml
default: true
MD013: false      # line length — allow long lines for readability in SKILL.md
MD024: false      # duplicate headings — allow (some SKILL.md have repeated section names across skills)
MD033: false      # inline HTML — allow for callout boxes and badges
MD041: false      # first line H1 — frontmatter precedes it in SKILL.md
MD026: false      # trailing punctuation in headings — allow
```

### Task 5.2: `scripts/validate-skills.mjs`

**Files:**
- Create: `scripts/validate-skills.mjs`

**Content:**

```javascript
#!/usr/bin/env node
// ABOUTME: Validates SKILL.md frontmatter against the portable agentskills.io minimum contract
// ABOUTME: Runs locally via `npm run validate:skills` and in CI

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REQUIRED_FIELDS = ["name", "description"];
const ALLOWED_FIELDS = new Set(["name", "description"]);

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const body = match[1];
  const result = {};
  let currentKey = null;
  for (const line of body.split("\n")) {
    if (/^[a-zA-Z][\w-]*:/.test(line)) {
      const [k, ...rest] = line.split(":");
      currentKey = k.trim();
      const v = rest.join(":").trim();
      if (v) result[currentKey] = v;
      else result[currentKey] = {};
    } else if (/^\s+[a-zA-Z]/.test(line) && currentKey && typeof result[currentKey] === "object") {
      const [k, ...rest] = line.trim().split(":");
      result[currentKey][k.trim()] = rest.join(":").trim();
    }
  }
  return result;
}

function validateSkill(dir, skillName) {
  const path = join(dir, "SKILL.md");
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (e) {
    return [`${skillName}: missing SKILL.md`];
  }
  const fm = parseFrontmatter(content);
  if (!fm) return [`${skillName}: no frontmatter`];
  const errors = [];
  for (const req of REQUIRED_FIELDS) {
    if (!fm[req]) errors.push(`${skillName}: missing required field "${req}"`);
  }
  if (fm.name && fm.name !== skillName) {
    errors.push(`${skillName}: frontmatter name "${fm.name}" does not match directory "${skillName}"`);
  }
  if (fm.name && !/^[a-z][a-z0-9-]*$/.test(fm.name)) {
    errors.push(`${skillName}: name "${fm.name}" is not lowercase-kebab`);
  }
  for (const key of Object.keys(fm)) {
    if (!ALLOWED_FIELDS.has(key)) {
      errors.push(`${skillName}: unknown frontmatter field "${key}"`);
    }
  }
  return errors;
}

function main() {
  const skillsDir = "skills";
  let errors = [];
  try {
    const entries = readdirSync(skillsDir);
    for (const entry of entries) {
      const full = join(skillsDir, entry);
      if (statSync(full).isDirectory()) {
        errors = errors.concat(validateSkill(full, entry));
      }
    }
  } catch (e) {
    console.error(`Error reading skills/: ${e.message}`);
    process.exit(1);
  }
  if (errors.length > 0) {
    for (const err of errors) console.error(`✘ ${err}`);
    process.exit(1);
  }
  console.log(`✓ All skills valid (${readdirSync(skillsDir).length} found)`);
}

main();
```

Notes:
- The frontmatter parser is intentionally simple (regex-based). Sufficient for a
  two-field schema; if channel-specific metadata is ever reintroduced, swap in
  `js-yaml`.

### Task 5.3: `.github/workflows/ci.yml`

**Files:**
- Create: `.github/workflows/ci.yml`

**Content:**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Lint markdown
        run: npm run lint:md

      - name: Validate skills
        run: npm run validate:skills
```

### Task 5.4: `.github/workflows/create-tag.yml`

**Files:**
- Create: `.github/workflows/create-tag.yml`

**Content:**

```yaml
name: Create release tag

on:
  push:
    branches: [main]

jobs:
  tag:
    if: contains(github.event.head_commit.message, '[release]')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Read VERSION
        id: version
        run: echo "version=$(cat VERSION)" >> "$GITHUB_OUTPUT"

      - name: Create and push tag
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git tag "v${{ steps.version.outputs.version }}"
          git push origin "v${{ steps.version.outputs.version }}"
```

Notes:
- Tagging triggers on any commit to `main` containing `[release]` in the commit message. Adjust to your preferred branch-based pattern if you'd rather use `release/v*` branches like parallel does.

### Task 5.5: `.github/workflows/publish-release.yml`

**Files:**
- Create: `.github/workflows/publish-release.yml`

**Content:**

```yaml
name: Publish release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          token: ${{ secrets.GITHUB_TOKEN }}
```

### Task 5.6: Commit Phase 5

```bash
git add .markdownlint.yaml scripts/ .github/
git commit -m "[ci:repo] add markdownlint, skill validation, release workflows"
```

---

## Phase 6 — Example Cards

### Task 6.1: `examples/cards/README.md`

**Files:**
- Create: `examples/cards/README.md`

**Content:**

````markdown
# Example Harness Cards

This directory contains minimal reference Harness Cards for documentation purposes. **These are not published cards** — do not depend on them in production projects.

To author your own card, invoke the `author-harness-card` skill or run `bgng card new <name>` directly.

## minimal-card

A bare-bones card with a single skill and no MCP servers. Useful as a starting template.

To play with it locally:

```bash
# Copy into your machine's authoring source dir
cp -r examples/cards/minimal-card ~/.agents/bgng/sources/@me/minimal-card

# Publish
bgng card publish @me/minimal-card

# Apply in a test project
cd ~/sandbox-project
bgng apply @me/minimal-card@0.1.0
bgng write --dry-run --json   # preview
bgng write                     # apply
```
````

### Task 6.2: `examples/cards/minimal-card/card.json`

**Files:**
- Create: `examples/cards/minimal-card/card.json`

**Content:**

```json
{
  "name": "@me/minimal-card",
  "version": "0.1.0",
  "description": "Minimal example Beginning Harness Card. One skill, no MCP servers.",
  "skills": {
    "include": ["hello-world"]
  },
  "mcpServers": {}
}
```

### Task 6.3: `examples/cards/minimal-card/skills/hello-world/SKILL.md`

**Files:**
- Create: `examples/cards/minimal-card/skills/hello-world/SKILL.md`

**Content:**

````markdown
---
name: hello-world
description: "Minimal example skill bundled with the minimal-card example."
---

# hello-world

This is an example skill bundled inside the `@me/minimal-card` example card.

When applied via `bgng apply @me/minimal-card`, this skill materializes under
the project's downstream skill directories as plain `hello-world` content
resolved from the card store.

## What it does

Says hello. That's it.

## Procedure

1. Greet the user.
````

### Task 6.4: Commit Phase 6

```bash
git add examples/
git commit -m "[doc:examples] add minimal example Harness Card"
```

---

## Phase 7 — Local Validation

### Task 7.1: Install dependencies and run lint

```bash
cd /Users/pureicis/dev/beginning-harness-skills
npm install
npm run lint:md
npm run validate:skills
```

Expected:
- `npm install` exits 0.
- `npm run lint:md` exits 0 (no markdownlint errors).
- `npm run validate:skills` outputs `✓ All skills valid (8 found)` and exits 0.

If lint errors appear, fix them inline (most likely: trailing whitespace, blank lines around code fences). If validation fails, fix the offending SKILL.md frontmatter.

### Task 7.2: Smoke-test in Claude Code (local install)

**Step 1:** Open a fresh Claude Code session.

**Step 2:** Add the local repo as a marketplace.

```
/plugin marketplace add /Users/pureicis/dev/beginning-harness-skills
```

Expected: marketplace adds successfully and is listed in `/plugin marketplace`.

**Step 3:** Install the plugin.

```
/plugin install beginning@beginning-harness-skills
```

Expected: plugin installs; skills appear under `/beginning:*`.

**Step 4:** Invoke `inspect-harness` (lowest blast radius for first test).

```
/beginning:inspect-harness
```

Expected: the skill loads, reads its instructions, runs `bgng status --json`, and reports the current harness state without mutating anything. If `bgng` is not installed or the cwd is not a bgng project, the skill should surface that fact gracefully.

**Step 5:** Invoke `recommend-harness` for a sanity check (also read-only).

```
/beginning:recommend-harness Help me set up a Python data analysis project
```

Expected: the skill runs read-only searches (`bgng search skill`, `bgng card list`, etc.) and outputs recommendations as prose + copy-paste commands. Does NOT execute any mutation.

**Step 6 (optional):** In a throwaway sandbox project, invoke `bootstrap-project`. Verify it asks for scope, asks about extensions, runs `bgng write --dry-run --json` before mutating, and asks for approval before `bgng write`. Decline the final write to confirm the abort path works cleanly.

### Task 7.3: Smoke-test in Codex CLI (local install)

**Step 1:** Install via local path.

```bash
codex plugin marketplace add /Users/pureicis/dev/beginning-harness-skills
codex plugin install beginning
```

Expected: plugin installs.

**Step 2:** Open a Codex session. Invoke `inspect-harness` (the exact invocation syntax depends on Codex's slash-command namespace — verify by listing installed skills first).

### Task 7.4: Test `npx skills add` against a local checkout

**Step 1:** From a different directory (e.g., `~/sandbox-project`), run:

```bash
cd ~/sandbox-project
npx skills add /Users/pureicis/dev/beginning-harness-skills --copy
```

Expected: skills install into the detected agents' skills directories (e.g., `~/sandbox-project/.claude/skills/<name>/`). Confirm via:

```bash
ls .claude/skills/
```

Should list all 8 skill directories.

### Task 7.5: Document any issues found during smoke-tests

If any smoke-test surfaces a real problem (skill fails to load, frontmatter rejected, install path broken), fix it inline and re-commit before opening the PR. Document each issue + fix in the PR description.

---

## Phase 8 — Remote Repo + PR

### Task 8.1: Create the GitHub repo (private)

**Step 1:** Determine the owner. If you have `gh` CLI configured:

```bash
gh repo create <owner>/beginning-harness-skills --private --description "Beginning Harness agent skills for Claude Code, Codex, Cursor." --license MIT
```

Or use the GitHub UI to create a private repo named `beginning-harness-skills` under the same owner as `beginning-harness`.

**Step 2:** Verify the remote URL.

```bash
gh repo view <owner>/beginning-harness-skills --json url -q .url
```

Or check via GitHub UI.

### Task 8.2: Replace `<owner>` placeholders

**Step 1:** Now that the owner is known, replace `<owner>` literals throughout the repo:

```bash
cd /Users/pureicis/dev/beginning-harness-skills
grep -rl "<owner>" . --include="*.md" --include="*.json" | xargs sed -i '' "s|<owner>|<actual-owner>|g"
```

(macOS `sed` syntax; Linux drop the empty `''`.)

**Step 2:** Verify no `<owner>` remains:

```bash
grep -r "<owner>" . --include="*.md" --include="*.json"
```

Expected: no matches.

**Step 3:** Commit the placeholder substitution.

```bash
git add -u
git commit -m "[chore:repo] substitute owner placeholders post-repo-creation"
```

### Task 8.3: Push to remote

```bash
git remote add origin git@github.com:<owner>/beginning-harness-skills.git
git push -u origin main
```

Expected: branch pushed; default branch set to `main`.

### Task 8.4: Open the PR for team review

Because we're doing one big PR with the full v1.0, the strategy is:

**Option A** (recommended): create `main` as a protected branch, push the work to a feature branch (`feat/v1.0-initial-release`), and open a PR from feature → main.

```bash
git branch -m main feat/v1.0-initial-release
git push -u origin feat/v1.0-initial-release
# Create a fresh empty `main` on the GitHub side via the UI, then open PR
```

**Option B** (simpler for solo work, less reviewer-friendly): keep all commits on `main` and ask reviewers to comment on the repo at the initial-import commit.

Pick Option A. Then:

```bash
gh pr create --title "Initial release: v0.1.0 — 7 current-lane skills + future-lane stub" --body "$(cat <<'EOF'
## Summary

- Bootstrap: full repo scaffolding (LICENSE, README, CLAUDE.md, MAINTAINERS.md, VERSION, package.json)
- Manifests: Claude Code plugin + marketplace, Codex plugin
- Skills: 7 current-lane SKILL.md files (bootstrap-project, apply-harness-card, author-harness-card, inspect-harness, repair-harness, manage-defaults, recommend-harness) + 1 future-lane stub (organize-workspace)
- Documentation: README install paths for all four channels, MAINTAINERS release process
- CI: markdownlint, skill frontmatter validation, release tag automation, GitHub Release publish
- Examples: one minimal reference Harness Card under examples/cards/

## Distribution channels at launch

- Claude Code Plugin Marketplace (`.claude-plugin/marketplace.json`)
- Codex Plugin (`.codex-plugin/plugin.json`)
- Codex `$skill-installer` (via standard `skills/<name>/SKILL.md` paths)
- Vercel `npx skills add` (via `skills/<name>/SKILL.md` convention)

## Reference

- PRD V2 (Notion): https://www.notion.so/36df1fbef8c28154a802ebe69d8c21c5
- PRD V2 (plain markdown): `beginning-harness/.ai/analyses/39_beginning-harness-prd-v2-cards-era.md`
- Implementation plan: `beginning-harness/.ai/tasks/25_beginning-harness-skills-repo-rollout-implementation-plan.md`
- Reference repo pattern: https://github.com/parallel-web/parallel-agent-skills

## Test plan

- [x] `npm run lint:md` passes
- [x] `npm run validate:skills` passes
- [x] CI green
- [x] Manual smoke-test: `/beginning:inspect-harness` in Claude Code loads and runs `bgng status --json` without mutation
- [x] Manual smoke-test: `/beginning:recommend-harness` outputs prose + commands without mutation
- [x] Manual smoke-test: `/beginning:bootstrap-project` (decline final write) shows the full preview chain
- [ ] Reviewer: confirm SKILL.md procedures match the PRD's user-ask contract
- [ ] Reviewer: confirm Codex install path works
- [ ] Reviewer: confirm `npx skills add` path works

## Out of scope (post-merge follow-ups)

- Tag v1.0.0 + flip repo to public
- Submit PR to `anthropics/claude-plugins-community`
- Rename v2 PRD artifacts from `beginning-agent-skills` → `beginning-harness-skills`
- File bgng issue: add `--dry-run`/`--json` to card mutation commands
EOF
)"
```

### Task 8.5: Verify CI passes on the PR

After pushing, watch the CI run. Expected: both `lint:md` and `validate:skills` jobs pass.

If CI fails, fix and re-push to the feature branch.

---

## Phase 9 — Post-Merge Follow-ups

These are **not part of the v1.0 PR**; track each as its own task.

### Task 9.1: Tag v1.0.0 and publish release

After the team merges the PR to `main`:

```bash
git checkout main
git pull
echo "1.0.0" > VERSION
git add VERSION
git commit -m "[release] v1.0.0"
git push
```

The `create-tag.yml` workflow tags `v1.0.0`; `publish-release.yml` creates the GitHub Release.

### Task 9.2: Flip repo to public

Via GitHub UI: Settings → General → Danger Zone → Change visibility → Make public.

Verify the README renders correctly on the public page.

### Task 9.3: Submit PR to `anthropics/claude-plugins-community`

Fork [`anthropics/claude-plugins-community`](https://github.com/anthropics/claude-plugins-community), add an entry referencing `<owner>/beginning-harness-skills` in their marketplace catalog, and open a PR.

### Task 9.4: Rename in PRD artifacts

The v2 PRD says `beginning-agent-skills`. We're now `beginning-harness-skills`. Patch:

- `beginning-harness/.ai/analyses/39_beginning-harness-prd-v2-cards-era.md` — search/replace `beginning-agent-skills` → `beginning-harness-skills`.
- Notion v2 page (https://www.notion.so/36df1fbef8c28154a802ebe69d8c21c5) — via `notion-update-page` with `update_content` operations.
- `beginning-harness/.ai/tasks/24_plan1_matt-prd-cards-era-realignment.md` — same substitution.

### Task 9.5: File bgng CLI gap issue

In `beginning-harness`: file an issue titled "Add `--dry-run` and `--json` to card mutation commands."

Body:
- Affected commands: `bgng apply`, `bgng card add`, `bgng card pin`, `bgng card remove`, `bgng card detach`, `bgng card update`, `bgng card new`, `bgng card publish`, `bgng card deprecate`.
- Motivation: `beginning-harness-skills` skills need to preview card mutations to align with the PRD's safety contract. Today they fall back to prose descriptions because the CLI commands mutate immediately.
- Suggested JSON shape: `{ changes: string[], warnings: string[], next: string[] }` matching `bgng write` and `extensions add`.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Plugin name `beginning` collides with another community plugin once we publish | Rename internally before public marketplace submission (Task 9.3 gates this). |
| Card mutation skills feel unsafe due to missing `--dry-run` on `bgng card *` | SKILL.md procedures describe the mutation in prose before invoking; user-ask checkpoints explicitly note the immediate-mutation behavior. |
| `npx skills add` install paths break for less-common agent runtimes (Cline, OpenCode) | Test only Claude Code + Codex at v1.0; flag other runtimes as "untested" in README; respond to issues post-release. |
| Codex `$skill-installer` requires unexpected manifest fields we haven't shipped | Investigation showed it consumes the bare `skills/<name>/SKILL.md` path; if a future Codex release adds requirements, ship a hotfix v0.1.1. |
| Smoke-test reveals a SKILL.md procedure doesn't actually work as written (e.g., bgng JSON field renamed) | Fix inline before opening the PR; do not merge with broken procedures. |
| Future-lane `organize-workspace` confuses users who try to invoke it | Explicit warning callout in the SKILL.md body and redirect to `bootstrap-project`. |

---

## Acceptance Criteria

- [ ] Local repo created at `/Users/pureicis/dev/beginning-harness-skills/`
- [ ] All 16 expected files present at correct paths (verify with `find . -type f -not -path './node_modules/*' -not -path './.git/*' | sort`)
- [ ] `npm run lint:md` exits 0
- [ ] `npm run validate:skills` exits 0 with `✓ All skills valid (8 found)`
- [ ] Smoke-test: `/beginning:inspect-harness` loads and runs in Claude Code
- [ ] Smoke-test: `/beginning:recommend-harness` outputs recommendations without mutation
- [ ] Smoke-test: `/beginning:bootstrap-project` exhibits the full preview-then-approve chain (decline final write to confirm abort path)
- [ ] GitHub repo created (private) under the correct owner
- [ ] All `<owner>` placeholders substituted
- [ ] Feature branch pushed; PR opened with the body template from Task 8.4
- [ ] CI green on the PR
- [ ] Phase 9 follow-up tasks filed/tracked separately

---

## Appendix — File Manifest

Final repo structure after Phase 6:

```
beginning-harness-skills/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── .codex-plugin/
│   └── plugin.json
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── create-tag.yml
│       └── publish-release.yml
├── .editorconfig
├── .gitignore
├── .markdownlint.yaml
├── CLAUDE.md
├── LICENSE
├── MAINTAINERS.md
├── README.md
├── VERSION
├── examples/
│   └── cards/
│       ├── README.md
│       └── minimal-card/
│           ├── card.json
│           └── skills/
│               └── hello-world/
│                   └── SKILL.md
├── package.json
├── scripts/
│   └── validate-skills.mjs
└── skills/
    ├── bootstrap-project/SKILL.md
    ├── apply-harness-card/SKILL.md
    ├── author-harness-card/SKILL.md
    ├── inspect-harness/SKILL.md
    ├── repair-harness/SKILL.md
    ├── manage-defaults/SKILL.md
    ├── recommend-harness/SKILL.md
    └── organize-workspace/SKILL.md
```

Total: 22 files (excluding `node_modules/`, `package-lock.json`, `.git/`).
