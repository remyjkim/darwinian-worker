# ABOUTME: Design spec for card-embedded Claude Code hooks that emit session signals.
# ABOUTME: Covers the generic hooks-in-cards mechanism, the drwn hook subcommands, and the signal contract for DHS/SA.

# Task 41: Card-Embedded Session-Signal Hooks (Design)

> **For Claude:** This is a DESIGN / SPEC document produced via `superpowers:brainstorming`.
> The implementation plan is a separate follow-up produced via `superpowers:writing-plans`.

**Status**: In Review
**Created**: 2026-06-23
**Updated**: 2026-06-23
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR (generic mechanism + hook subcommands + signal contract)
**Dependencies**:
- `curation-labs/darwinian-harness-services` (DHS) — session analysis, consumes the `card_usage` signal (follow-up PR)
- `curation-labs/signal-analyzer` (SA) — skill in/out/outcome extractor, consumes the skill signals (follow-up PR)
**References**: [.ai/knowledges/10_drwn-cli-architecture.md, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/sync.ts, cli/core/effective-state.ts, cli/core/card-manifest.ts, cli/core/card-project.ts, cli/core/types.ts, cli/core/extensions/registry.ts, cli/core/export/archiver.ts, cli/core/export/session-discovery.ts, cli/core/analyze/inline-export.ts, cli/commands/init.ts, cli/commands/export/sessions.ts, cli/commands/analyze/sessions.ts, registry/config.json, docs-docusaurus/docs/concepts/materialization.md, docs-docusaurus/docs/reference/schemas/card-manifest.md, docs-docusaurus/docs/reference/schemas/write-record-json.md, docs-docusaurus/docs/reference/cli/export.md, docs-docusaurus/docs/reference/cli/analyze.md, test/core-archiver.test.ts, https://code.claude.com/docs/en/hooks]

---

## 1. Objective

Make Claude Code **hooks** a first-class artifact in `drwn` (declarable in card
manifests + project config, materialized into `.claude/settings.json`), and ship two
hook subcommands that emit append-only **session signals** consumed by two downstream
services:

1. **Card-usage tracking (for DHS session analysis).** On every user prompt, record
   which Harness Cards are active for the session, so analysis can filter/aggregate
   sessions by card.
2. **Skill-trigger marking (for SA skill extractor).** Anchor **every skill
   invocation**: model/tool-invoked skills (the `Skill` tool) **and** direct
   `/slash-command` skills (slash-command expansion).

Today "hooks" is a **declared-but-unimplemented** concept: `ExtensionMode` lists
`"hooks"` (`cli/core/extensions/types.ts:5`) and only **Beads** declares it in
`defaultModes` (`cli/core/extensions/registry.ts:12`; Parallel/others are
`["cli","skills"]`). Nothing writes hooks; the Claude writer manages only `mcpServers`
(`cli/core/mcp.ts:75-97`).

**Scope note (per review):** this task delivers the hook *mechanism* and the two hook
subcommands + signal contract. **Packaging the hooks into a default card and auto-applying
it at bootstrap is OUT OF SCOPE** (see §9) — `drwn init` only scaffolds config and
registers the catalog today (`cli/commands/init.ts:74,98`), and how the card is
delivered (packaged default vs catalog entry vs new init behavior) is deferred. A thin
example card / fixture is used here only to exercise the mechanism in tests.

## 1a. Success criteria

- [ ] A card manifest and project config can declare `hooks`; `drwn write` materializes
      them into the project-local `.claude/settings.json` `hooks` block.
- [ ] The `hooks` key is managed-fields drift-guarded like `mcpServers`, **plus** a
      first-adoption guard: if `.claude/settings.json` already has an unmanaged `hooks`
      key (no `_drwn.hooks` hash), the write refuses unless `--force`. With `--force`,
      drwn **replaces** the existing hooks and takes ownership (records the hash).
- [ ] `drwn hook card-usage` (UserPromptSubmit) appends a `card_usage` signal on the
      first prompt and on every active-card-set change (write-on-change); never errors.
- [ ] `drwn hook skill-marker` anchors every skill: `skill_invocation` (PreToolUse
      `Skill`), `skill_result` (PostToolUse `Skill`), and `skill_expansion`
      (UserPromptExpansion, **filtered to skill expansions**) for direct `/slash` skills.
- [ ] Skill signals carry `tool_use_id` (hard contract); `seq` is debug-only.
- [ ] `drwn export sessions` **and** `drwn analyze sessions --fresh` (inline export)
      exclude `*.drwn-signals.jsonl` from `claude/`; signal bundling under `signals/` is
      **behind `--include-signals` (default off) until DHS handles `signals/`**.
- [ ] Hook subcommands emit **no stdout/stderr** on success or swallowed failure.
- [ ] Signal lines conform to §5 and are consumable by DHS and SA per §9.
- [ ] Unit + integration tests (§8) pass; manifest schema + materialization + write-record
      + export + analyze docs updated.

## 2. Background — why this shape

Both services consume the **Claude session transcript JSONL**, and `drwn` already owns
the pipeline that ships transcripts to the analyzer.

- `drwn export sessions` scans `~/.claude/projects/<slug>/*.jsonl` and bundles them into
  a tar restricted to `claude/`/`codex/` (`cli/core/export/archiver.ts:9,54`);
  `drwn analyze sessions` uploads it. The inline `--fresh` path reuses the same
  discovery + archiver (`cli/core/analyze/inline-export.ts:6-14`).
- **DHS** counts archive members as session logs via `isSessionLogArchiveEntry` — any
  `.jsonl` with no dot-prefixed path segment (`backend/src/analysis/archive-entry.ts:1-9`)
  — at both ingest paths, and can throw `too_many_session_logs`
  (`backend/src/loop/archive-ingest.ts:43-48`, `backend/src/queue/consumer.ts:114`). It
  has **no** per-session card storage today.
- **SA**'s extractor (`signal-analyzer/workers/skill-inout-extractor/src/index.ts`)
  reads a single mounted log at `/workspace/logs/session.jsonl` (`index.ts:30,67`) and
  detects skills with a regex/heuristic prompt (`src/task-template.ts`). There is no
  `log-digest.ts`.

Therefore hooks emit append-only signal records **co-located with the transcript** and
ride drwn's existing export/upload path. Fast, offline, non-blocking, conservative.

### Decisions captured during brainstorming + review

| Decision | Choice |
|---|---|
| Target tools | Claude Code first; Codex later |
| Config layers carrying hooks | Cards + project config only |
| Materialization destination | Project-local `.claude/settings.json` (`cli/core/sync.ts:138-139`) |
| Hook logic location | `drwn hook <name>` subcommands |
| Signal transport | Co-located sidecar; bundled under `signals/` behind `--include-signals` |
| Card-usage cadence | Write-on-change on `UserPromptSubmit` |
| Skill coverage | `Skill` tool (Pre/Post) + direct `/slash` (UserPromptExpansion, skill-filtered) |
| Skill anchor | `tool_use_id` (hard contract); `seq` debug-only |
| `skill_result` payload | Pure flag (anchor + identity only) |
| First-adoption `--force` | Replace + take ownership (a future `--adopt` may import) |
| Generic hook schema (MVP) | `type: "command"` only; strictness scoped to `hooks.<id>` |
| Default card + bootstrap delivery | **Out of scope** (deferred) |

## 3. Architecture

Three layers built here (Layer 4 deferred). DHS/SA consumers are follow-up PRs,
contract-bound by §5 and §9.

### Layer 1 — Generic hooks-in-cards mechanism

- **Types** (`cli/core/types.ts` + new `cli/core/hooks.ts`):
  ```ts
  type HookEvent =
    | "UserPromptSubmit" | "UserPromptExpansion"
    | "PreToolUse" | "PostToolUse"
    | "SessionStart" | "SessionEnd" | "Stop";   // documented subset; extend as needed

  interface HookDefinition {
    event: HookEvent;
    matcher?: string;     // allowed on matcher-bearing events (PreToolUse, PostToolUse,
                          // UserPromptExpansion, SessionStart, …) — not only tool events
    type?: "command";     // MVP: command only
    command: string;      // absolute path preferred (see §7)
    args?: string[];      // exec form preferred over a single shell string
    timeout?: number;
    description?: string;
  }
  ```
  > Claude's real surface is larger (more events; hook types `http`/`mcp_tool`/`prompt`/
  > `agent`; command options `async`/`asyncRewake`/`shell`). This MVP models a
  > command-hook subset and validates strictly so later expansion is additive.

  `CardManifest` (`cli/core/card-manifest.ts:7`) and `ProjectConfig`
  (`cli/core/types.ts:95`) each gain `hooks?: Record<string, HookDefinition>`.

