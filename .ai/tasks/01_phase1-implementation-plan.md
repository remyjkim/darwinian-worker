# Phase 1 Implementation Plan: Canonical Registry + Sync

> Concrete implementation strategy for the `.agents/` shared configuration hub.
> Reference: `~/dev/.agents/ARCHITECTURE.md`

## Pre-Implementation Investigation Findings

### Current MCP State

| Tool | Servers Configured | Config Format |
|------|-------------------|---------------|
| Claude Code | **None** (MCP comes from plugins, not settings.json) | JSON — will be an insert, not merge |
| Codex | context7 only | TOML `[mcp_servers.*]` sections |
| Cursor | 6 servers (context7, chrome-devtools, markdownify, shadcn, @21st-dev/magic, agentcash) | JSON standalone |

**Key finding:** Claude Code's `~/.claude/settings.json` has no `mcpServers` key. The sync script inserts a new key rather than replacing an existing one.

**Cursor cleanup:** Current Cursor config contains servers NOT in the canonical registry (shadcn, @21st-dev/magic, agentcash). These will be dropped — canonical registry is the sole source.

### Current Skills State

| Location | Contents | Status |
|----------|----------|--------|
| `~/.claude/skills/` | 7 entries (2 symlinks, 5 dirs) | Needs rewiring |
| `~/.agents/skills/` | 2 entries (agentcash dir, superpowers symlink→codex) | Needs rewiring |
| `~/.codex/skills/` | Only `.system/` | Empty, needs population |
| `~/.codex/superpowers/skills/` | 14 superpowers skills | Source for superpowers copy |
| `~/dev/skills/skills/` | 16 community skills (Anthropic repo) | External, reference only |
| `~/dev/agents-config-saam/` | Empty directory, no git | Starting from scratch |

### Skills Classification

Current skills need scope assignment:

| Skill | Current Location | Recommended Scope | Rationale |
|-------|-----------------|-------------------|-----------|
| agentcash | ~/.agents/skills/ (dir) | `shared` | Tool-agnostic API access |
| frontend-design | symlink → ~/dev/skills/ | `shared` | Generic design skill |
| incremental-commits | ~/.claude/skills/ (dir) | `shared` | Git workflow, tool-agnostic |
| auditing-knowledge-docs | ~/.claude/skills/ (dir) | `shared` | Documentation audit, tool-agnostic |
| restructuring-knowledge-docs | ~/.claude/skills/ (dir) | `shared` | Documentation reorg, tool-agnostic |
| blog-post-polish | ~/.claude/skills/ (dir) | `shared` | Content workflow, tool-agnostic |
| polish-voice-research | ~/.claude/skills/ (dir) | `shared` | Writing style, tool-agnostic |
| **superpowers (14 skills)** | ~/.codex/superpowers/skills/ | `shared` | Cross-tool workflow skills |

**Superpowers skills (14):**
brainstorming, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills

**Note on superpowers and plugin systems:** Claude Code also loads superpowers via its plugin system (`~/.claude/plugins/cache/superpowers-marketplace/`). The plugin-managed copy and our source repo copy will coexist — Claude Code will see both, but since they're identical content the duplication is harmless. The source repo copy is the canonical version for Codex, Cursor, and any future tools. Over time, the plugin dependency could be removed in favor of the source repo copy.

### Tool Versions

| Tool | Version | Notes |
|------|---------|-------|
| Bun | 1.2.15 | Primary runtime |
| Node.js | 22.22.1 | Available for markdownify MCP |
| jq | 1.7.1 | Available but not needed (Bun handles JSON) |
| TOML lib | Not installed | Need `smol-toml` as project dependency |

---

## Implementation Tasks

### Task 1: Initialize Source Repo

**Goal:** Set up `~/dev/agents-config-saam/` as a git repo with the canonical config files.

**Steps:**

1.1. `cd ~/dev/agents-config-saam && git init`

1.2. Create directory structure:
```
skills/
  shared/
  claude-only/
  codex-only/
  experimental/
.ai/
  tasks/     (this file already here)
```

1.3. Create `mcp-servers.json` with the six canonical servers:
- context7 (always, stdio)
- chrome-devtools (always, stdio)
- markdownify (always, stdio)
- parallel-web-search (always, platform-provided)
- notion (optional, platform-provided)
- slack (optional, http)

