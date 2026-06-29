# ABOUTME: Investigation into extending the drwn CLI to also target Claude Cowork alongside Claude Code.
# ABOUTME: Maps the existing multi-target write architecture, identifies what Cowork actually shares with Claude Code, and recommends an explicit-target strategy.

# Analysis 80 — Targeting Claude Cowork: Investigation and Strategy

**Date**: 2026-06-28
**Author**: Claude + Remy
**Status**: Draft — investigation complete, awaiting decision on Option A vs. B
**References**: [.ai/analyses/79_cowork_management_guide.md, .ai/analyses/70_mcp-multi-target-write-adapter-architecture.md, .ai/analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, cli/core/types.ts, cli/core/paths.ts, cli/core/sync.ts, cli/core/skills.ts, cli/core/mcp.ts, cli/core/project.ts, cli/core/hook-generator/sync-hooks.ts, registry/config.json, cli/commands/write.ts]

---

## Terminology note

This report reads "Cloud Core" (from the prompt) as **Claude Cowork** — the desktop Cowork surface documented in `79_cowork_management_guide.md` — and "Cloud Code" as **Claude Code**, the CLI surface the harness targets today. The rest of this document uses "Cowork" and "Claude Code".

---

## Executive Summary

The `drwn` CLI already has a mature, extensible **multi-target write architecture**. Targets are first-class: `TargetName = "claude" | "codex" | "cursor"` (`cli/core/types.ts:7`), each with a `TargetConfig` (`cli/core/types.ts:33-40`), seeded from `registry/config.json`, selectable via `--target`, and overridable per-project (`cli/core/project.ts:72-76`). MCP rendering is already adapter-shaped — three per-target emitters in `cli/core/mcp.ts` (the work from analysis 70).

The central finding is that **Cowork is not a new filesystem destination — it is a second consumer of the destination the CLI already writes for Claude Code.** Per `79_cowork_management_guide.md`, Cowork "shares configuration with [Claude Code]: CLAUDE.md files, MCP servers, hooks, skills, and settings" and reads them from the same `~/.claude/` tree (`~/.claude/skills/`, `~/.claude/settings.json`, `~/.claude.json`). The CLI writes exactly those paths today (`cli/core/paths.ts:63-81`, machine scope rooted at `homeDir`). **So Cowork already receives the harness's skills, MCP servers, and hooks at no additional cost — implicitly and undocumented.**

That makes this less a "new write path" project and more a **modeling and correctness** decision: do we leave Cowork as an implicit free-rider on the Claude target, or promote it to an explicit `TargetName` so it can be named, documented, toggled, and (eventually) diverge? I recommend the latter, but staged: ship an explicit `cowork` target that is a thin alias of `claude` today, while treating the three real Cowork-specific risk areas — **symlinked skills, the ephemeral-skill / session-VM model, and hook trust/snapshot semantics** — as the investigation's actual substance, since they are where "shares config with Claude Code" stops being true in practice.

---

## Context

Remy asked whether `drwn` can target Cowork in addition to Claude Code, and for a thorough investigation grounding any future work. The CLI today works well on macOS against Claude Code. The reference material is `79_cowork_management_guide.md`, which establishes the shared-configuration foundation, the skills storage model, the hooks model, and the macOS/Windows differences for Cowork.

Two questions frame the investigation:

1. **Mechanically**, what does the CLI write, where, and does Cowork read from those same locations?
2. **Architecturally**, should Cowork be an explicit target, and what (if anything) about Cowork diverges from Claude Code enough to need its own handling?

---

## Investigation

### The target model as it exists today

Targets are a first-class, data-driven concept:

- `cli/core/types.ts:7` — `export type TargetName = "claude" | "codex" | "cursor";`
- `cli/core/types.ts:33-40` — `TargetConfig { enabled, configPath, userMcpPath?, format, mcpKey, symlink? }`.
- `cli/core/types.ts:52` — `CanonicalConfig.targets: Record<TargetName, TargetConfig>`.
- `cli/core/types.ts` (`ProjectConfig`) — `targets?: Partial<Record<TargetName, { enabled: boolean }>>`, so a project can disable a target.
- `registry/config.json:3-24` — the three targets are materialized in the packaged default config, each with its `configPath`, `userMcpPath`, `format`, `mcpKey`.

