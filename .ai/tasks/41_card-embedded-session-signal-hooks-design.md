# ABOUTME: Design spec for card-embedded Claude Code hooks that emit session signals.
# ABOUTME: Covers the generic hooks-in-cards mechanism, the drwn hook subcommands, and the signal contract for DHS/SA.

# Task 41: Card-Embedded Session-Signal Hooks (Design)

> **For Claude:** DESIGN / SPEC produced via `superpowers:brainstorming`. The implementation
> plan is a separate follow-up via `superpowers:writing-plans`.

**Status**: In Review
**Created**: 2026-06-23
**Updated**: 2026-06-23
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR, sliced into reviewable tasks (schema+merge+gating ·
effective-state+conditional-ownership writer · wrapper+managed-file record · hook
subcommands · export/analyze flags · docs).
**Dependencies**:
- DHS (`darwinian-harness-services`) — consumes `card_usage`; must skip/parse `signals/` (follow-up)
- SA (`signal-analyzer`) — consumes skill signals; classifies slash skills (follow-up)
**References**: [.ai/knowledges/10_drwn-cli-architecture.md, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/sync.ts, cli/core/write-record.ts, cli/core/effective-state.ts, cli/core/project.ts, cli/core/card-manifest.ts, cli/core/card-project.ts, cli/core/types.ts, cli/core/context.ts, cli/core/export/archiver.ts, cli/core/export/session-discovery.ts, cli/core/analyze/inline-export.ts, cli/commands/init.ts, cli/commands/export/sessions.ts, cli/commands/analyze/sessions.ts, cli/index.ts, registry/config.json, docs-docusaurus/docs/concepts/materialization.md, docs-docusaurus/docs/reference/schemas/card-manifest.md, docs-docusaurus/docs/reference/schemas/write-record-json.md, docs-docusaurus/docs/reference/cli/export.md, docs-docusaurus/docs/reference/cli/analyze.md, docs-docusaurus/docs/reference/cli/write.md, test/core-archiver.test.ts, https://code.claude.com/docs/en/hooks]

---

## 1. Objective

Make Claude Code **hooks** a first-class artifact in `drwn` (declarable in card manifests +
project config, materialized into `.claude/settings.json`), and ship hook subcommands that
emit append-only **session signals** for two services:

1. **Card-usage tracking → DHS.** On every user prompt, record which Harness Cards are
   active, so analysis can filter/aggregate sessions by card.
2. **Skill-trigger marking → SA.** Anchor **every skill invocation**: the `Skill` tool
   (success **and** failure) and direct `/slash` skills (emitted raw for SA to classify).

Today "hooks" is declared-but-unimplemented (`extensions/types.ts:5`; only Beads declares
it, `extensions/registry.ts:12`); the Claude writer manages only `mcpServers`
(`mcp.ts:75-97`).

**Scope:** the hook *mechanism* + subcommands + signal contract. **Default-card packaging &
bootstrap auto-apply are OUT OF SCOPE** — `drwn init` only scaffolds config + registers the
catalog (no card-apply path, `cli/commands/init.ts:74-90`).

## 1a. Success criteria

- [ ] Card manifests and project config can declare `hooks`; **card-contributed hooks are
      default-deny** (materialized only with project opt-in, §3 Layer 1); locally-authored
      project hooks are trusted; `enabled:false` / `hooksDisable` suppress any hook.
- [ ] `drwn write` materializes active hooks into project `.claude/settings.json` `hooks`
      with **conditional ownership** (§3): never writes `hooks: {}` into a project with no
      drwn hooks; clears the managed key when previously-owned hooks go away.
- [ ] First-adoption guard on **both** the `hooks` key and the wrapper file: refuse a
      pre-existing unmanaged value unless `--force` (which replaces + records the hash).
- [ ] `drwn hook card-usage` (UserPromptSubmit) appends `card_usage` write-on-change;
      **requires `card.lock`** (skips silently if absent).
- [ ] `drwn hook skill-marker` anchors: `skill_invocation` (PreToolUse `Skill`),
      `skill_result` (PostToolUse), `skill_failure` (PostToolUseFailure), raw
      `slash_expansion` (UserPromptExpansion). Tool markers carry `tool_use_id` (hard
      contract) + `tool_name`; all records carry `schema_version`, `hook_event_name`,
      `transcript_basename`, `source_dir_hash`, `agent_id`/`agent_type` when present.
- [ ] Rendered hooks point at the wrapper via `${CLAUDE_PROJECT_DIR}/.claude/hooks/drwn-hook`
      (absolute), carry a low `timeout`, and the wrapper redirects **stdout+stderr to
      /dev/null** and no-ops if `drwn` is missing.
- [ ] `--include-signals` (default off) on `export` **and** `analyze` (incl. `--fresh`)
      excludes `*.drwn-signals.jsonl` from `claude/`, bundles under collision-checked
      `signals/<sha16(dir)>/`, and updates archive expected-count + error text.
- [ ] Signal lines conform to §5; tests + docs (§8) updated.

## 2. Background

Both services consume the Claude transcript JSONL; `drwn` already ships transcripts to the
analyzer.

- `export sessions` bundles `~/.claude/projects/<slug>/*.jsonl` into a tar limited to
  `claude/`/`codex/`, **rejects hidden dotfiles** (`archiver.ts:50`; so "hide via dot" is
  out) and validates member count == files.length (`validateArchiveMembers`,
  `archiver.ts:32,57`; error text "outside claude/codex namespace", `archiver.ts:52`). The
  `--fresh` analyze path reuses the same discovery + archiver (`inline-export.ts:6-14`).
- **DHS** pushes every non-hidden `.jsonl` into `jsonlEntries` and throws
  `too_many_session_logs` **at collection time, before parse** (`archive-ingest.ts:43-48`,
  `consumer.ts:114`; entry test `archive-entry.ts:1-9`). No per-session card storage.
- **SA** reads one mounted log `/workspace/logs/session.jsonl` (`index.ts:30,67`); detection
  is regex/heuristic (`task-template.ts`). No `log-digest.ts`.
- **Internals that must be expanded:** `mergeProjectConfig` returns only
  `{config,registry,skills,extensions}` (`project.ts:86`); `EffectiveState` has no hooks
  (`effective-state.ts:27`); `syncMcp` takes only `servers` (`sync.ts:126`); `ManagedPath`
  has only `symlink|managed-fields|generated-symlink` (`write-record.ts:14`) and cleanup
  removes only symlinks else warns "preserved user-owned path" (`sync.ts:101-124`); context
  uses `AGENTS_REPO_ROOT`/`AGENTS_HOME_DIR`/`AGENTS_DIR` (`context.ts:19,25,27`).

### Decisions

| Topic | Decision |
|---|---|
| Target tools | Claude Code first; Codex later |
| Config layers | Cards + project config only |
| Destination | Project-local `.claude/settings.json` |
| Hook logic | `drwn hook <name>` subcommands, via a managed wrapper |
| Card-hook trust | **Default-deny**; project opt-in (`hooksAllowFromCards`); project hooks trusted |
| Suppression/removal | `enabled:false` per hook + project `hooksDisable: string[]` |
| Ownership | Conditional: only manage `hooks` when active hooks exist or drwn already owns it |
| Transport | Co-located sidecar; `signals/<sha16(dir)>/` behind `--include-signals` (off) |
| Card-usage | Write-on-change on `UserPromptSubmit`; **requires `card.lock`** else skip |
| Skill coverage | `Skill` Pre/Post/**Failure** + raw `/slash` (UserPromptExpansion) |
| Slash classification | Raw `slash_expansion`; **SA classifies** |
| Tool-marker anchor | `tool_use_id` (hard contract); no `seq` |
| `--mcp-only` / `--skills-only` | Hooks are target config: written with MCP, **skipped by `--skills-only`** |
| Event set (MVP) | The 5 used events only (extensible later) |
| Default card + bootstrap | Out of scope (deferred) |

## 3. Architecture (3 layers; Layer 4 deferred)

### Layer 1 — Generic hooks-in-cards mechanism

- **Types** (`types.ts` + new `cli/core/hooks.ts`):
  ```ts
  type HookEvent =        // MVP: exactly the events the signal hooks use
    | "UserPromptSubmit" | "UserPromptExpansion"
    | "PreToolUse" | "PostToolUse" | "PostToolUseFailure";

  interface HookDefinition {
    event: HookEvent;
    matcher?: string;     // tool name for Pre/Post/PostFailure; command name for
                          // UserPromptExpansion; NOT allowed on UserPromptSubmit
    type?: "command";
    command: string;      // wrapper path (see §7)
    args?: string[];
    timeout?: number;     // seconds; default low (~5)
    enabled?: boolean;    // default true; false suppresses
    description?: string;
  }
  ```
  `CardManifest` (`card-manifest.ts:7`) gains `hooks?: Record<string, HookDefinition>`.
  `ProjectConfig` (`types.ts:95`) gains `hooks?`, plus
  `hooksAllowFromCards?: boolean | string[]` (default `false`) and `hooksDisable?: string[]`.

- **Validation** (`card-manifest.ts`): strictness **scoped to each `hooks.<id>`** (event ∈
  set; matcher only on matcher-bearing events; `type` ∈ {command, undefined}; non-empty
  command; reject unknown keys *within a hook def*). `validateCardManifest` stays permissive
  about other top-level keys (`card-manifest.ts:50`).

- **Merge + gating** (`card-project.ts:49`, then `project.ts:86`):
  1. Start with **project-authored `hooks`** (trusted).
  2. Add **card hooks** only if allowed by `hooksAllowFromCards` (`true` → all; `string[]` →
     those ids; `false`/absent → none). Card hooks not allowed are dropped (with a changeset
     note so the user can opt in).
  3. Remove ids in `hooksDisable` or with `enabled:false`.
  → `activeHooks`. Expose on `EffectiveState` (`effective-state.ts:27`); thread into the
  writer via `sync.ts` (today `syncMcp` is MCP-only).

- **Renderer** (`cli/core/hooks.ts`): nested Claude shape; `command` =
  `${CLAUDE_PROJECT_DIR}/.claude/hooks/drwn-hook` (absolute, per Claude exec-form guidance),
  explicit `timeout`. Example (tests only):
  ```json
  { "UserPromptSubmit":   [ { "hooks":[ { "type":"command","command":"${CLAUDE_PROJECT_DIR}/.claude/hooks/drwn-hook","args":["card-usage"],"timeout":5 } ] } ],
    "UserPromptExpansion":[ { "hooks":[ { "type":"command","command":"${CLAUDE_PROJECT_DIR}/.claude/hooks/drwn-hook","args":["skill-marker","--phase","expansion"],"timeout":5 } ] } ],
    "PreToolUse":         [ { "matcher":"Skill","hooks":[ { "type":"command","command":"${CLAUDE_PROJECT_DIR}/.claude/hooks/drwn-hook","args":["skill-marker","--phase","pre"],"timeout":5 } ] } ],
    "PostToolUse":        [ { "matcher":"Skill","hooks":[ { "type":"command","command":"${CLAUDE_PROJECT_DIR}/.claude/hooks/drwn-hook","args":["skill-marker","--phase","post"],"timeout":5 } ] } ],
    "PostToolUseFailure": [ { "matcher":"Skill","hooks":[ { "type":"command","command":"${CLAUDE_PROJECT_DIR}/.claude/hooks/drwn-hook","args":["skill-marker","--phase","fail"],"timeout":5 } ] } ] }
  ```

- **Writer** (rename the Claude path in `mcp.ts` → `claude-settings.ts`): manage `hooks` as a
  second `_drwn` field via `managed-fields.ts`, with **conditional ownership**:
  | State | Action |
  |---|---|
  | active hooks present | write `hooks`, record `_drwn.hooks` hash (drift-guarded) |
  | no active hooks, no prior `_drwn.hooks` | **leave `hooks` untouched** (never write `{}`) |
  | no active hooks, prior `_drwn.hooks` exists | **remove** the managed `hooks` key + wrapper |
  | unmanaged `hooks` exists, drwn wants to write | refuse unless `--force` (then replace + own) |

- **Wrapper as a managed file:** add a `ManagedPath` variant
  `{ path, kind:"managed-file", contentHash, mode }` (`write-record.ts:14`); `drwn write`
  writes `<project>/.claude/hooks/drwn-hook` (mode `0755`) and records it. Cleanup
  (`sync.ts:101`) removes a `managed-file` only when its on-disk hash matches the recorded
  hash (else "preserved user-owned"). **Wrapper first-adoption guard:** refuse to overwrite a
  pre-existing unmanaged `drwn-hook` without `--force`.

### Layer 2 — Hook logic as `drwn hook <name>` subcommands

Hidden subcommands in `cli/index.ts`, reading Claude's hook JSON from **stdin**. Records are
flags (identifiers only). Every record carries `schema_version:1`, `hook_event_name`,
`session_id`, `ts`, `transcript_basename`, `source_dir_hash` (= `sha16(abs dirname of
transcript)`, matching the `signals/<hash>/` archive path), and `agent_id`/`agent_type` when
present. **If `transcript_path` is absent, skip emission silently** (so `transcript_basename`
is always real — no null, no separate fallback sink).

- **`drwn hook card-usage`** ← `UserPromptSubmit`. **Requires `card.lock`** (nearest from
  `cwd`); if absent, skip silently (no `config.cards` fallback — refs there may be ranges/URLs,
  not resolved `{name,version}`, and resolving is too heavy for a hot hook). Append
  `card_usage` **write-on-change** vs the **last `card_usage` line** for the session (scan
  for that type, not the last line — the sidecar interleaves skill records).
  - *Why `UserPromptSubmit` not `SessionStart`:* the card set changes only via
    `drwn card add/remove/apply`; no "lock changed" event; this event re-observes `card.lock`.

- **`drwn hook skill-marker`** ← `PreToolUse`/`PostToolUse`/`PostToolUseFailure` (matcher
  `Skill`) + `UserPromptExpansion`:
  - `skill_invocation` (Pre): `skill` (from `tool_input`), `tool_name`, `tool_use_id`.
  - `skill_result` (Post): `tool_use_id`, `tool_name` (+ `skill` if cheap).
  - `skill_failure` (PostFailure): `tool_use_id`, `tool_name` (+ `skill` if cheap).
  - `slash_expansion` (Expansion): **raw** — `command_name`, `command_source`, `command_args`
    (no drwn `skill`; SA classifies, since `expansion_type` is `slash_command` for skills AND
    custom commands and `command_source` is e.g. `plugin`/`user`).
  - **Anchor:** `tool_use_id` (hard contract) for tool markers; `slash_expansion` correlates
    via `session_id` + `transcript_basename` + `command_name`.
  - **Fixtures (required before shipping):** capture real `Skill` Pre/Post/**PostToolUseFailure**
    payloads (confirm `tool_name`/`tool_input`) and a real `UserPromptExpansion` payload.

### Layer 3 — Signal sink + transport

- **Sink:** `${dirname(transcript_path)}/${session_id}.drwn-signals.jsonl`. Writing the
  debug file under `~/.agents/drwn/` respects store read-only rules (skip silently if
  read-only); the debug file is **size-capped with rotation**.
- **`--include-signals` (default off):** add the flag to `ExportSessionsCommand` (today only
  `--dry-run/--out/--gzip`, `export/sessions.ts:31-39`) **and** `AnalyzeSessionsCommand`;
  thread `includeSignals` into `runInlineExport` (today no options, `inline-export.ts:26`) and
  discovery/archive. `--dry-run` lists the signal files that would be added and notes the DHS
  requirement. **With an explicit `--archive`** there is nothing to add → `--include-signals`
  is **ignored with a warning**.
- **Exclusion + layout:** `discoverClaudeSessions` (maps `.jsonl`→`claude/<basename>`,
  `session-discovery.ts:91,150`) always **excludes `*.drwn-signals.jsonl`** from `claude/`.
  Under the flag, archive each signal file as
  `signals/<sha16(abs dirname)>/<session_id>.drwn-signals.jsonl`. `ALLOWED_PREFIXES` gains
  `signals/` and the **error text** updates from "outside claude/codex namespace"
  (`archiver.ts:52`) to include `signals/`; `validateArchiveMembers` expected count includes
  signals when on, excludes when off. sha16 is **collision-resistant, not guaranteed** —
  detect a same-target collision and **error before archive write**.

### Layer 4 — Default card + bootstrap delivery (DEFERRED / OUT OF SCOPE)

## 4. Data flow

```
User prompt ─────────► UserPromptSubmit ─────► wrapper → drwn hook card-usage (requires card.lock)
/slash skill ────────► UserPromptExpansion ──► wrapper → skill-marker (raw slash_expansion)
Skill tool ──────────► PreToolUse:Skill ─────► wrapper → skill-marker (pre)
            ├────────► PostToolUse:Skill ────► wrapper → skill-marker (post)
            └────────► PostToolUseFailure ───► wrapper → skill-marker (fail)
                                                  │
                       <session_id>.drwn-signals.jsonl  (append-only, co-located)
                                                  │
        export / analyze --fresh  (excluded from claude/; signals/<sha16(dir)>/ behind --include-signals)
                                                  │
                     drwn analyze sessions ─► DRWN_ANALYZER_URL
                                                  │
              ┌─────────────────────────────────────┴──────────────────────────┐
              ▼                                                                  ▼
      DHS (skip signals/ BEFORE the count gate; parse separately;     SA (mount sidecar; tool_use_id anchors;
       card_usage → session↔card)                                      classify slash_expansion itself)
```

## 5. Signal contract (stable, versioned)

```jsonc
{ "schema_version":1, "type":"card_usage", "hook_event_name":"UserPromptSubmit",
  "session_id":"abc", "ts":"…", "cwd":"/proj", "transcript_basename":"f.jsonl",
  "source_dir_hash":"ab12cd34ef567890", "agent_id":"…?", "agent_type":"…?",
  "cards":[ { "name":"@curation-labs/improve", "version":"1.2.3" } ] }

{ "schema_version":1, "type":"slash_expansion", "hook_event_name":"UserPromptExpansion",
  "session_id":"abc", "ts":"…", "transcript_basename":"f.jsonl", "source_dir_hash":"…",
  "command_name":"brainstorming", "command_source":"plugin", "command_args":"…" }

{ "schema_version":1, "type":"skill_invocation", "hook_event_name":"PreToolUse",
  "session_id":"abc", "ts":"…", "transcript_basename":"f.jsonl", "source_dir_hash":"…",
  "skill":"superpowers:brainstorming", "tool_name":"Skill", "tool_use_id":"toolu_…" }

{ "schema_version":1, "type":"skill_result", "hook_event_name":"PostToolUse",
  "session_id":"abc", "ts":"…", "transcript_basename":"f.jsonl", "source_dir_hash":"…",
  "tool_name":"Skill", "tool_use_id":"toolu_…" }

{ "schema_version":1, "type":"skill_failure", "hook_event_name":"PostToolUseFailure",
  "session_id":"abc", "ts":"…", "transcript_basename":"f.jsonl", "source_dir_hash":"…",
  "tool_name":"Skill", "tool_use_id":"toolu_…" }
```

- **DHS** keys on `session_id` + distinct `cards` union (read as `ts` intervals). **Required:**
  skip `signals/` **before** `jsonlEntries.push`/the `>50` gate (`archive-ingest.ts:43-48`),
  not merely before parse; then parse them separately. Be blunt in docs: enabling
  `--include-signals` against a current DHS **breaks ingestion**.
- **SA** picks the transcript by `session_id` + `transcript_basename` (+ `agent_id` for
  subagents; `source_dir_hash` disambiguates worktrees); `tool_use_id` locates
  `tool_use`/`tool_result`; classifies `slash_expansion` itself. **Required:** mount the
  sidecar at `/workspace/logs/session.drwn-signals.jsonl` alongside the session log
  (`index.ts:30,67`); update the extractor/`task-template.ts`.

## 6. Error handling & robustness

- Subcommands **always exit 0**; never block the agent.
- **Silence contract:** the **wrapper redirects both stdout and stderr to /dev/null**
  around the `exec`, and sets `AGENTS_REPO_ROOT` + `AGENTS_HOME_DIR` + `AGENTS_DIR` so
  `cli/index.ts:199-206` (pre-dispatch `validateRepoRoot` + stderr writes) cannot print or
  fail noisily. Hook subcommands also avoid store/legacy checks. Diagnostics → size-capped,
  rotated debug file under `~/.agents/drwn/` (skip if store read-only).
- Missing/malformed stdin or absent `transcript_path` → skip silently.
- Local I/O only; write-on-change; target < 50 ms; single-line `O_APPEND`; explicit low hook
  `timeout` (~5 s) bounds a hang (Claude defaults: 30 s UserPromptSubmit, ~600 s command).

## 7. Safety & command resolution

- **Card-hook gate:** card-contributed hooks are **default-deny**; materialized only when the
  project sets `hooksAllowFromCards` (`true` or an id list). Project-authored hooks are
  trusted. `enabled:false`/`hooksDisable` suppress any hook. The changeset prints every hook
  command and flags card hooks that were skipped for lacking opt-in.
- **Wrapper** at `<project>/.claude/hooks/drwn-hook` (managed-file, `0755`): always present
  (so Claude never fails to spawn); records the resolved `drwn` invocation; **no-ops `exit 0`**
  if the target is missing.
  | Install | Invocation recorded in wrapper |
  |---|---|
  | Packaged binary | absolute path to `drwn` |
  | npm shim | absolute npm bin shim path |
  | Homebrew shim | absolute brew bin shim path |
  | Dev checkout | `bun <repo>/cli/index.ts` (`process.execPath` is Bun, not drwn) |
  POSIX `sh` (macOS/Linux); Windows `.ps1` is future work. Re-resolve + rewrite on next
  `write` if it moved; wrapper first-adoption guard protects a pre-existing file.
- A recorded-approval ledger for card hooks is future work (default-deny covers MVP).

## 8. Testing

- **Unit:** renderer (5 events, timeout, `${CLAUDE_PROJECT_DIR}` path); merge+**card-hook
  gating** (denied by default; allowed via `hooksAllowFromCards` true/id-list; `enabled:false`
  + `hooksDisable` suppression); hook-scoped validation + matcher table; managed-fields drift;
  **conditional ownership** (no-active-hooks leaves existing user `hooks` untouched;
  previously-owned→removed clears key + wrapper); first-adoption guard for **key and wrapper**;
  malformed `.claude/settings.json` (loud for `write`, silent for hook subcommands — they don't
  parse settings); wrapper mode `0755`; subcommands via stdin fixtures (card-usage
  write-on-change finding last `card_usage` in a mixed sidecar; require-lock skip; all skill
  phases incl. failure; raw slash; `schema_version`/`hook_event_name`/`source_dir_hash`/
  `agent_*` propagation); silence contract incl. pre-dispatch; debug-file cap/rotation;
  read-only-store skip.
- **Export + analyze:** exclusion from `claude/` in `export` and `analyze --fresh`;
  `--include-signals` adds `signals/<sha16>/…`; **collision** (same basename in `agents/` +
  main) stays distinct + collision-detection errors; `validateArchiveMembers` count
  on/off + updated error text; `--archive` + `--include-signals` warns + ignores.
- **Integration:** apply card-with-hooks (+ opt-in) → `drwn write` → assert `hooks` +
  `_drwn` meta + wrapper(0755) + idempotent re-write; **no-active-hooks** project leaves user
  hooks intact; **hooks-removed** clears key + wrapper; moved-`drwn` rewrite.
- **Docs:** `card-manifest.md` (`hooks`); `materialization.md` (managed fields now
  `mcpServers`+`hooks`); `write-record-json.md` (new `managed-file` variant + hooks);
  `export.md`/`analyze.md` (`signals/`, `--include-signals`, `--archive` interaction);
  `write.md` (hook changeset, first-adoption guard, **card-hook gate**, troubleshooting
  "hooks path moved → rerun `drwn write`").

## 9. Scope boundaries

**In scope:** generic hooks mechanism (types, validation, merge+gating, conditional-ownership
writer, managed-file wrapper, sync wiring, `--mcp-only` writes / `--skills-only` skips); the
`drwn hook` subcommands; the signal contract (§5); `--include-signals` (default off) on
export+analyze with `claude/` exclusion + collision-checked `signals/`; tests + docs.

**Out of scope:** default card + bootstrap delivery; **DHS** (skip `signals/` before the count
gate + parse separately; session↔card storage + UI; manual `--archive` gap); **SA** (mount
sidecar + extractor update + classify slash); Codex hooks writer; richer hook schema
(non-command types/options/more events); `--adopt` import; Windows wrapper; card-hook approval
ledger.

## 9a. Risks & mitigation

| Risk | Mitigation |
|---|---|
| Card hook = arbitrary code on `drwn write` | Default-deny; project opt-in; changeset prints commands; `enabled:false`/`hooksDisable`. |
| Hijacking user-authored `hooks` in a no-drwn-hooks project | Conditional ownership: never write `hooks:{}`; first-adoption guard on key + wrapper. |
| Wrapper file overwrites a user file / not executable | Managed-file record + guard; assert `0755`. |
| Hook latency / hang | Local I/O; < 50 ms; explicit low `timeout`. |
| stdout/stderr pollutes context (incl. pre-dispatch) | Wrapper redirects both to /dev/null + sets all three AGENTS_* envs. |
| Sidecar exported as a session log | Exclude from `claude/` in export + analyze; `--include-signals` off until DHS handles `signals/`. |
| Archive basename collisions | `signals/<sha16(dir)>/…` + pre-write collision detection; `source_dir_hash` in records. |
| Slash misclassification | Raw `slash_expansion`; SA classifies. |
| `Skill`/PostToolUseFailure payload shapes unverified | Required real-payload fixtures. |
| `<drwn>` moves / Bun execPath | Wrapper records invocation per install; re-resolve on next write; no-op if missing. |
| card-usage with no `card.lock` | Skip silently (no range/URL resolution on the hot path). |

## 10. Open questions

1. ~~Sidecar naming/layout~~ **Decided:** `<session_id>.drwn-signals.jsonl` co-located;
   archived at `signals/<sha16(abs dirname)>/…` with pre-write collision detection; records
   carry `source_dir_hash`.
2. All prior questions resolved (skill coverage incl. `/slash`+failures, raw slash + SA
   classification, `tool_use_id` anchor, pure-flag results, `--force`=replace, default-deny
   card hooks, default-card delivery deferred).
