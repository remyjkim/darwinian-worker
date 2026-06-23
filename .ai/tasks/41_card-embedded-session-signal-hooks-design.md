# Task 41: Card-Embedded Session-Signal Hooks (Design)

> **For Claude:** This is a DESIGN / SPEC document produced via `superpowers:brainstorming`.
> The implementation plan is a separate follow-up produced via `superpowers:writing-plans`.

**Status**: Design — awaiting review before planning
**Created**: 2026-06-23
**Updated**: 2026-06-23
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR (generic mechanism + 2 hooks + default card)
**Dependencies**:
- `curation-labs/darwinian-harness-services` (DHS) — session analysis, consumes the `card_usage` signal (follow-up PR)
- `curation-labs/signal-analyzer` (SA) — skill in/out/outcome extractor, consumes the `skill_invocation` signal (follow-up PR)
**References**: [.ai/knowledges/10_drwn-cli-architecture.md, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/sync.ts, cli/core/effective-state.ts, cli/core/card-manifest.ts, cli/core/card-project.ts, cli/core/types.ts, cli/core/extensions/types.ts, cli/core/extensions/registry.ts, cli/core/export/archiver.ts, cli/core/export/session-discovery.ts, cli/commands/export/sessions.ts, cli/commands/analyze/sessions.ts, registry/config.json]

---

## 1. Objective

Make Claude Code **hooks** a first-class, card-distributable artifact in `drwn`, then
ship two hooks — embedded in a default Harness Card — that emit append-only
**session signals** consumed by two downstream services:

1. **Card-usage tracking (for DHS session analysis).** On every user prompt, record
   which Harness Cards are active for the session, so session analysis can filter
   and aggregate sessions by card ("which sessions used card X").
2. **Skill-trigger marking (for SA skill extractor).** Whenever a skill is triggered —
   including model-invoked skills that are *not* expressed as `/skill-name` — emit a
   timestamped marker so the skill in/out/outcome extractor can anchor every skill
   invocation rather than relying on text regex.

Today "hooks" is a **declared-but-unimplemented** concept: `ExtensionMode` lists
`"hooks"` (`cli/core/extensions/types.ts:5`) and Beads/Parallel declare it in
`defaultModes` (`cli/core/extensions/registry.ts:12`), but nothing writes hooks
anywhere. The Claude writer manages only `mcpServers` (`cli/core/mcp.ts:75-97`).

---

## 2. Background — why this shape

Investigation of both services produced one unifying insight: **both consume the
Claude session transcript JSONL**, and `drwn` already owns the pipeline that ships
transcripts to the analyzer.

- `drwn export sessions` scans `~/.claude/projects/<slug>/*.jsonl` and bundles them
  into a tar restricted to `claude/` / `codex/` namespaces
  (`cli/core/export/archiver.ts:9`, `cli/core/export/session-discovery.ts:150`);
  `drwn analyze sessions` uploads that archive to the analyzer
  (`DRWN_ANALYZER_URL` → DHS `/api/analyze`).
- **DHS** parses `event.sessionId` per JSONL line
  (`backend/src/analysis/parse-jsonl.ts:76`) and stores `sessions` rows. It has
  **no** per-session card storage today (`backend/src/db/schema.ts` `sessions`).
- **SA** detects skills via **text regex only**
  (`workers/skill-inout-extractor/src/log-digest.ts:17-20`) and ignores `tool_use`
  block names, so model-invoked (non-`/slash`) skills are invisible to it.

Therefore hooks do **not** need to call the network live. They emit append-only
signal records **co-located with the transcript**, and ride drwn's existing
export/upload path. This keeps hooks fast, offline, non-blocking, and conservative —
faithful to drwn's write model.

### Decisions captured during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Target tools | Claude Code first; Codex later | Mirrors the per-target MCP writer split; Codex hooks are a later writer. |
| Config layers carrying hooks | **Cards + project config only** | Matches "cards are the unit of distribution"; no packaged-registry or machine-default hooks. |
| Materialization destination | **Project-local `.claude/settings.json`** | Hooks are project-scoped; must not leak across repos. Project write scope already targets this file (`cli/core/sync.ts:138-139`). |
| Hook logic location | **`drwn hook <name>` subcommands**, not shipped scripts | Versioned/tested with drwn; no script-path or permission issues; cards stay thin manifests. |
| Signal transport | **Co-located sidecar bundled by `drwn export`** | Offline, non-blocking; reuses the existing analyzer upload path. |
| Card-hook safety (generic) | Show-and-warn in the write changeset | Default card runs drwn's own code (low risk); approval ledger deferred. |

---

## 3. Architecture

Four layers. Layers 1–4 are built here; the DHS/SA consumers are follow-up PRs in
their own repos, contract-bound by §5.

### Layer 1 — Generic hooks-in-cards mechanism

Mirror the MCP path end-to-end.