- **Validation** (`cli/core/card-manifest.ts`): **strictness is scoped to each
  `hooks.<id>` object only** — event ∈ allowed set; `matcher` only on matcher-bearing
  events; `type` is `command` or omitted; `command` non-empty; reject unknown keys
  *within a hook definition*. `validateCardManifest` stays permissive about other unknown
  top-level manifest keys (`card-manifest.ts:50`) — no global strictness change.

- **Merge** (`cli/core/card-project.ts:49`): fold `hooks` like
  `servers`/`extensions`/`targets` (card defines; project overrides by id).

- **Effective state** (`cli/core/effective-state.ts`): expose merged `activeHooks`.

- **Renderer** (`cli/core/hooks.ts`): `renderClaudeHooks(defs)` → Claude's nested shape.
  The example hooks (used by tests; default-card packaging deferred):
  ```json
  {
    "UserPromptSubmit":    [ { "hooks": [ { "type": "command", "command": "<drwn>", "args": ["hook","card-usage"] } ] } ],
    "UserPromptExpansion": [ { "hooks": [ { "type": "command", "command": "<drwn>", "args": ["hook","skill-marker","--phase","expansion"] } ] } ],
    "PreToolUse":          [ { "matcher": "Skill", "hooks": [ { "type": "command", "command": "<drwn>", "args": ["hook","skill-marker","--phase","pre"] } ] } ],
    "PostToolUse":         [ { "matcher": "Skill", "hooks": [ { "type": "command", "command": "<drwn>", "args": ["hook","skill-marker","--phase","post"] } ] } ]
  }
  ```
  `<drwn>` is an absolute path resolved at write time (see §7). The UserPromptExpansion
  hook fires broadly; the **subcommand filters to skill expansions** (it can't be
  matcher-limited to "skills only").

