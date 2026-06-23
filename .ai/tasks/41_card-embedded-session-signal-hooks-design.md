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
**Estimated Effort**: 1 PR, but sliced into reviewable internal tasks/commits (schema+merge,
effective-state+writer ownership, hook subcommands, export/analyze flags, docs) — it
spans schema, card merge, effective state, a Claude-settings writer rename, new hidden
commands, hot-path I/O, export/analyze plumbing, and cross-repo contracts.
**Dependencies**:
- `curation-labs/darwinian-harness-services` (DHS) — consumes `card_usage`; must handle `signals/` (follow-up PR)
- `curation-labs/signal-analyzer` (SA) — consumes skill signals; classifies slash skills (follow-up PR)
**References**: [.ai/knowledges/10_drwn-cli-architecture.md, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/sync.ts, cli/core/effective-state.ts, cli/core/project.ts, cli/core/card-manifest.ts, cli/core/card-project.ts, cli/core/types.ts, cli/core/extensions/registry.ts, cli/core/export/archiver.ts, cli/core/export/session-discovery.ts, cli/core/analyze/inline-export.ts, cli/commands/init.ts, cli/commands/export/sessions.ts, cli/commands/analyze/sessions.ts, cli/index.ts, registry/config.json, docs-docusaurus/docs/concepts/materialization.md, docs-docusaurus/docs/reference/schemas/card-manifest.md, docs-docusaurus/docs/reference/schemas/write-record-json.md, docs-docusaurus/docs/reference/cli/export.md, docs-docusaurus/docs/reference/cli/analyze.md, docs-docusaurus/docs/reference/cli/write.md, test/core-archiver.test.ts, https://code.claude.com/docs/en/hooks]

---

## 1. Objective

Make Claude Code **hooks** a first-class artifact in `drwn` (declarable in card
manifests + project config, materialized into `.claude/settings.json`), and ship hook
subcommands that emit append-only **session signals** consumed by two downstream
services:

1. **Card-usage tracking (DHS session analysis).** On every user prompt, record which
   Harness Cards are active, so analysis can filter/aggregate sessions by card.
2. **Skill-trigger marking (SA skill extractor).** Anchor **every skill invocation**:
   model/tool-invoked skills (the `Skill` tool — success and failure) **and** direct
   `/slash-command` skills (slash-command expansion, emitted raw for SA to classify).

Today "hooks" is declared-but-unimplemented: `ExtensionMode` lists `"hooks"`
(`cli/core/extensions/types.ts:5`) and only **Beads** declares it
(`cli/core/extensions/registry.ts:12`). Nothing writes hooks; the Claude writer manages
only `mcpServers` (`cli/core/mcp.ts:75-97`).

**Scope note:** this task delivers the hook *mechanism* + hook subcommands + signal
contract. **Packaging into a default card and bootstrap auto-apply is OUT OF SCOPE** (§9)
— `drwn init` only scaffolds config + registers the catalog (`cli/commands/init.ts:74,98`).

## 1a. Success criteria

- [ ] A card manifest and project config can declare `hooks`; `drwn write` materializes
      them into project-local `.claude/settings.json` `hooks`, drift-guarded like
      `mcpServers`, with a first-adoption guard (refuse pre-existing unmanaged `hooks`
      unless `--force`; `--force` **replaces** + records the `_drwn.hooks` hash).
- [ ] `drwn hook card-usage` (UserPromptSubmit) appends `card_usage` write-on-change.
- [ ] `drwn hook skill-marker` anchors: `skill_invocation` (PreToolUse `Skill`),
      `skill_result` (PostToolUse `Skill`), `skill_failure` (PostToolUseFailure `Skill`),
      and raw `slash_expansion` (UserPromptExpansion) for direct `/slash` skills.
- [ ] Tool markers carry `tool_use_id` (hard contract); `slash_expansion` carries
      `command_name`/`command_source`/`command_args` (no drwn-derived `skill`). All
      records carry `transcript_basename` (+ `agent_id`/`agent_type` when present).
- [ ] Rendered hooks point at a drwn-written **wrapper** in `.claude/hooks/` (always
      present), carry an explicit low `timeout`, and the subcommands emit **no
      stdout/stderr** on success or swallowed failure.
- [ ] `--include-signals` (default off) on **both** `drwn export sessions` and
      `drwn analyze sessions` (incl. `--fresh` inline export) excludes
      `*.drwn-signals.jsonl` from `claude/` and bundles them collision-proof under
      `signals/`; gated off until DHS handles `signals/`.
- [ ] Signal lines conform to §5 and are consumable by DHS and SA per §9.
- [ ] Unit + integration tests (§8) pass; manifest + materialization + write-record +
      export + analyze + write docs updated.

## 2. Background — why this shape

Both services consume the Claude session transcript JSONL, and `drwn` already ships
transcripts to the analyzer.

- `drwn export sessions` scans `~/.claude/projects/<slug>/*.jsonl` and bundles into a tar
  restricted to `claude/`/`codex/` (`archiver.ts:9,54`); it **rejects hidden dotfiles**
  (`archiver.ts:50`, so "hide signals via a leading dot" is impossible) and validates the
  member count == files.length (`validateArchiveMembers(expectedCount)`, `archiver.ts:32,57`).
  The `--fresh` analyze path reuses the same discovery + archiver (`inline-export.ts:6-14`).
- **DHS** counts any non-hidden `.jsonl` as a session log (`archive-entry.ts:1-9`) at both
  ingest paths and can throw `too_many_session_logs` (`archive-ingest.ts:43-48`,
  `consumer.ts:114`). No per-session card storage today.
- **SA**'s extractor (`workers/skill-inout-extractor/src/index.ts`) reads one mounted log
  `/workspace/logs/session.jsonl` (`index.ts:30,67`); detection is regex/heuristic
  (`src/task-template.ts`). No `log-digest.ts`.

So hooks emit append-only records co-located with the transcript and ride the existing
export/upload path.

### Decisions

| Topic | Decision |
|---|---|
| Target tools | Claude Code first; Codex later |
| Config layers | Cards + project config only |
| Destination | Project-local `.claude/settings.json` (`sync.ts:138-139`) |
| Hook logic | `drwn hook <name>` subcommands, invoked via a drwn-written wrapper |
| Transport | Co-located sidecar; `signals/` behind `--include-signals` (default off) |
| Card-usage cadence | Write-on-change on `UserPromptSubmit` |
| Skill coverage | `Skill` tool Pre/Post/**Failure** + raw `/slash` (UserPromptExpansion) |
| Slash classification | Emit raw `slash_expansion`; **SA classifies** (no drwn skill map) |
| Tool-marker anchor | `tool_use_id` (hard contract); no `seq` |
| `skill_result` payload | Pure flag (identifiers only) |
| First-adoption `--force` | Replace + take ownership |
| Generic schema (MVP) | `type:"command"` only; strictness scoped to `hooks.<id>` |
| Default card + bootstrap | Out of scope (deferred) |

## 3. Architecture

Three layers built here (Layer 4 deferred).

### Layer 1 — Generic hooks-in-cards mechanism

- **Types** (`cli/core/types.ts` + new `cli/core/hooks.ts`):
  ```ts
  type HookEvent =
    | "UserPromptSubmit" | "UserPromptExpansion"
    | "PreToolUse" | "PostToolUse" | "PostToolUseFailure"
    | "SessionStart" | "SessionEnd" | "Stop";

  interface HookDefinition {
    event: HookEvent;
    matcher?: string;     // see matcher table below
    type?: "command";     // MVP: command only
    command: string;      // wrapper path (see §7)
    args?: string[];
    timeout?: number;     // seconds; default low (e.g. 5)
    description?: string;
  }
  ```
  **Matcher support (encoded, not “…”)** — Claude silently ignores unsupported matchers,
  so validation must reject a `matcher` on non-matcher events:
  | Event | matcher |
  |---|---|
  | PreToolUse / PostToolUse / PostToolUseFailure | yes (tool name) |
  | UserPromptExpansion | yes (command name) |
  | SessionStart | yes (source) · SessionEnd | yes (reason) |
  | UserPromptSubmit / Stop | **no** |

  `CardManifest` (`card-manifest.ts:7`) and `ProjectConfig` (`types.ts:95`) gain
  `hooks?: Record<string, HookDefinition>`.

- **Validation** (`card-manifest.ts`): strictness is **scoped to each `hooks.<id>`** —
  event ∈ set; matcher only on matcher-bearing events; `type` ∈ {command, undefined};
  non-empty `command`; reject unknown keys *within a hook def*. `validateCardManifest`
  stays permissive about other unknown top-level keys (`card-manifest.ts:50`).

- **Data path (must be expanded — today it dead-ends):**
  - `mergeProjectConfig` returns only `{config, registry, skills, extensions}`
    (`project.ts:86`) → add `hooks` (from `projectConfigWithCards`).
  - `mergeCardManifestsIntoProjectConfig` (`card-project.ts:49`) folds `hooks` like
    `servers`/`extensions` (card defines; project overrides by id).
  - `EffectiveState` (`effective-state.ts:27`) gains `activeHooks` (derive from
    `projectConfigWithCards`).
  - `syncMcp` takes only `servers` (`sync.ts:126`) → pass `activeHooks` into a renamed
    Claude-settings writer.

- **Renderer** (`cli/core/hooks.ts`): `renderClaudeHooks(defs)` → Claude's nested shape;
  `command` is the wrapper path, with an explicit `timeout`. Example hooks (tests only;
  default-card packaging deferred):
  ```json
  {
    "UserPromptSubmit":    [ { "hooks": [ { "type":"command", "command":".claude/hooks/drwn-hook", "args":["card-usage"], "timeout":5 } ] } ],
    "UserPromptExpansion": [ { "hooks": [ { "type":"command", "command":".claude/hooks/drwn-hook", "args":["skill-marker","--phase","expansion"], "timeout":5 } ] } ],
    "PreToolUse":          [ { "matcher":"Skill", "hooks":[ { "type":"command", "command":".claude/hooks/drwn-hook", "args":["skill-marker","--phase","pre"], "timeout":5 } ] } ],
    "PostToolUse":         [ { "matcher":"Skill", "hooks":[ { "type":"command", "command":".claude/hooks/drwn-hook", "args":["skill-marker","--phase","post"], "timeout":5 } ] } ],
    "PostToolUseFailure":  [ { "matcher":"Skill", "hooks":[ { "type":"command", "command":".claude/hooks/drwn-hook", "args":["skill-marker","--phase","fail"], "timeout":5 } ] } ]
  }
  ```

- **Writer** (rename `cli/core/mcp.ts` Claude path → `claude-settings.ts`): manage `hooks`
  as a second `_drwn` field alongside `mcpServers` via `managed-fields.ts`.
  **First-adoption guard:** `mcp.ts:78` defaults `managedKeys` to `["mcpServers"]`, so a
  pre-existing unmanaged `hooks` key has no recorded hash and would be overwritten
  silently → detect that case and **refuse unless `--force`**; `--force` replaces and
  records the hash (a future `--adopt` import is out of scope).

- **Sync wiring** (`sync.ts:157-161`): in project scope render+merge hooks, write the
  wrapper (below), record managed paths `fields: ["mcpServers","hooks"]` + `.claude/hooks/drwn-hook`.

### Layer 2 — Hook logic as `drwn hook <name>` subcommands

Hidden subcommands in `cli/index.ts`, reading Claude's hook JSON from **stdin**. Each
emits a **positional flag (identifiers only, not payloads)**. All records carry
`transcript_basename` (basename of `transcript_path`) and `agent_id`/`agent_type` when
present, so SA can pick the right transcript (subagents/multi-log archives).

- **`drwn hook card-usage`** ← `UserPromptSubmit`. Resolve the active card set:
  nearest `card.lock` from `cwd`; **if no lock**, fall back to `.agents/drwn/config.json`
  `cards`; **if neither**, skip silently (emit nothing). Append `card_usage`
  **write-on-change**: only when the set differs from the **last `card_usage` line** for
  the session (must scan for the last `card_usage` record, not the last line — the sidecar
  interleaves skill records).
  - *Why `UserPromptSubmit` not `SessionStart`:* card set changes only via
    `drwn card add/remove/apply`; no "lock changed" event; `UserPromptSubmit` re-observes
    `card.lock` and catches mid-session switches.

- **`drwn hook skill-marker`** ← `PreToolUse`/`PostToolUse`/`PostToolUseFailure`
  (matcher `Skill`) and `UserPromptExpansion`:
  - `skill_invocation` (PreToolUse): `skill` (from `tool_input`), `tool_use_id`, `tool_name`.
  - `skill_result` (PostToolUse): `tool_use_id` (pure flag).
  - `skill_failure` (PostToolUseFailure): `tool_use_id`.
  - `slash_expansion` (UserPromptExpansion): **raw** — `command_name`, `command_source`,
    `command_args` (no drwn-derived `skill`). Claude's `expansion_type` is `slash_command`
    for both skills and custom commands and `command_source` is e.g. `plugin`/`user`, so
    drwn does **not** classify; **SA** decides which are skills.
  - **Anchor (hard contract):** `tool_use_id` for tool markers (Pre/Post/Failure share it,
    correlating to transcript `tool_use`/`tool_result`). No `seq`. `slash_expansion` has no
    `tool_use_id`; it correlates via `session_id` + `transcript_basename` + `command_name`.
  - **Fixtures (required before shipping):** capture real payloads to confirm the built-in
    `Skill` `tool_name`/`tool_input` shape, the PostToolUseFailure shape, and the
    UserPromptExpansion fields (`expansion_type`/`command_source`/`command_name`/`command_args`).

### Layer 3 — Signal sink + transport

- **Sink path:** `${dirname(transcript_path)}/${session_id}.drwn-signals.jsonl`. Fallback
  when `transcript_path` is absent **or the store/dir is unwritable**:
  `~/.agents/drwn/signals/${session_id}.drwn-signals.jsonl` — and if that store path is
  read-only/unwritable (per `store-paths` read-only rules,
  `.ai/knowledges/10_drwn-cli-architecture.md:27`), **skip silently**.
- **`--include-signals` plumbing (default off):**
  - Add `--include-signals` to `ExportSessionsCommand` (today only `--dry-run/--out/--gzip`,
    `export/sessions.ts:31-39`) **and** `AnalyzeSessionsCommand`; thread an `includeSignals`
    option into `runInlineExport` (today no options, `inline-export.ts:26`) and the
    discovery/archive helpers. `--dry-run` prints the signal files that would be added under
    `signals/` (and notes the DHS requirement).
- **Discovery & exclusion:** `discoverClaudeSessions` (maps `.jsonl`→`claude/<basename>`,
  `session-discovery.ts:91,150`) must **exclude `*.drwn-signals.jsonl`** from `claude/`
  always. Under `--include-signals`, a separate signal discovery returns them.
- **Collision-proof archive layout:** signal sidecars can share a basename across main /
  `agents/` / worktrees. Archive each as
  `signals/<sha8(abs dirname of source)>/<session_id>.drwn-signals.jsonl` (dir-digest
  prefix guarantees uniqueness). `ALLOWED_PREFIXES` gains `signals/` (`archiver.ts:9`);
  **`validateArchiveMembers` expected count must include signals when on, exclude when off**
  (`archiver.ts:32,57`).
- **DHS protection (gates rollout):** `signals/*.jsonl` would be counted as session logs
  (`archive-entry.ts:1-9`) → `too_many_session_logs`. DHS must exclude `signals/` from
  counting and parse separately. Until then `--include-signals` stays off. **Compatibility
  gap:** a user passing `drwn analyze sessions --archive some.tar.gz` that already contains
  `signals/*.jsonl` would still hit the old DHS gate — document that manually supplied
  archives with `signals/` require the DHS follow-up.

### Layer 4 — Default card + bootstrap delivery (DEFERRED / OUT OF SCOPE)

Packaging into `@curation-labs/session-signals` and choosing delivery (packaged default vs
catalog vs new init/apply) is deferred; `drwn init` does not apply cards today
(`init.ts:74,98`).

## 4. Data flow

```
User prompt ─────────────► UserPromptSubmit ─────► wrapper → drwn hook card-usage (card.lock|config.cards)
/slash skill ────────────► UserPromptExpansion ──► wrapper → drwn hook skill-marker (raw slash_expansion)
Skill tool (model) ──────► PreToolUse:Skill ─────► wrapper → drwn hook skill-marker (pre)
                         ├► PostToolUse:Skill ────► wrapper → drwn hook skill-marker (post)
                         └► PostToolUseFailure ───► wrapper → drwn hook skill-marker (fail)
                                                       │
                            <session_id>.drwn-signals.jsonl  (append-only, co-located)
                                                       │
                 export / analyze --fresh  (excluded from claude/; signals/<dir-hash>/ behind --include-signals)
                                                       │
                          drwn analyze sessions ─► DRWN_ANALYZER_URL
                                                       │
                  ┌─────────────────────────────────────┴───────────────────────────┐
                  ▼                                                                   ▼
          DHS (parse signals/ separately;                              SA (mount sidecar; tool_use_id anchors;
           card_usage → session↔card)                                  classify slash_expansion itself)
```

## 5. Signal contract (stable; consumed by DHS and SA)

One JSON object per line; `type` discriminator; ISO-8601 UTC `ts`. Markers are flags
(identifiers only), not payloads. `tool_use_id` is required for tool markers only.

```jsonc
// card-usage (UserPromptSubmit) — write-on-change
{ "type":"card_usage", "session_id":"abc", "ts":"…", "cwd":"/proj",
  "transcript_basename":"<file>.jsonl", "agent_id":"…?", "agent_type":"…?",
  "cards":[ { "name":"@curation-labs/improve", "version":"1.2.3" } ] }

// slash_expansion (UserPromptExpansion) — RAW; SA classifies (no drwn `skill`)
{ "type":"slash_expansion", "session_id":"abc", "ts":"…", "transcript_basename":"<file>.jsonl",
  "command_name":"brainstorming", "command_source":"plugin", "command_args":"…",
  "agent_id":"…?", "agent_type":"…?" }

// skill_invocation (PreToolUse Skill) — input anchor
{ "type":"skill_invocation", "session_id":"abc", "ts":"…", "transcript_basename":"<file>.jsonl",
  "skill":"superpowers:brainstorming", "tool_use_id":"toolu_…", "tool_name":"Skill",
  "agent_id":"…?", "agent_type":"…?" }

// skill_result (PostToolUse Skill) — output anchor (pure flag)
{ "type":"skill_result", "session_id":"abc", "ts":"…", "transcript_basename":"<file>.jsonl",
  "tool_use_id":"toolu_…" }

// skill_failure (PostToolUseFailure Skill) — failed-run anchor
{ "type":"skill_failure", "session_id":"abc", "ts":"…", "transcript_basename":"<file>.jsonl",
  "tool_use_id":"toolu_…" }
```

- **DHS** keys on `session_id` + distinct `cards` union (read as `ts` intervals) →
  session↔card mapping. **Required:** exclude `signals/` from session-log counting and
  parse separately (`archive-entry.ts`, `archive-ingest.ts`, `consumer.ts`).
- **SA** picks the transcript by `session_id` + `transcript_basename` (+ `agent_id` for
  subagents); uses `tool_use_id` to locate `tool_use`/`tool_result`; classifies
  `slash_expansion` itself via `command_name`/`command_source`. **Required SA changes:**
  mount the sidecar at `/workspace/logs/session.drwn-signals.jsonl` alongside
  `/workspace/logs/session.jsonl` (`index.ts:30,67`); update the extractor /
  `task-template.ts` to read the flags + anchored blocks.

## 6. Error handling & robustness

- Subcommands **always exit 0**; errors swallowed; never block the agent.
- **Silence contract:** no stdout/stderr on success or swallowed failure. The hidden hook
  commands must bypass pre-dispatch noise — `cli/index.ts:199-206` runs `validateRepoRoot`
  and writes errors/legacy warnings to stderr before dispatch; the **wrapper sets the
  required env** (e.g. `AGENTS_REPO_ROOT`) and redirects stderr so validation can't print,
  and the hook path itself avoids store/legacy checks. Diagnostics go only to a
  **size-capped** debug file under `~/.agents/drwn/` (skip if the store is read-only).
- Missing/malformed stdin or absent `transcript_path` → fallback sink or skip.
- Local file I/O only; small `card.lock` read; write-on-change dedup; target < 50 ms;
  single-line `O_APPEND`. Explicit low hook `timeout` (≈5 s) bounds a hung process
  (Claude's default is 30 s for UserPromptSubmit, ~600 s for command hooks).

## 7. Safety & command resolution

Command hooks run with full user permissions.

- **Wrapper script:** `drwn write` writes a managed, executable wrapper at
  `<project>/.claude/hooks/drwn-hook`. Rendered hooks point at the wrapper (always present,
  so Claude never fails to spawn). The wrapper: checks the recorded `drwn` invocation
  exists → if missing, `exit 0` silently (this is why the no-op guarantee needs a wrapper —
  pointing `command` straight at a missing binary fails at Claude's spawn, before drwn
  runs); sets env to silence pre-dispatch; `exec`s the resolved invocation.
- **`<drwn>` resolution cases** (recorded into the wrapper at `drwn write`; re-resolved and
  rewritten on the next `write` if it moved):
  | Install | Rendered invocation |
  |---|---|
  | Packaged binary | absolute path to the `drwn` executable |
  | npm shim | absolute path to the npm bin shim |
  | Homebrew shim | absolute path to the brew bin shim |
  | Dev checkout | `bun <repo>/cli/index.ts` (since `process.execPath` is the Bun runtime, not `drwn`) |
  POSIX `sh` wrapper for macOS/Linux; Windows (`.ps1`) is future work.
- Verify the invocation at `drwn write`; test PATH-missing / moved-binary / hung-hook.
- The changeset prints every hook command (`+ hook <id>: <event> → <command>`); docs note
  hooks execute code. First-adoption guard prevents clobbering user hooks; `--force` = replace.

## 8. Testing

- **Unit:** renderer (all five events + timeout + wrapper path); merge of `hooks`;
  hook-scoped validation (events, matcher table, unknown-key rejection inside `hooks.<id>`
  only); managed-fields drift on `hooks`; **first-adoption guard** (refuse w/o `--force`;
  `--force` replaces + records hash); subcommands via stdin fixtures — card-usage
  write-on-change finding the **last `card_usage` line in a mixed sidecar**, no-lock
  fallback to `config.cards` then skip; `skill_invocation`/`result`/`failure` carry
  `tool_use_id`; raw `slash_expansion` (non-skill `/foo` still emitted raw, not classified);
  `transcript_basename` + `agent_id`/`agent_type` propagation; **silence contract** (no
  stdout/stderr, incl. pre-dispatch); **debug-file size cap/rotation** + malformed/large
  stdin; read-only-store skip.
- **Export + analyze:** sidecar excluded from `claude/` in `export sessions` and
  `analyze sessions --fresh`; `--include-signals` adds them under `signals/<dir-hash>/`;
  collision case (same basename in `agents/` + main) stays distinct; `validateArchiveMembers`
  expected count includes signals when on, excludes when off (`test/core-archiver.test.ts`).
- **Integration:** apply a card with hooks → `drwn write` → assert `.claude/settings.json`
  `hooks` + `_drwn` meta + wrapper written + idempotent re-write; moved-`drwn` rewrite.
- **Docs:** `CardManifest` + `card-manifest.md`; `materialization.md` (managed fields now
  `mcpServers`+`hooks`); `write-record-json.md`; `export.md`/`analyze.md`
  (`signals/`, `--include-signals`); `write.md` (hook changeset, first-adoption guard,
  troubleshooting “hooks path moved → rerun `drwn write`”).

## 9. Scope boundaries

**In scope:** generic hooks mechanism (types, validation, full data path through
merge→effective-state→writer with first-adoption `--force` replace, wrapper write, sync
wiring); the `drwn hook` subcommands; the signal contract (§5); export/analyze
`--include-signals` (default off) with `claude/` exclusion + collision-proof `signals/`;
tests + docs.

**Out of scope:**
- **Default card + bootstrap delivery** — deferred.
- **DHS:** exclude/parse `signals/` separately + session↔card storage + filter-by-card UI;
  also note the manual `--archive`-containing-`signals/` compatibility gap.
- **SA:** mount the sidecar + update the extractor (`index.ts`, `task-template.ts`) to
  follow flags and **classify `slash_expansion`**.
- **drwn:** Codex hooks writer; richer Claude hook schema (non-command types/options/more
  events); `--adopt` import; Windows wrapper; third-party hook approval ledger.

## 9a. Risks & mitigation

| Risk | Mitigation |
|---|---|
| Hook latency / hung process | Local I/O; < 50 ms target; explicit low `timeout` (~5 s). |
| Hook failure blocks the agent | Always exit 0; wrapper no-ops if drwn missing. |
| stdout/stderr pollutes context (incl. pre-dispatch) | Silence contract; wrapper sets env + redirects; diagnostics to capped debug file. |
| First write clobbers user `hooks` | Adoption guard; `--force` = replace + own. |
| Sidecar exported as a session log | Exclude `*.drwn-signals.jsonl` from `claude/` in export **and** analyze inline. |
| Signal basename collisions in archive | `signals/<sha8(dir)>/…` layout; tests for `agents/` vs main. |
| Signals counted as DHS session logs | `--include-signals` default off until DHS handles `signals/`; document manual-archive gap. |
| Slash misclassification (skills vs custom cmds vs plugin) | Emit raw `slash_expansion`; SA classifies; no fragile drwn filter. |
| `Skill` tool name / payload shape unverified | Required real-payload fixtures before shipping. |
| `<drwn>` path moves / Bun execPath | Wrapper records resolved invocation per install case; re-resolve on next write; no-op if missing. |
| Store read-only when writing fallback/debug | Respect store read-only rules; skip silently. |

## 10. Open questions for review

1. Sidecar naming `<session_id>.drwn-signals.jsonl` + `signals/<sha8(dir)>/` layout —
   confirm acceptable (export now excludes the file from `claude/`).
2. ~~Skill coverage~~ all skills incl. `/slash` and failures. ~~`skill_result`~~ pure flag.
   ~~`--force`~~ replace. ~~Default card~~ out of scope. ~~Slash classification~~ raw + SA.
   ~~Failures~~ `skill_failure` via PostToolUseFailure.
