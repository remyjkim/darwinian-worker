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
**Estimated Effort**: 1 PR (generic mechanism + hooks + default card)
**Dependencies**:
- `curation-labs/darwinian-harness-services` (DHS) — session analysis, consumes the `card_usage` signal (follow-up PR)
- `curation-labs/signal-analyzer` (SA) — skill in/out/outcome extractor, consumes the skill signals (follow-up PR)
**References**: [.ai/knowledges/10_drwn-cli-architecture.md, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/sync.ts, cli/core/effective-state.ts, cli/core/card-manifest.ts, cli/core/card-project.ts, cli/core/types.ts, cli/core/extensions/types.ts, cli/core/extensions/registry.ts, cli/core/export/archiver.ts, cli/core/export/session-discovery.ts, cli/commands/export/sessions.ts, cli/commands/analyze/sessions.ts, registry/config.json, docs-docusaurus/docs/reference/schemas/card-manifest.md, docs-docusaurus/docs/reference/cli/export.md, test/core-archiver.test.ts, https://code.claude.com/docs/en/hooks]

---

## 1. Objective

Make Claude Code **hooks** a first-class, card-distributable artifact in `drwn`, then
ship hooks — embedded in a default Harness Card — that emit append-only **session
signals** consumed by two downstream services:

1. **Card-usage tracking (for DHS session analysis).** On every user prompt, record
   which Harness Cards are active for the session, so session analysis can filter and
   aggregate sessions by card.
2. **Skill-trigger marking (for SA skill extractor).** Anchor **every skill
   invocation** so the in/out/outcome extractor can locate it: both
   model/tool-invoked skills (via the `Skill` tool) **and** direct `/slash-command`
   skills (via slash-command expansion).

Today "hooks" is a **declared-but-unimplemented** concept: `ExtensionMode` lists
`"hooks"` (`cli/core/extensions/types.ts:5`) and only the **Beads** extension declares
it in `defaultModes` (`cli/core/extensions/registry.ts:12`; Parallel and the others are
`["cli","skills"]`, `registry.ts:42,71`). Nothing writes hooks anywhere — the Claude
writer manages only `mcpServers` (`cli/core/mcp.ts:75-97`).

## 1a. Success criteria

- [ ] A card manifest and project config can declare `hooks`; `drwn write` materializes
      them into the project-local `.claude/settings.json` `hooks` block.
- [ ] The `hooks` key is managed-fields drift-guarded like `mcpServers`, **plus** a
      first-adoption guard: if `.claude/settings.json` already has an unmanaged `hooks`
      key (no `_drwn.hooks` hash recorded), the write refuses unless `--force` / an
      explicit import path is used (it must never silently clobber user hooks).
- [ ] `drwn hook card-usage` (UserPromptSubmit) appends a `card_usage` signal on the
      first prompt and on every active-card-set change (write-on-change, not every turn);
      never errors the agent.
- [ ] `drwn hook skill-marker` anchors every skill: `skill_invocation` (PreToolUse
      `Skill`), `skill_result` (PostToolUse `Skill`), and `skill_expansion`
      (UserPromptExpansion) for direct `/slash` skills.
- [ ] Skill signals carry `tool_use_id` when the hook payload provides it (primary
      anchor); `seq`+`ts` is a best-effort fallback only.
- [ ] `drwn export sessions` **excludes** `*.drwn-signals.jsonl` from the `claude/`
      namespace and re-adds them under a `signals/` namespace.
- [ ] A default `session-signals` card carries the hooks and is included in bootstrap.
- [ ] Signal lines conform to §5 and are consumable by DHS and SA per §9.
- [ ] Unit + integration tests (§8) pass; manifest schema + export docs updated.

## 2. Background — why this shape

Investigation of both services produced one unifying insight: **both consume the
Claude session transcript JSONL**, and `drwn` already owns the pipeline that ships
transcripts to the analyzer.

- `drwn export sessions` scans `~/.claude/projects/<slug>/*.jsonl` and bundles them
  into a tar restricted to `claude/` / `codex/` namespaces
  (`cli/core/export/archiver.ts:9,54`); `drwn analyze sessions` uploads that archive to
  the analyzer (`DRWN_ANALYZER_URL` → DHS).
- **DHS** parses session JSONL and counts archive members as session logs via
  `isSessionLogArchiveEntry` (`backend/src/analysis/archive-entry.ts:1-9`) at both
  ingest paths (`backend/src/loop/archive-ingest.ts:44-48`, `backend/src/queue/consumer.ts:114`).
  It has **no** per-session card storage today.
- **SA**'s extractor (`signal-analyzer/workers/skill-inout-extractor/src/index.ts`)
  reads a single mounted log at `/workspace/logs/session.jsonl` (`index.ts:30`) and
  detects skills with a regex/heuristic prompt (`src/task-template.ts`). It misses
  skills not surfaced as text — exactly the gap the markers close.

Therefore hooks do **not** call the network live. They emit append-only signal records
**co-located with the transcript**, and ride drwn's existing export/upload path. Fast,
offline, non-blocking, conservative — faithful to drwn's write model.

### Decisions captured during brainstorming + review

| Decision | Choice |
|---|---|
| Target tools | Claude Code first; Codex later (per-target writer split) |
| Config layers carrying hooks | Cards + project config only |
| Materialization destination | Project-local `.claude/settings.json` (`cli/core/sync.ts:138-139`) |
| Hook logic location | `drwn hook <name>` subcommands (versioned/tested with drwn) |
| Signal transport | Co-located sidecar bundled by `drwn export` under a `signals/` namespace |
| Card-usage cadence | Write-on-change on `UserPromptSubmit` (first prompt + on switch) |
| Skill coverage | All skills: `Skill` tool (Pre/Post) **and** direct `/slash` (UserPromptExpansion) |
| Skill anchor | `tool_use_id` when present; `seq`+`ts` fallback (to confirm empirically) |
| `skill_result` payload | Pure flag (anchor + identity only; no result body) |
| Generic hook schema (MVP) | `type: "command"` only; documented event subset; forward-compatible |

## 3. Architecture

Four layers built here. The DHS/SA consumers are follow-up PRs in their own repos,
contract-bound by §5 and §9.

### Layer 1 — Generic hooks-in-cards mechanism

Mirror the MCP path end-to-end.

- **Types** (`cli/core/types.ts` + a new `cli/core/hooks.ts`):
  ```ts
  // MVP: command hooks only. Forward-compatible: unknown `type` values and unknown
  // keys are rejected with a clear error (no silent passthrough that could drift).
  type HookEvent =
    | "UserPromptSubmit" | "UserPromptExpansion"
    | "PreToolUse" | "PostToolUse"
    | "SessionStart" | "SessionEnd" | "Stop";   // extend as needed

  interface HookDefinition {
    event: HookEvent;
    matcher?: string;     // allowed on matcher-bearing events (PreToolUse, PostToolUse,
                          // UserPromptExpansion, SessionStart, …) — NOT only tool events
    type?: "command";     // MVP supports "command" only
    command: string;      // absolute path preferred (see Safety)
    args?: string[];      // exec form preferred over a single shell string
    timeout?: number;     // seconds
    description?: string;
  }
  ```
  > Claude's real hook surface is much larger (events like `UserPromptExpansion`,
  > `PostToolUseFailure`, `Notification`, `SubagentStop`, …; hook types `http`,
  > `mcp_tool`, `prompt`, `agent`; command options `async`, `asyncRewake`, `shell`).
  > This MVP deliberately models a **command-hook subset** and validates strictly so a
  > later schema expansion is additive, not a breaking migration.

  `CardManifest` (`cli/core/card-manifest.ts:7`) and `ProjectConfig`
  (`cli/core/types.ts:95`) each gain `hooks?: Record<string, HookDefinition>`.