- **Writer** (`cli/core/mcp.ts` / sibling `claude-settings.ts`): manage `hooks` as a
  second `_drwn` field alongside `mcpServers` via `cli/core/managed-fields.ts`.
  **First-adoption guard:** `mcp.ts:78` defaults `managedKeys` to `["mcpServers"]`, so a
  pre-existing unmanaged `hooks` key has no recorded hash and would be overwritten
  silently. The writer must detect that case and **refuse unless `--force`**; with
  `--force` it **replaces** the existing hooks and records the `_drwn.hooks` hash, taking
  ownership thereafter (same replace semantics as `mcpServers`). A future `--adopt` that
  imports existing hooks into project config is out of scope.

- **Sync wiring** (`cli/core/sync.ts:157-161`): in project scope render+merge hooks,
  record a managed path with `fields: ["mcpServers","hooks"]`.

### Layer 2 — Hook logic as `drwn hook <name>` subcommands

Hidden subcommands in `cli/index.ts`, reading Claude's hook JSON from **stdin**. Each
emits a **positional flag (anchor), not the payload**.

- **`drwn hook card-usage`** ← `UserPromptSubmit`. Resolves the nearest `card.lock` from
  `cwd`; appends a `card_usage` signal **write-on-change** (only when the active card set
  differs from the **last `card_usage` line** for the session — it must scan for the last
  `card_usage` record, not the last line, since the sidecar interleaves skill records).
  - **Why `UserPromptSubmit` (not `SessionStart`):** the card set changes only via
    `drwn card add/remove/apply`; there is no "card.lock changed" event. `UserPromptSubmit`
    is the only event that both marks a user call and re-observes `card.lock`, so a switch
    is caught on the next prompt. Cost is a small read + compare; writes are rare.