- **Types** (`cli/core/types.ts` + a new `cli/core/hooks.ts`):
  ```ts
  type HookEvent =
    | "PreToolUse" | "PostToolUse" | "UserPromptSubmit"
    | "SessionStart" | "SessionEnd" | "Stop" | "SubagentStop"
    | "Notification" | "PreCompact";

  interface HookDefinition {
    event: HookEvent;
    matcher?: string;     // tool-name pattern; only valid for PreToolUse/PostToolUse
    command: string;      // shell command to run
    timeout?: number;     // optional, seconds
    description?: string;
  }
  ```
  `CardManifest` (`cli/core/card-manifest.ts:7-22`) and `ProjectConfig`
  (`cli/core/types.ts:95-105`) each gain `hooks?: Record<string, HookDefinition>`
  (keyed by a stable id).

- **Validation** (`cli/core/card-manifest.ts`): event name is in the allowed set;
  `matcher` only present on tool events; `command` non-empty. Same assertion path
  used by card-store / card-lock / card-source.

- **Merge** (`cli/core/card-project.ts` `mergeCardManifestsIntoProjectConfig`):
  fold `hooks` exactly like `servers`/`extensions`/`targets` — card manifests define,
  project config overrides by id (project wins).

- **Effective state** (`cli/core/effective-state.ts`): expose the merged
  `activeHooks` alongside `activeServers`.

- **Renderer** (`cli/core/hooks.ts`): `renderClaudeHooks(defs)` groups drwn hooks
  by `event`, then by `matcher`, into Claude's nested settings shape:
  ```json
  {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "drwn hook card-usage" } ] }
    ],
    "PreToolUse": [
      { "matcher": "Skill",
        "hooks": [ { "type": "command", "command": "drwn hook skill-marker" } ] }
    ]
  }
  ```

- **Writer** (`cli/core/mcp.ts` or a sibling `claude-settings.ts`): extend the
  Claude settings merge to manage **`hooks` as a second `_drwn` field** alongside
  `mcpServers`, drift-guarded by the existing managed-fields machinery
  (`cli/core/managed-fields.ts` already accepts arbitrary field names via
  `buildDrwnMetaBlock(fields, values)` / `detectManagedFieldDrift`). drwn owns the
  whole `hooks` key; user hand-edits must move into `config.json` or be overwritten
  with `--force` — identical contract to `mcpServers` today.

- **Sync wiring** (`cli/core/sync.ts:157-161`): when writing the Claude target in
  project scope, also render+merge hooks and push a managed path carrying
  `fields: ["mcpServers", "hooks"]`.

### Layer 2 — Hook logic as `drwn hook <name>` subcommands

Hidden subcommands registered in `cli/index.ts`, each reading Claude's hook JSON
from **stdin** (`session_id`, `transcript_path`, `cwd`, `hook_event_name`, and
event-specific fields):

- **`drwn hook card-usage`** ← `UserPromptSubmit`. Resolves the nearest
  `.agents/drwn/card.lock` from `cwd`, reads locked card `name`+`version`, appends a
  `card_usage` signal. **Write-on-change cadence (not every turn):** the hook fires on
  every prompt but appends a line only when the active card set differs from the last
  `card_usage` line for the session. Concretely:
  - First prompt of a session → one line (the initial set).
  - User switches cards mid-session (`drwn card add/remove/apply` mutates
    `card.lock`) → the next prompt sees a changed set → **a new line is appended**.
  - Prompts with no change → no duplicate line.

  Because every line carries `ts`, consumers read the stream as **intervals**: set `S`
  is active from `ts₁` until the next `card_usage` line at `ts₂`. This captures
  mid-session card switches while keeping the sidecar small, and lets DHS attribute
  any turn to a card set by checking which interval its timestamp falls in.
- **`drwn hook skill-marker`** ← `PreToolUse` matcher `Skill`. Reads
  `tool_input.skill`, appends a `skill_invocation` signal with a timestamp. Captures
  every Skill-tool trigger including non-`/slash`, model-invoked ones.

### Layer 3 — Signal sink + transport

- **Sink path:** `${dirname(transcript_path)}/${session_id}.drwn-signals.jsonl`
  (co-located with the transcript). Fallback when `transcript_path` is absent:
  `~/.agents/drwn/signals/<session_id>.jsonl`.
- **Bundling:** extend `drwn export sessions` to discover and include
  `*.drwn-signals.jsonl` under a new `signals/` archive namespace (add to
  `ALLOWED_PREFIXES` in `cli/core/export/archiver.ts:9` and to discovery in
  `cli/core/export/session-discovery.ts`). Keeping signals in their own namespace
  prevents the per-line JSONL session parsers from mistaking them for session events.

### Layer 4 — Default `session-signals` card

Author a `@curation-labs/session-signals` card whose manifest declares both hooks,
and add it to the default bootstrap/starter set so the hooks are embedded by default
(see `darwinian:bootstrap-project`).

---

## 4. Data flow