1.4. Create `config.json` with targets and toggles:
- Targets: claude (json-merge), codex (toml-merge), cursor (json-standalone + symlink)
- Optional: notion=false, slack=false

1.5. Create `.gitignore` (ignore generated/, *.bak, node_modules/)

1.6. Create minimal `README.md` pointing to ARCHITECTURE.md

1.7. Initial commit

**Acceptance:** Repo exists with valid JSON configs, passes `jq . mcp-servers.json` and `jq . config.json`.

---

### Task 2: Migrate Skills to Source Repo

**Goal:** Move all user skills AND superpowers into the source repo under appropriate scope categories.

**Steps:**

2.1. Copy skills from `~/.claude/skills/` into `skills/shared/`:
- `auditing-knowledge-docs/`
- `blog-post-polish/`
- `incremental-commits/`
- `polish-voice-research/`
- `restructuring-knowledge-docs/`

2.2. Copy agentcash from `~/.agents/skills/agentcash/` into `skills/shared/agentcash/`

2.3. For `frontend-design`: this is a symlink to `~/dev/skills/skills/frontend-design` (Anthropic's repo). Create a symlink in the source repo.
- **Decision:** Symlink. We don't own this skill, it's from Anthropic's skills repo.
- `skills/shared/frontend-design → ~/dev/skills/skills/frontend-design`

2.4. Copy all 14 superpowers skills from `~/.codex/superpowers/skills/` into `skills/shared/`:
```bash
cp -R ~/.codex/superpowers/skills/brainstorming skills/shared/
cp -R ~/.codex/superpowers/skills/dispatching-parallel-agents skills/shared/
cp -R ~/.codex/superpowers/skills/executing-plans skills/shared/
cp -R ~/.codex/superpowers/skills/finishing-a-development-branch skills/shared/
cp -R ~/.codex/superpowers/skills/receiving-code-review skills/shared/
cp -R ~/.codex/superpowers/skills/requesting-code-review skills/shared/
cp -R ~/.codex/superpowers/skills/subagent-driven-development skills/shared/
cp -R ~/.codex/superpowers/skills/systematic-debugging skills/shared/
cp -R ~/.codex/superpowers/skills/test-driven-development skills/shared/
cp -R ~/.codex/superpowers/skills/using-git-worktrees skills/shared/
cp -R ~/.codex/superpowers/skills/using-superpowers skills/shared/
cp -R ~/.codex/superpowers/skills/verification-before-completion skills/shared/
cp -R ~/.codex/superpowers/skills/writing-plans skills/shared/
cp -R ~/.codex/superpowers/skills/writing-skills skills/shared/
```

2.5. Verify each copied SKILL.md is valid (has frontmatter with name, description).

2.6. Commit: "Add skills to source repo under shared/ scope"

**Acceptance:** All 22 skills (7 user + 1 agentcash + 14 superpowers) accounted for in `skills/shared/`. Each has a valid SKILL.md. frontend-design is a symlink.

**Risks:**
- `frontend-design` symlink assumes `~/dev/skills/` stays in place
- Superpowers copies will diverge from the plugin-managed version over time — we accept this and treat the source repo as canonical. Update manually when superpowers releases new versions.

---

### Task 3: Write the Sync Script

**Goal:** Create `sync-mcp.ts` that generates tool-specific MCP configs and manages skill symlinks from the canonical registry.

**Steps:**

3.1. Initialize Bun project in source repo root:
```bash
cd ~/dev/agents-config-saam
bun init -y
bun add smol-toml
```

3.2. Create `sync-mcp.ts` with these modules:

**3.2.1. Registry reader**
- Read `mcp-servers.json`
- Read `config.json`
- Build active server list (exclude optional-disabled, exclude platform-provided)
- Return `Record<string, McpServerEntry>` of syncable servers

**3.2.2. Cursor sync (json-standalone)**
- Generate `{ "mcpServers": { ...activeServers } }` as JSON
- Write to `~/.agents/generated/cursor-mcp.json`
- Check if `~/.cursor/mcp.json` is symlink to generated file
- If not: backup existing, create symlink
- Report changes

**3.2.3. Claude Code sync (json-merge)**
- Read `~/.claude/settings.json`
- Parse JSON, set/replace `mcpServers` key with active servers
- Write back with same formatting (2-space indent)
- Report changes

**3.2.4. Codex sync (toml-merge)**
- Read `~/.codex/config.toml`
- Parse with smol-toml
- Replace all `mcp_servers.*` entries with active servers (translate keys: `command`, `args`, `startup_timeout_sec`)
- Write back
- Report changes

**3.2.5. Skills sync**
- Scan `skills/shared/` in source repo
- For each skill in `~/.agents/skills/` (the curated set):
  - Ensure symlink exists in `~/.claude/skills/` → `~/.agents/skills/<name>`
  - Ensure symlink exists in `~/.codex/skills/` → `~/.agents/skills/<name>`
- For `skills/claude-only/`:
  - Ensure symlink in `~/.claude/skills/` → source repo directly
- For `skills/codex-only/`:
  - Ensure symlink in `~/.codex/skills/` → source repo directly
- Report added/stale symlinks (don't auto-remove stale — report only)

**3.2.6. CLI interface**
```
bun run sync-mcp.ts                  # sync everything (mcp + skills)
bun run sync-mcp.ts --mcp-only       # sync MCP only
bun run sync-mcp.ts --skills-only    # sync skills only
bun run sync-mcp.ts --dry-run        # preview changes
bun run sync-mcp.ts --target=claude  # sync one target only
```

3.3. Safety: backup files before modification (`.bak` suffix)

3.4. Write tests:
- Test registry reader filters correctly (optional disabled, platform-provided excluded)
- Test Cursor JSON generation matches expected format
- Test Claude JSON merge preserves non-MCP keys
- Test Codex TOML merge preserves non-MCP sections
- Test dry-run produces no file changes
- Test skills sync creates correct symlink chains

3.5. Commit: "Add sync script with MCP and skills sync"

**Acceptance:**
- `bun run sync-mcp.ts --dry-run` shows expected changes without writing
- `bun run sync-mcp.ts` successfully syncs to all three tools
- Each tool's config is valid after sync
- Backups created before modifications
- Skills symlinks created in both `~/.claude/skills/` and `~/.codex/skills/`

**Key design decisions:**
- smol-toml for TOML parsing (lightweight, ESM-native, Bun-compatible)
- Backup before write, always
- Dry-run mode is first-class
- Skills sync reports stale symlinks but doesn't auto-remove

---

### Task 4: Wire the Aggregation Layer

**Goal:** Set up `~/.agents/` as the aggregation layer with symlinks to the source repo.

**Steps:**

4.1. Create `~/.agents/generated/` directory

4.2. Symlink config files:
```bash
ln -sf ~/dev/agents-config-saam/mcp-servers.json ~/.agents/mcp-servers.json
ln -sf ~/dev/agents-config-saam/config.json ~/.agents/config.json
```

4.3. Symlink the sync script:
```bash
ln -sf ~/dev/agents-config-saam/sync-mcp.ts ~/.agents/sync-mcp.ts
```

4.4. Rewire `~/.agents/skills/` with per-skill symlinks to source repo:
```bash
# Remove old entries
rm -rf ~/.agents/skills/agentcash     # was a directory (not symlink)
rm ~/.agents/skills/superpowers       # was symlink to codex

# Create per-skill symlinks for all 22 skills
# User skills:
ln -s ~/dev/agents-config-saam/skills/shared/agentcash ~/.agents/skills/agentcash
ln -s ~/dev/agents-config-saam/skills/shared/auditing-knowledge-docs ~/.agents/skills/auditing-knowledge-docs
ln -s ~/dev/agents-config-saam/skills/shared/blog-post-polish ~/.agents/skills/blog-post-polish
ln -s ~/dev/agents-config-saam/skills/shared/frontend-design ~/.agents/skills/frontend-design
ln -s ~/dev/agents-config-saam/skills/shared/incremental-commits ~/.agents/skills/incremental-commits
ln -s ~/dev/agents-config-saam/skills/shared/polish-voice-research ~/.agents/skills/polish-voice-research
ln -s ~/dev/agents-config-saam/skills/shared/restructuring-knowledge-docs ~/.agents/skills/restructuring-knowledge-docs

# Superpowers skills:
ln -s ~/dev/agents-config-saam/skills/shared/brainstorming ~/.agents/skills/brainstorming
ln -s ~/dev/agents-config-saam/skills/shared/dispatching-parallel-agents ~/.agents/skills/dispatching-parallel-agents
ln -s ~/dev/agents-config-saam/skills/shared/executing-plans ~/.agents/skills/executing-plans
ln -s ~/dev/agents-config-saam/skills/shared/finishing-a-development-branch ~/.agents/skills/finishing-a-development-branch
ln -s ~/dev/agents-config-saam/skills/shared/receiving-code-review ~/.agents/skills/receiving-code-review
ln -s ~/dev/agents-config-saam/skills/shared/requesting-code-review ~/.agents/skills/requesting-code-review
ln -s ~/dev/agents-config-saam/skills/shared/subagent-driven-development ~/.agents/skills/subagent-driven-development
ln -s ~/dev/agents-config-saam/skills/shared/systematic-debugging ~/.agents/skills/systematic-debugging
ln -s ~/dev/agents-config-saam/skills/shared/test-driven-development ~/.agents/skills/test-driven-development
ln -s ~/dev/agents-config-saam/skills/shared/using-git-worktrees ~/.agents/skills/using-git-worktrees
ln -s ~/dev/agents-config-saam/skills/shared/using-superpowers ~/.agents/skills/using-superpowers
ln -s ~/dev/agents-config-saam/skills/shared/verification-before-completion ~/.agents/skills/verification-before-completion
ln -s ~/dev/agents-config-saam/skills/shared/writing-plans ~/.agents/skills/writing-plans
ln -s ~/dev/agents-config-saam/skills/shared/writing-skills ~/.agents/skills/writing-skills
```

4.5. Commit source repo: "Wire aggregation layer"

**Acceptance:**
- `ls -la ~/.agents/mcp-servers.json` shows symlink to source repo
- `ls -la ~/.agents/skills/*` shows 22 per-skill symlinks to source repo
- `cat ~/.agents/mcp-servers.json` returns valid JSON
- `readlink ~/.agents/sync-mcp.ts` points to source repo
- Each skill symlink resolves to a directory containing a valid SKILL.md

---

### Task 5: Run Initial Sync

**Goal:** Execute the sync script to align all three tools with the canonical registry.

**Steps:**

5.1. Run dry-run first:
```bash
cd ~/dev/agents-config-saam && bun run sync-mcp.ts --dry-run
```

5.2. Review output — verify:
- Claude: mcpServers key will be inserted with context7, chrome-devtools, markdownify
- Codex: mcp_servers section will be updated (context7 stays, chrome-devtools + markdownify added)
- Cursor: new config replaces 6 servers with 3 canonical ones (shadcn, @21st-dev/magic, agentcash dropped)
- Skills: symlinks will be created in ~/.claude/skills/ and ~/.codex/skills/ for all 22 curated skills

5.3. **Backup current configs manually** before first real sync:
```bash
cp ~/.claude/settings.json ~/.claude/settings.json.pre-agents-sync
cp ~/.codex/config.toml ~/.codex/config.toml.pre-agents-sync
cp ~/.cursor/mcp.json ~/.cursor/mcp.json.pre-agents-sync
```

5.4. Run actual sync:
```bash
bun run sync-mcp.ts
```

5.5. Verify each tool:
- `cat ~/.claude/settings.json | jq .mcpServers` — shows 3 servers
- `grep -A3 '\[mcp_servers' ~/.codex/config.toml` — shows 3 servers
- `readlink ~/.cursor/mcp.json` — points to `~/.agents/generated/cursor-mcp.json`
- `cat ~/.cursor/mcp.json | jq .mcpServers` — shows 3 servers
- `ls -la ~/.claude/skills/` — shows 22+ symlinks to ~/.agents/skills/ (plus any claude-only)
- `ls -la ~/.codex/skills/` — shows 22+ symlinks to ~/.agents/skills/ (plus any codex-only)

5.6. Smoke test each tool:
- Open Claude Code, verify MCP servers load (context7, chrome-devtools, markdownify)
- Open Codex, verify MCP servers load
- Open Cursor, verify MCP servers load
- Verify skills are discoverable in Claude Code and Codex

5.7. Commit source repo: "Complete initial sync"

**Acceptance:** All three tools have identical MCP servers. All 22 curated skills accessible via symlinks in both Claude Code and Codex. No tool is broken.

**Rollback plan:** Restore from `.pre-agents-sync` backups if anything breaks.

---

### Task 6: Cleanup

**Goal:** Remove orphaned configs and document the setup.

**Steps:**

6.1. Remove old standalone skill directories from `~/.claude/skills/` that have been replaced by symlinks:
- Only remove directories that have been successfully replaced by symlinks
- Verify each symlink resolves before removing the original
- Skills to remove (originals): auditing-knowledge-docs, blog-post-polish, incremental-commits, polish-voice-research, restructuring-knowledge-docs

6.2. Clean up old `~/.agents/skills/` state:
- The old agentcash directory and superpowers symlink were already removed in Task 4
- Verify no orphaned entries remain

6.3. Remove `.pre-agents-sync` backups after confirming everything works (keep for 1 week)

6.4. Update `~/dev/.agents/ARCHITECTURE.md`:
- Add "Implementation Status" section noting Phase 1 is complete
- Correct any assumptions that differed from reality (e.g., Claude had no mcpServers)
- Note that superpowers are now in the source repo alongside plugin-managed copies

6.5. Update source repo README with:
- How to run sync: `bun run sync-mcp.ts`
- How to add a new MCP server (edit mcp-servers.json, run sync)
- How to add a new skill (add to skills/shared/, curate in ~/.agents/skills/, run sync)
- How to update superpowers (copy from upstream, commit to source repo)

6.6. Final commit and verify

**Acceptance:** No orphaned files. README documents the workflow. Architecture doc reflects reality.

---

## Task Dependency Graph

```
Task 1: Init source repo
  │
  ├── Task 2: Migrate skills + superpowers (depends on 1)
  │
  ├── Task 3: Write sync script (depends on 1)
  │     │
  │     └── Task 5: Run initial sync (depends on 3, 4)
  │           │
  │           └── Task 6: Cleanup (depends on 5)
  │
  └── Task 4: Wire aggregation layer (depends on 1, 2)
```

Tasks 2 and 3 can run in parallel after Task 1.
Task 4 depends on both 2 (skills + superpowers exist in source repo) and 1 (config files exist).
Task 5 depends on both 3 (sync script exists) and 4 (aggregation layer wired).
Task 6 is the final sequential step.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cursor loses MCP servers on sync (shadcn, @21st-dev/magic dropped) | Certain | Low — intentional, per decision | User confirmed. Can re-add to registry if needed later. |
| Claude Code doesn't read mcpServers from settings.json | Medium | High — sync would be useless for Claude MCP | Test with a single server first. If Claude ignores it, investigate plugin-based MCP loading. |
| smol-toml can't round-trip Codex's config.toml | Low | Medium — Codex config could get mangled | Test TOML parse→serialize round-trip before writing. Keep backup. |
| Symlink chains break if source repo moves | Low | Medium — all tools lose skills/config | Document the dependency. Use absolute paths in symlinks. |
| Plugin-managed superpowers conflict with source repo copies | Medium | Low — duplicate skill names, Claude sees both | Identical content means no behavioral difference. Document coexistence. Long-term: remove plugin dependency. |
| Superpowers source repo copy drifts from upstream | Medium | Low — manual update process | Document update procedure in README. Check upstream periodically. |
| Codex's config.toml has inline comments that get stripped | Medium | Medium — loss of documentation in config | smol-toml preserves comments. Verify in testing. |

---

## Estimated Task Sizes

| Task | Scope | Files Created/Modified |
|------|-------|----------------------|
| 1. Init source repo | Small | 4 new files + dirs |
| 2. Migrate skills + superpowers | Medium | Copy 7 skill dirs + 14 superpowers dirs + 1 symlink |
| 3. Write sync script | Medium | 1 main script + 1 test file + package.json |
| 4. Wire aggregation layer | Small | ~22 symlinks + 3 config symlinks |
| 5. Run initial sync | Small | Execution + verification |
| 6. Cleanup | Small | Remove orphans, update docs |