The `claude` target is therefore **abstracted at the type/config level but enumerated by name** — adding a fourth target name requires touching the enum, the registry config, and the places that branch on the literal target name.

### What the CLI actually writes (and where Cowork reads)

`cli/core/paths.ts:63-81` (`resolveToolPaths`) is the canonical destination map; the root is `projectRoot` for project scope or `homeDir` for machine scope:

```ts
claudeSkills:   join(root, ".claude", "skills"),
claudeMcp:      join(root, ".mcp.json"),
claudeSettings: join(root, ".claude", "settings.json"),
// + codex / cursor entries
```

Machine scope roots at `homeDir`, which is resolved once in `cli/context.ts:19` and `cli/core/paths.ts:112` (`options.homeDir ?? homedir()`). The relevant destinations and the Cowork guide's claimed read locations line up:

| Asset | drwn writes (Claude target) | Cowork reads (per doc 79) | Same? |
|---|---|---|---|
| Personal skills | `~/.claude/skills/<name>/` (symlink) | `~/.claude/skills/<name>/` | Yes |
| Project skills | `<proj>/.claude/skills/<name>/` (symlink) | `<proj>/.claude/skills/` | Yes |
| User settings / hooks | `~/.claude/settings.json` (merge) | `~/.claude/settings.json` | Yes |
| Project MCP | `<proj>/.mcp.json` | project `.mcp.json` | Yes |
| User MCP | `~/.claude.json` (`userMcpPath`) | `~/.claude.json` | Yes |

This is the load-bearing finding: **the CLI's Claude write path already populates every location the Cowork guide says Cowork reads.** There is no second filesystem tree to materialize.

### Where MCP is already adapter-shaped

Analysis 70's adapter work shipped. `cli/core/mcp.ts` has three render functions — `toJsonServerConfig` (Claude/Cursor baseline), `toCursorServerConfig` (rewrites `${VAR}`→`${env:VAR}`, drops `type`), `toCodexServerConfig` (`env_vars` passthrough, TOML) — dispatched per target in `syncMcp` (`cli/core/sync.ts`, the per-target write block). Cowork, sharing Claude's `~/.claude.json` and `.mcp.json`, needs **no new MCP emitter** — the Claude renderer is already correct for it. This is the cheapest dimension.

### Skills are materialized as symlinks — the first real divergence

`cli/core/skills.ts:50-72` (`ensureDirSymlink`) creates skills via `symlinkSync(targetPath, linkPath, "dir")` (line 71). The harness does not copy skill folders into `~/.claude/skills/`; it symlinks them to the source-of-truth store. This matters for Cowork in two ways the guide flags:

1. Cowork's guide (§2.3) describes a **session-VM model** where skills are mounted into an ephemeral per-session directory, and a community workaround is precisely to **symlink** canonical `~/.claude/skills/` entries into the session dir. So Cowork is symlink-aware — but whether Cowork's session VM *follows* a symlink whose target lives outside `~/.claude` (the harness points at `~/.agents/...` / the card store) is unverified. If the VM mounts only `~/.claude/skills/` and resolves symlinks at mount time, a symlink pointing outside that tree may not resolve inside the VM.
2. The guide's Windows note (§5) reports "SKILL.md not accessible from session VM" errors when the underlying path is non-standard. Harness skills are symlinks to a non-standard location by construction.

This is not a blocker, but it is the most likely place "Cowork == Claude Code" quietly breaks, and it deserves an empirical check (Open Question 1).

### Hooks — shared file, different runtime semantics