- **`drwn hook skill-marker`** ← `PreToolUse`/`PostToolUse` (matcher `Skill`) and
  `UserPromptExpansion`. Emits:
  - `skill_invocation` on PreToolUse (input anchor; `tool_use_id`, `tool_input`),
  - `skill_result` on PostToolUse (output anchor; **pure flag**, `tool_use_id`),
  - `skill_expansion` on UserPromptExpansion **only when the expansion is a skill** —
    Claude's UserPromptExpansion also covers custom slash commands and MCP prompts, so
    the subcommand inspects `expansion_type`/`command_source` and emits only for skills,
    recording `command_source`/`source_kind` so SA never treats every `/foo` as a skill.
  - **Anchor (hard contract):** capture `tool_use_id` from the payload as the primary
    correlation key (PostToolUse → PreToolUse → transcript `tool_use`/`tool_result`).
    `seq` (per-session counter) is **debug-only**; it is race-prone under parallel tool
    calls/subagents (drwn has no locks/IPC,
    `.ai/knowledges/10_drwn-cli-architecture.md:32`) and must never be the correlation key.
  - **Implementation fixtures (required before shipping):** the public docs don't name
    the built-in `Skill` tool, so capture a **real** Skill-trigger payload to confirm
    `tool_name == "Skill"` and the `tool_input` shape (skill-identifier field), and a real
    `UserPromptExpansion` payload to confirm `expansion_type`/`command_source`/
    `command_name`. If the tool name differs in the installed build, the example hook
    would silently miss model-invoked skills.

### Layer 3 — Signal sink + transport

- **Sink path:** `${dirname(transcript_path)}/${session_id}.drwn-signals.jsonl`.
  Fallback when `transcript_path` is absent uses the same suffix:
  `~/.agents/drwn/signals/${session_id}.drwn-signals.jsonl`.
- **Export discovery & bundling** (`session-discovery.ts`, `archiver.ts`) — affects both
  `drwn export sessions` and `drwn analyze sessions --fresh` (shared via
  `inline-export.ts:6-14`):
  - `discoverClaudeSessions` (maps `.jsonl` → `claude/<basename>`,
    `session-discovery.ts:91,150`) must **exclude `*.drwn-signals.jsonl`** from `claude/`.
  - Behind `--include-signals` (default off): re-add them under a `signals/` namespace
    (`ALLOWED_PREFIXES` gains `signals/`, `archiver.ts:9`) and add a second discovery root
    for `~/.agents/drwn/signals/`.
- **DHS protection (required, gates rollout):** `signals/*.jsonl` would be counted as
  session logs (`archive-entry.ts:1-9`) and could throw `too_many_session_logs`. DHS must
  (a) exclude `signals/` from session-log counting/parsing and (b) parse them separately.
  Until DHS ships that, `--include-signals` stays off — that is why bundling is gated, not
  default-on.

### Layer 4 — Default card + bootstrap delivery (DEFERRED / OUT OF SCOPE)

Packaging the hooks into a `@curation-labs/session-signals` card and deciding delivery
(packaged default card vs catalog entry users apply vs new `drwn init`/apply behavior) is
out of scope for this task. `drwn init` does not apply cards today
(`cli/commands/init.ts:74,98`); revisit in a follow-up.

## 4. Data flow

```
User prompt ───────────────► UserPromptSubmit ──► drwn hook card-usage (reads card.lock)
/slash skill ──────────────► UserPromptExpansion ─► drwn hook skill-marker (expansion, skill-filtered)
Skill tool (model-invoked) ─► PreToolUse:Skill ──► drwn hook skill-marker (pre)
                            └► PostToolUse:Skill ─► drwn hook skill-marker (post)
                                                       │
                              <session_id>.drwn-signals.jsonl  (append-only, co-located)
                                                       │
                  drwn export / analyze --fresh  (excluded from claude/; signals/ behind --include-signals)
                                                       │
                          drwn analyze sessions ─► DRWN_ANALYZER_URL
                                                       │
                  ┌─────────────────────────────────────┴───────────────────────────┐
                  ▼                                                                   ▼
          DHS session analysis                                            SA skill extractor
   (signals/ parsed separately; card_usage → session↔card)   (mount sidecar; anchor skills via tool_use_id)
```