- **Validation** (`cli/core/card-manifest.ts`): event ∈ allowed set; `matcher` only on
  matcher-bearing events; `type` is `command` (or omitted); `command` non-empty;
  reject unknown keys/types.

- **Merge** (`cli/core/card-project.ts:49`, `mergeCardManifestsIntoProjectConfig`):
  fold `hooks` like `servers`/`extensions`/`targets` — card defines, project overrides
  by id. (Today this function ignores hooks entirely.)

- **Effective state** (`cli/core/effective-state.ts`): expose merged `activeHooks`.

- **Renderer** (`cli/core/hooks.ts`): `renderClaudeHooks(defs)` groups by `event`, then
  `matcher`, into Claude's nested shape. The default card renders **all** of:
  ```json
  {
    "UserPromptSubmit":    [ { "hooks": [ { "type": "command", "command": "<drwn>", "args": ["hook","card-usage"] } ] } ],
    "UserPromptExpansion": [ { "matcher": "*", "hooks": [ { "type": "command", "command": "<drwn>", "args": ["hook","skill-marker","--phase","expansion"] } ] } ],
    "PreToolUse":          [ { "matcher": "Skill", "hooks": [ { "type": "command", "command": "<drwn>", "args": ["hook","skill-marker","--phase","pre"] } ] } ],
    "PostToolUse":         [ { "matcher": "Skill", "hooks": [ { "type": "command", "command": "<drwn>", "args": ["hook","skill-marker","--phase","post"] } ] } ]
  }
  ```
  `<drwn>` is an absolute path resolved at write/bootstrap (see Safety).