The CLI materializes hooks into the Claude settings layer: machine-scope hooks merge into `~/.claude/settings.json` and project hooks land under `.agents/drwn/generated/hooks/claude/` referenced from settings (`cli/core/hook-generator/sync-hooks.ts` and the `syncHooks` path). Per doc 79 §3, Cowork has **no hooks UI**; it inherits hooks purely because it reads the same `settings.json`. Three Cowork-specific behaviors apply that do not apply to a Claude Code CLI session:

- **Workspace trust gating** (doc 79 §3.3): hooks are silently skipped in untrusted Cowork workspaces, which are granted folder-by-folder. A harness hook that "just works" in Claude Code may be silently inert in a freshly-added Cowork folder.
- **Config snapshot at session start**: a `drwn write` mid-session won't take effect until the next Cowork session.
- **Command hooks are shell scripts.** The generated hook commands assume a POSIX shell — this is the seam shared with the Windows investigation (analysis 81). On Cowork-for-Windows this is the same hazard.

### The implicit free-rider problem

Because Cowork reads `~/.claude/*`, today `drwn write` already configures Cowork — but:

- There is no way to write *only* Cowork-relevant config, or to disable Cowork without disabling Claude Code (they are the same target).
- Nothing in `drwn write` output, `drwn doctor`, or docs tells the user Cowork is part of the blast radius.
- If Cowork's storage ever diverges from Claude Code's (the guide repeatedly warns behavior is "actively evolving" and that the surfaces have historically used "somewhat isolated storage silos"), the CLI has no seam to express the difference.

---

## Findings

1. **Cowork is a shared-config consumer, not a new write destination.** Every path the CLI writes for the `claude` target (`cli/core/paths.ts:63-81`, rooted at `homeDir`) is a path doc 79 says Cowork reads. The harness already configures Cowork implicitly.
2. **The target architecture is ready for a fourth target.** `TargetName` (`types.ts:7`), `TargetConfig` (`types.ts:33-40`), `registry/config.json`, `--target` (`cli/commands/write.ts`), and per-project overrides (`project.ts:72-76`) form a clean extension point. MCP is already adapter-shaped (analysis 70; `cli/core/mcp.ts`).
3. **A `cowork` target would be a near-identity alias of `claude`** for MCP and settings — same `configPath` (`~/.claude/settings.json`), same `userMcpPath` (`~/.claude.json`), same `mcpKey`, same `json-merge` format. No new MCP emitter required.
4. **Skills are symlinks, and that is the first genuine Cowork risk** (`skills.ts:71`). Cowork's session-VM mount model may not resolve symlinks whose targets live outside `~/.claude/skills/`. Unverified; highest-value empirical check.
5. **Hooks are inherited but run under Cowork-specific semantics** — workspace-trust gating, start-of-session snapshotting, and a POSIX-shell assumption (shared with analysis 81). A harness hook valid for Claude Code can be silently skipped in Cowork.
6. **The status quo is correct-but-opaque.** Cowork works today by accident of shared paths; the cost of *not* modeling it explicitly is that the behavior is undocumented and has no seam to diverge.
7. **The ephemeral-skill gotcha cuts in the harness's favor.** Doc 79 §2.3 warns that skills created *inside* a Cowork session land in ephemeral dirs; the canonical fix is to author into `~/.claude/skills/`. The harness already writes there — so harness-managed skills are on the *persistent* side of that gotcha by construction.

---

## Recommendations

### Decision: model Cowork explicitly, but as a thin alias (staged)

**Option A — Cowork as an explicit alias target (recommended).** Add `cowork` to `TargetName` and `registry/config.json` with the same `configPath`/`userMcpPath`/`format`/`mcpKey` as `claude`, route `resolveToolPaths` and `skills.ts` Cowork→Claude paths, and extend `--target` validation (`cli/commands/write.ts`). Net effect: users can `--target=cowork`, disable Cowork per-project, and see it in output/docs — and the codebase gains the seam to diverge later. Estimated blast radius is small (the enum, the config, and the handful of sites that branch on the literal target name: `skills.ts`, `sync.ts`, `write.ts`).