## 5. Signal contract (stable; consumed by DHS and SA)

Each line of `<session_id>.drwn-signals.jsonl` is one JSON object with a `type`
discriminator. Timestamps ISO-8601 UTC. **Markers are flags, not payloads.**

```jsonc
// drwn hook card-usage (UserPromptSubmit) — write-on-change
{ "type": "card_usage", "session_id": "abc", "ts": "…", "cwd": "/proj",
  "cards": [ { "name": "@curation-labs/improve", "version": "1.2.3" } ] }

// drwn hook skill-marker (UserPromptExpansion, skill expansions only) — direct /slash
{ "type": "skill_expansion", "session_id": "abc", "ts": "…",
  "command_name": "brainstorming", "skill": "superpowers:brainstorming",
  "command_source": "skill", "source_kind": "slash_expansion" }

// drwn hook skill-marker (PreToolUse Skill) — INPUT anchor
{ "type": "skill_invocation", "session_id": "abc", "ts": "…",
  "skill": "superpowers:brainstorming", "tool_use_id": "toolu_…", "source": "tool_use",
  "seq": 3 }

// drwn hook skill-marker (PostToolUse Skill) — OUTPUT anchor (pure flag)
{ "type": "skill_result", "session_id": "abc", "ts": "…",
  "skill": "superpowers:brainstorming", "tool_use_id": "toolu_…", "seq": 3 }
```

(`seq` is debug-only; `tool_use_id` is the contractual anchor.)

- **DHS** keys on `session_id` + the distinct union of `cards` across the session's
  `card_usage` lines (read as `ts` intervals) → session↔card mapping. **Required:** parse
  `signals/` entries separately and exclude them from session-log counting
  (`archive-entry.ts`, `archive-ingest.ts`, `consumer.ts`).
- **SA** uses the flags as anchors: `tool_use_id` locates the Skill `tool_use` (input) /
  `tool_result` (output) blocks deterministically; `skill_expansion` covers `/slash`
  skills (filter by `command_source == "skill"`). **Required SA changes:** mount the
  sidecar at **`/workspace/logs/session.drwn-signals.jsonl`** alongside
  `/workspace/logs/session.jsonl` (`index.ts:30,67`), and update the extractor /
  `task-template.ts` to read the flags + the blocks they anchor (it is regex/heuristic
  today and misses non-text skill triggers).

## 6. Error handling & robustness

- Both subcommands **always exit 0**; errors swallowed best-effort; never block the agent.
- **Silence contract:** emit **no stdout and no stderr** on success or on swallowed
  failure (Claude treats hook stdout/stderr as context/warnings/debug material). All
  diagnostics go only to a bounded debug file under `~/.agents/drwn/` (size-capped).
- Missing/malformed stdin or absent `transcript_path` → fallback sink or skip silently.
- Local file I/O only; small `card.lock` read; write-on-change dedup; target < 50 ms;
  single-line `O_APPEND` writes.

## 7. Safety

Command hooks run with full user permissions.

- Render hooks in **exec form** (`command` = absolute `drwn` path, `args = ["hook",…]`).
- **`<drwn>` resolution precedence** (resolved at `drwn write`): the running executable's
  real path (npm/Homebrew/pnpm shim or packaged binary) via `process.execPath`/argv,
  preferring a stable shim over a dev checkout path. Record the resolved path; on a later
  `drwn write` re-resolve and rewrite if it moved (e.g. after upgrade). If the recorded
  path no longer exists at hook run time, the hook no-ops (silence contract) rather than
  crashing the agent. Document that moving/uninstalling `drwn` requires a re-`write`.
- Verify the binary path during `drwn write`; test PATH-missing / moved-binary behavior.
- The generic mechanism prints every hook command in the `drwn write` changeset and
  documents that hooks execute code.
- First-adoption guard (Layer 1) prevents clobbering user hooks; `--force` = replace.
- A recorded-approval ledger for third-party card hooks is future work.

## 8. Testing