- **Writer** (`cli/core/mcp.ts` / a sibling `claude-settings.ts`): manage `hooks` as a
  second `_drwn` field alongside `mcpServers`, drift-guarded by `cli/core/managed-fields.ts`
  (`buildDrwnMetaBlock` already takes arbitrary field names). **First-adoption guard:**
  today `mcp.ts:78` defaults `managedKeys` to `["mcpServers"]`, so a pre-existing
  unmanaged `hooks` key has no recorded hash and would be overwritten silently. The
  writer must detect an existing `hooks` key with no `_drwn.hooks` hash and **refuse
  unless `--force`** (or an explicit adopt/import path), then thereafter manage it.

- **Sync wiring** (`cli/core/sync.ts:157-161`): in project scope, render+merge hooks
  into the Claude target and record a managed path with `fields: ["mcpServers","hooks"]`.

### Layer 2 — Hook logic as `drwn hook <name>` subcommands

Hidden subcommands registered in `cli/index.ts`, each reading Claude's hook JSON from
**stdin** (`session_id`, `transcript_path`, `cwd`, `hook_event_name`, event-specific
fields). Each emits a **positional flag (anchor), not the payload** — SA/DHS read the
transcript for actual content.

- **`drwn hook card-usage`** ← `UserPromptSubmit`. Resolves the nearest `card.lock` from
  `cwd`, appends a `card_usage` signal **write-on-change**: only when the active card set
  differs from the last `card_usage` line for the session (first prompt + on switch).
  - **Why `UserPromptSubmit` (not `SessionStart`):** the card set only changes via an
    explicit `drwn card add/remove/apply`; Claude has no "card.lock changed" event.
    `UserPromptSubmit` is the only event that both marks a user call and re-observes
    `card.lock`, so mid-session switches are caught on the next prompt. Cost is a small
    read + compare; writes are rare.

- **`drwn hook skill-marker`** ← `PreToolUse`/`PostToolUse` (matcher `Skill`) **and**
  `UserPromptExpansion` (direct `/slash` skills). Emits:
  - `skill_invocation` on PreToolUse (input anchor: `tool_input`),
  - `skill_result` on PostToolUse (output anchor; **pure flag**, no result body),
  - `skill_expansion` on UserPromptExpansion (slash skill; carries the expanded
    command/skill name).
  - **Anchor:** capture `tool_use_id` from the payload when present and use it as the
    primary correlation key (PostToolUse can then be matched to PreToolUse and to the
    transcript `tool_use`/`tool_result` deterministically). `seq` (a per-session counter)
    + `ts` is a **best-effort fallback only** — it is race-prone under parallel tool
    calls/subagents because drwn has no file locks or IPC
    (`.ai/knowledges/10_drwn-cli-architecture.md:32`), so it must not be the sole key.
  - **Open implementation check:** the current public hooks docs do not show
    `tool_use_id` in the PreToolUse input and the PostToolUse schema could not be
    confirmed; the implementer must **capture a real Pre/PostToolUse payload** to
    confirm `tool_use_id` availability and the result field name (`tool_response` vs
    `tool_output`) before finalizing the anchor.

### Layer 3 — Signal sink + transport

- **Sink path:** `${dirname(transcript_path)}/${session_id}.drwn-signals.jsonl`
  (co-located with the transcript). Fallback when `transcript_path` is absent uses the
  **same suffix** so discovery is uniform:
  `~/.agents/drwn/signals/${session_id}.drwn-signals.jsonl`.
- **Export discovery & bundling** (`cli/core/export/session-discovery.ts`,
  `cli/core/export/archiver.ts`):
  - `discoverClaudeSessions` walks every `.jsonl` and maps non-subagent files to
    `claude/<basename>` (`session-discovery.ts:91,150`). It must be changed to
    **exclude `*.drwn-signals.jsonl`** from the `claude/` mapping and re-add them under
    a `signals/` archive namespace; add a second discovery root for
    `~/.agents/drwn/signals/`.
  - `ALLOWED_PREFIXES` (`archiver.ts:9`) gains `signals/`.