```
User prompt ─────────────► UserPromptSubmit hook ─► drwn hook card-usage
                                                       │ reads card.lock
                                                       ▼
Skill triggered ─────────► PreToolUse:Skill hook ─► drwn hook skill-marker
                                                       │
                                                       ▼
                         <session_id>.drwn-signals.jsonl  (append-only, co-located)
                                                       │
                              drwn export sessions  (signals/ namespace)
                                                       │
                              drwn analyze sessions ─► DRWN_ANALYZER_URL
                                                       │
                         ┌─────────────────────────────┴───────────────────────┐
                         ▼                                                       ▼
                 DHS session analysis                                  SA skill extractor
        (card_usage → session↔card mapping)              (skill_invocation → anchor skills)
```

---

## 5. Signal contract (stable; consumed by DHS and SA)

Each line in `<session_id>.drwn-signals.jsonl` is one JSON object with a `type`
discriminator. All timestamps are ISO-8601 UTC.

```jsonc
// Emitted by `drwn hook card-usage` (UserPromptSubmit)
{
  "type": "card_usage",
  "session_id": "abc123",
  "ts": "2026-06-23T14:30:45.123Z",
  "cwd": "/path/to/project",
  "cards": [ { "name": "@curation-labs/improve", "version": "1.2.3" } ]
}

// Emitted by `drwn hook skill-marker` (PreToolUse matcher Skill)
{
  "type": "skill_invocation",
  "session_id": "abc123",
  "ts": "2026-06-23T14:31:02.880Z",
  "skill": "superpowers:brainstorming",
  "source": "tool_use"
}
```

- **DHS** keys on `session_id` (matching `event.sessionId` it already parses) and the
  distinct union of `cards` across the session's `card_usage` lines to populate a
  session↔card mapping, enabling "filter sessions by card" and per-card aggregation.
  Card-usage lines are emitted **on change only** (see Layer 2), so a session with a
  stable card set has exactly one line, and a mid-session switch adds one line per
  change; DHS treats consecutive lines as time intervals via `ts`.
- **SA** keys on `session_id` + `ts` (+ optional `skill`) to anchor skill windows in
  the transcript, closing the non-`/slash` detection gap in its log digest.

---

## 6. Error handling & robustness

Hooks run on every prompt and every skill call, so they must never block or fail the
agent.

- Both `drwn hook` subcommands **always exit 0**, even on internal error
  (best-effort; failures swallowed, optional debug line under `~/.agents/drwn/`).
- Missing/malformed stdin or absent `transcript_path` → fall back sink or skip
  silently; never error.
- `card-usage` dedup keeps the sidecar small despite firing on every prompt.
- Single-line `O_APPEND` writes (one line < pipe-buf); fast path (small `card.lock`
  read); target < 50 ms.

---

## 7. Safety

The default card's hook command is `drwn hook …` (drwn's own audited code), so the
risk is low. The **generic** mechanism still surfaces every hook command in the
`drwn write` changeset (`+ hook <id>: <event> → <command>`) and documents that hooks
execute code. A recorded-approval ledger for third-party card hooks is a future
enhancement, explicitly out of scope here.

---

## 8. Testing

- **Unit:** hooks renderer (drwn model → Claude nested shape); manifest+project hook
  merge; manifest validation (event names, matcher-only-on-tool-events, non-empty
  command); managed-fields drift on the `hooks` key; both `drwn hook` subcommands via
  stdin fixtures → asserted signal lines (including card-usage dedup and the
  transcript-absent fallback); export bundling of the `signals/` namespace.
- **Integration:** apply a card carrying hooks → `drwn write` → assert the project
  `.claude/settings.json` `hooks` block + `_drwn` meta and idempotent re-write;
  round-trip a sidecar through the export archive under `signals/`.

---

## 9. Scope boundaries

**In scope (this repo / this PR):**
- Generic hooks-in-cards mechanism (types, validation, merge, effective-state,
  renderer, Claude writer, sync wiring).
- The two `drwn hook` subcommands.
- The signal contract (§5).
- `drwn export sessions` bundling of the `signals/` namespace.
- The default `@curation-labs/session-signals` card + bootstrap inclusion.
- Docs: card manifest `hooks` reference + safety note.

**Out of scope (specified here for follow-up PRs in the other repos):**
- **DHS:** session↔card storage + "filter by card" query/UI, reading `card_usage`
  from the `signals/` namespace.
- **SA:** extractor change to read `skill_invocation` markers and anchor skills.
- **drwn:** Codex hooks writer (later; the renderer/types are designed to extend).
- A recorded-approval trust ledger for third-party card hooks.

---

## 10. Open questions for review

1. Sidecar naming: `<session_id>.drwn-signals.jsonl` vs a `signals/` subdir under the
   Claude projects dir — confirm the discovery/export approach during planning.
2. ~~Card-usage cadence~~ **Resolved:** write-on-change on `UserPromptSubmit` (a line
   on the first prompt, then only when the active card set changes). `UserPromptSubmit`
   alone is sufficient — no separate `SessionStart` emission needed.
3. Default-card scope/name (`@curation-labs/session-signals`) and which bootstrap
   tier includes it.