**Option B — document the implicit behavior only.** Leave the code unchanged; add a `doctor`/docs note that the Claude target also configures Cowork. Cheapest, but leaves the no-toggle and no-divergence-seam problems unsolved.

I recommend **A**, with two guardrails so we don't manufacture brittleness:

- **Do not duplicate logic.** Cowork must resolve through the same code paths as Claude (an alias, not a copy). The moment we copy a write routine and hardcode `cowork === claude`, a future divergence becomes a two-place bug. Prefer a single "claude-family" resolution that both names flow through.
- **Gate A on resolving the skills-symlink question (Finding 4) first.** If Cowork's session VM cannot follow the harness's symlinks, then `--target=cowork` for skills needs a **copy** fallback rather than a symlink — which is a real behavioral divergence, not an alias, and changes the design.

### Sequencing

1. **Empirical Cowork probe (do first).** On a Cowork install, run `drwn write`, then verify in a Cowork session: (a) do harness skills appear and load? (b) do MCP servers connect? (c) do hooks fire (and what does workspace-trust do)? This converts Findings 4–5 from hypotheses to facts and decides alias-vs-divergence.
2. **Ship Option A** as a documented alias if the probe is clean.
3. **Add a `cowork`-aware doctor check** surfacing trust/snapshot caveats and (on Windows) the shell-hook caveat shared with analysis 81.
4. **Only then** consider any Cowork-specific skill materialization (copy fallback) if the probe shows symlinks don't resolve.

### Explicitly out of scope / YAGNI

Cowork-specific hook *runtimes*, scheduled-task storage (`~/Documents/Claude/Scheduled/`), and Global/Folder instructions are Cowork UI constructs with no harness write path today. Do not build for them until there's a concrete need.

---

## Open Questions

1. **Does Cowork's session VM resolve harness symlinks whose targets live outside `~/.claude/skills/`?** (Decides alias vs. copy for skills — Finding 4.) Resolve empirically in step 1.
2. **Does Cowork honor project-scope `.mcp.json` and `.claude/settings.json`, or only the `~/.claude` user layer?** Doc 79 is explicit about the user layer; project-layer behavior in Cowork is less certain.
3. **Workspace-trust UX**: when a harness hook is skipped in an untrusted Cowork folder, is there any signal, or does it fail silent? Affects whether `doctor` can detect it.
4. **Is there a real user need to target Cowork *independently* of Claude Code?** If no one ever wants Cowork-on / Claude-off, Option A's toggle is theoretical and Option B may suffice. Worth confirming with Remy before building.
5. **CLAUDE_CONFIG_DIR**: doc 79 §1 says Cowork respects it; the CLI never reads it (`cli/context.ts:19`, `cli/core/paths.ts:112` use `HOME`/`homedir()` only). If a user sets `CLAUDE_CONFIG_DIR`, the CLI and Cowork would disagree on the config root. Cross-cutting with analysis 81.

---

## Appendix — Key code references

- `cli/core/types.ts:7` — `TargetName` enum (no `cowork`).
- `cli/core/types.ts:33-40` — `TargetConfig` shape.
- `cli/core/types.ts:52` — `CanonicalConfig.targets`.
- `registry/config.json:3-24` — packaged target definitions.
- `cli/core/paths.ts:63-81` — `resolveToolPaths` destination map.
- `cli/core/paths.ts:112` / `cli/context.ts:19` — `homeDir` resolution (machine-scope root).
- `cli/core/skills.ts:50-72` — `ensureDirSymlink` / `symlinkSync(..., "dir")` (line 71).
- `cli/core/mcp.ts` — `toJsonServerConfig` / `toCursorServerConfig` / `toCodexServerConfig` (analysis 70 adapters).
- `cli/core/sync.ts` — `syncMcp` per-target write dispatch.
- `cli/core/project.ts:72-76` — per-project target enable/disable.
- `cli/core/hook-generator/sync-hooks.ts` — hook materialization into the Claude settings layer.
- `cli/commands/write.ts` — `--target` option and validation (hardcoded three names).