- **DHS protection (required):** `signals/<id>.drwn-signals.jsonl` would otherwise be
  counted as a session log — `isSessionLogArchiveEntry` returns true for any `.jsonl`
  whose path has no dot-prefixed segment (`archive-entry.ts:1-9`), and the ingest gates
  can throw `too_many_session_logs` (`archive-ingest.ts:44-48`, `consumer.ts:114`). DHS
  must (a) **exclude `signals/` entries from session-log counting/parsing**, and (b)
  parse them separately. Until DHS ships that change, exporting signals would inflate
  the session-log count, so the rollout is **coordinated**: gate signal inclusion in the
  archive behind a flag (default off) until DHS handles `signals/`. (A dot-prefixed
  namespace would make legacy DHS ignore signals by default, but DHS still needs the
  read path, so an explicit DHS change is required either way.)

### Layer 4 — Default `session-signals` card

Author a `@curation-labs/session-signals` card whose manifest declares the card-usage
and skill-marker hooks, and add it to the default bootstrap/starter set so the hooks are
embedded by default (`darwinian:bootstrap-project`).

## 4. Data flow

```
User prompt ───────────────► UserPromptSubmit ──► drwn hook card-usage (reads card.lock)
/slash skill ──────────────► UserPromptExpansion ─► drwn hook skill-marker (expansion)
Skill tool (model-invoked) ─► PreToolUse:Skill ──► drwn hook skill-marker (pre)
                            └► PostToolUse:Skill ─► drwn hook skill-marker (post)
                                                       │
                              <session_id>.drwn-signals.jsonl  (append-only, co-located)
                                                       │
                     drwn export sessions  (excluded from claude/, bundled under signals/)
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
discriminator. Timestamps are ISO-8601 UTC. **Markers are flags, not payloads:** SA/DHS
extract actual input/output/outcome from the transcript, anchored by these flags.

```jsonc
// drwn hook card-usage (UserPromptSubmit) — write-on-change
{ "type": "card_usage", "session_id": "abc", "ts": "…", "cwd": "/proj",
  "cards": [ { "name": "@curation-labs/improve", "version": "1.2.3" } ] }

// drwn hook skill-marker (UserPromptExpansion) — direct /slash skill
{ "type": "skill_expansion", "session_id": "abc", "ts": "…",
  "command_name": "brainstorming", "skill": "superpowers:brainstorming" }

// drwn hook skill-marker (PreToolUse Skill) — INPUT anchor
{ "type": "skill_invocation", "session_id": "abc", "ts": "…",
  "skill": "superpowers:brainstorming", "tool_use_id": "toolu_…|null", "seq": 3,
  "source": "tool_use" }

// drwn hook skill-marker (PostToolUse Skill) — OUTPUT anchor (pure flag, no result body)
{ "type": "skill_result", "session_id": "abc", "ts": "…",
  "skill": "superpowers:brainstorming", "tool_use_id": "toolu_…|null", "seq": 3 }