- **Unit:** renderer (all four events); manifest+project hook merge; hook-scoped
  validation (events, matcher rules, unknown-key rejection **within `hooks.<id>`** while
  other unknown top-level manifest keys remain allowed); managed-fields drift on `hooks`;
  **first-adoption guard** (refuse without `--force`; `--force` replaces + records hash);
  subcommands via stdin fixtures — card-usage write-on-change **finding the last
  `card_usage` line in a mixed sidecar** (interleaved skill records) + fallback sink;
  skill markers for pre/post/expansion incl. `tool_use_id` capture and
  UserPromptExpansion **skill-filtering** (non-skill `/foo` not marked); silence contract
  (no stdout/stderr).
- **Export + analyze:** sidecar excluded from `claude/` in both `drwn export sessions`
  **and** `drwn analyze sessions --fresh` (inline export); `signals/` inclusion only under
  `--include-signals`; `archiver.ts` allowlist accepts `signals/` and still rejects others
  (extend `test/core-archiver.test.ts`).
- **Integration:** apply a card with hooks → `drwn write` → assert project
  `.claude/settings.json` `hooks` block + `_drwn` meta + idempotent re-write.
- **Docs:** `CardManifest` type + `card-manifest.md`; `materialization.md` (managed fields
  now `mcpServers` + `hooks`); `write-record-json.md` (managed-path fields); `export.md`
  + `analyze.md` (`signals/` namespace, `--include-signals`). Covered by acceptance tests.

## 9. Scope boundaries

**In scope (this repo / PR):** generic hooks mechanism (types, validation, merge,
effective-state, renderer, Claude writer + first-adoption `--force` replace, sync wiring);
the `drwn hook` subcommands; the signal contract (§5); export/analyze exclusion from
`claude/` + `signals/` bundling behind `--include-signals`; tests + docs.

**Out of scope:**
- **Default card + bootstrap delivery** (packaged default vs catalog vs init/apply) — deferred.
- **DHS:** exclude/parse `signals/` separately + session↔card storage + filter-by-card UI.
- **SA:** mount the sidecar at `/workspace/logs/session.drwn-signals.jsonl` + update the
  extractor (`index.ts`, `task-template.ts`) to follow flags (`tool_use_id`).
- **drwn:** Codex hooks writer; richer Claude hook schema (non-command types/options/more
  events); `--adopt` import path; third-party hook approval ledger.

## 9a. Risks & mitigation

| Risk | Mitigation |
|---|---|
| Hook latency on the hot loop | Local file I/O only; fast read; write-on-change; < 50 ms. |
| Hook failure blocks the agent | Always exit 0; silence contract; errors swallowed. |
| Hook prints to stdout/stderr and pollutes context | No stdout/stderr on success or swallowed failure; diagnostics to bounded debug file only. |
| First write clobbers user `hooks` | Adoption guard refuses without `--force`; `--force` = replace + own. |
| Sidecar exported as a Claude session log | Exclude `*.drwn-signals.jsonl` from `claude/` in export **and** analyze inline export. |
| Signals counted as DHS session logs → `too_many_session_logs` | `signals/` bundling behind `--include-signals` (default off) until DHS skips/parses `signals/`. |
| `seq` races (no locks/IPC; parallel calls/subagents) | `tool_use_id` is the contractual anchor; `seq` is debug-only. |
| Built-in `Skill` tool name/`tool_input` shape unverified | Require a real Skill-trigger payload fixture before shipping the example hook. |
| UserPromptExpansion over-marks `/foo` custom commands / MCP prompts | Filter by `expansion_type`/`command_source == skill`; record `source_kind`. |
| `<drwn>` path moves after upgrade | Resolve + record at `drwn write`; re-resolve on next write; no-op if missing; document re-write requirement. |

## 10. Open questions for review

1. Sidecar naming `<session_id>.drwn-signals.jsonl` — confirm no collision with other
   `*.jsonl` consumers of the Claude projects dir (export now excludes it from `claude/`).
2. ~~Skill coverage~~ **Resolved:** all skills (add `UserPromptExpansion`, skill-filtered).
3. ~~`skill_result` payload~~ **Resolved:** pure flag.
4. ~~First-adoption `--force`~~ **Resolved:** replace + take ownership.
5. ~~Default card delivery~~ **Resolved:** out of scope (deferred).