```

- **DHS** keys on `session_id` + the distinct union of `cards` across the session's
  `card_usage` lines (emitted on-change, read as `ts` intervals) → session↔card mapping
  for filter/aggregate. **Required:** parse `signals/` entries separately and exclude
  them from the session-log count (`archive-entry.ts`, `archive-ingest.ts`,
  `consumer.ts`).
- **SA** uses the skill flags as **anchors**: prefer `tool_use_id` to locate the Skill
  `tool_use` (input) and `tool_result` (output) blocks deterministically; use
  `skill_expansion` for slash skills; fall back to `(skill, seq, ts)` only when
  `tool_use_id` is absent. **Required SA changes:** mount the sidecar into the sandbox
  (alongside `/workspace/logs/session.jsonl`, `index.ts:30`) and teach the extractor /
  `task-template.ts` to read the flags and the `tool_use`/`tool_result` blocks they
  anchor (it is regex/heuristic today and misses non-text skill triggers).

## 6. Error handling & robustness

- Both `drwn hook` subcommands **always exit 0**; errors swallowed best-effort; never
  block/abort the agent.
- Missing/malformed stdin or absent `transcript_path` → use the fallback sink or skip
  silently; never error.
- Local file I/O only; small `card.lock` read; write-on-change dedup; target < 50 ms.
- Single-line `O_APPEND` writes (one line < pipe-buf).

## 7. Safety

Command hooks run with full user permissions; the docs recommend absolute paths.

- Render the default hooks in **exec form** (`command` = absolute `drwn` path resolved
  at write/bootstrap, `args` = `["hook", …]`), not a single shell string.
- **Verify the `drwn` binary path** during `drwn write`/bootstrap; test the PATH-missing
  behavior (hook must no-op, not crash the agent).
- The generic mechanism prints every hook command in the `drwn write` changeset
  (`+ hook <id>: <event> → <command>`) and documents that hooks execute code.
- First-adoption guard (Layer 1) prevents clobbering user-authored hooks.
- A recorded-approval ledger for third-party card hooks is future work.

## 8. Testing

- **Unit:** renderer (model → Claude nested shape, all four events); manifest+project
  hook merge; manifest validation (events, matcher rules, unknown-key/type rejection);
  managed-fields drift on `hooks`; **first-adoption guard** (refuse on pre-existing
  unmanaged `hooks` without `--force`); the `drwn hook` subcommands via stdin fixtures
  (card-usage write-on-change + fallback; skill markers for pre/post/expansion;
  `tool_use_id` present vs absent → seq fallback).
- **Export:** sidecar **excluded** from `claude/` and **included** under `signals/`;
  fallback-root discovery; `archiver.ts` allowlist accepts `signals/` and still rejects
  others (extend `test/core-archiver.test.ts`); update `docs-docusaurus/.../export.md`.
- **Integration:** apply a card with hooks → `drwn write` → assert project
  `.claude/settings.json` `hooks` block + `_drwn` meta + idempotent re-write.
- **Schema/docs:** `CardManifest` type + `docs-docusaurus/docs/reference/schemas/card-manifest.md`
  gain `hooks`; covered by acceptance tests.

## 9. Scope boundaries

**In scope (this repo / PR):** generic hooks mechanism (types, validation, merge,
effective-state, renderer, Claude writer + adoption guard, sync wiring); the `drwn hook`
subcommands; the signal contract (§5); export exclusion-from-`claude/` + `signals/`
bundling; the default `session-signals` card + bootstrap; manifest schema + export docs.

**Out of scope (follow-up PRs, contract-bound):**
- **DHS:** exclude `signals/` from `isSessionLogArchiveEntry` counting
  (`backend/src/analysis/archive-entry.ts`) and parse them separately; session↔card
  storage + filter-by-card query/UI.
- **SA:** mount the sidecar into the sandbox and update the extractor
  (`workers/skill-inout-extractor/src/index.ts`, `src/task-template.ts`) to follow the
  flags (prefer `tool_use_id`) and read the Skill `tool_use`/`tool_result` blocks.
- **drwn:** Codex hooks writer; richer Claude hook schema (non-command types, async,
  more events); third-party hook approval ledger.

## 9a. Risks & mitigation

| Risk | Mitigation |
|---|---|
| Hook latency on the hot loop | Local file I/O only; fast `card.lock` read; write-on-change; target < 50 ms. |
| Hook failure blocks the agent | Always exit 0; errors swallowed. |
| First write clobbers user-authored `hooks` | Adoption guard: refuse on pre-existing unmanaged `hooks` without `--force` (`mcp.ts:78` defaults `managedKeys=["mcpServers"]`). |
| Sidecar exported as a Claude session log | Exclude `*.drwn-signals.jsonl` from `claude/` discovery; re-add under `signals/`. |
| Signals counted as DHS session logs → `too_many_session_logs` | Required DHS change to skip/parse `signals/` separately; gate archive inclusion behind a flag until DHS ships. |
| `tool_use_id` not in payload (unconfirmed) | Capture a real payload during implementation; `seq`+`ts` fallback; do not make `seq` the sole key. |
| `seq` races (no locks/IPC; parallel calls, subagents) | Prefer `tool_use_id`; treat `seq` as best-effort/debug; scope by `agent_id`/`agent_type` when present. |
| Result field name (`tool_response` vs `tool_output`) unknown | `skill_result` is a pure flag (stores neither), so naming is non-blocking; confirm if ever needed. |
| `drwn` not on PATH where the hook runs | Exec form with absolute path resolved at bootstrap; verify binary; no-op on miss. |

## 10. Open questions for review

1. Sidecar naming: `<session_id>.drwn-signals.jsonl` (chosen) — confirm there is no
   collision with any other `*.jsonl` consumer of the Claude projects dir.
2. Default-card scope/name (`@curation-labs/session-signals`) and which bootstrap tier
   includes it.
3. ~~Skill coverage~~ **Resolved:** cover all skills (add `UserPromptExpansion`).
4. ~~`skill_result` payload~~ **Resolved:** pure flag (anchor + identity only).
