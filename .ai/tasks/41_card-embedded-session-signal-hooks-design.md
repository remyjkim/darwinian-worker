# ABOUTME: Design spec for the two drwn session-signal hook subcommands and their tests.
# ABOUTME: Scoped to building + testing the hooks; materialization/transport/consumers are deferred.

# Task 41: Session-Signal Hooks — Build & Test (Design)

> **For Claude:** DESIGN / SPEC via `superpowers:brainstorming`. Implementation plan is a
> separate follow-up via `superpowers:writing-plans`.

**Status**: Complete
**Created**: 2026-06-23
**Updated**: 2026-06-23
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR (two `drwn hook` subcommands + signal contract + tests)
**References**: [.ai/knowledges/10_drwn-cli-architecture.md, cli/index.ts, cli/context.ts, cli/core/project.ts, cli/core/card-lock.ts, cli/core/store-paths.ts, cli/core/fs.ts, https://code.claude.com/docs/en/hooks]

---

## 1. Objective & scope

Build and test the two Claude Code **hook subcommands** that emit append-only session
signals:

1. **`drwn hook card-usage`** — on each user prompt, record which Harness Cards are active.
2. **`drwn hook skill-marker`** — anchor every skill invocation (the `Skill` tool, incl.
   failures, plus direct `/slash` skills).

A "hook" here is a `drwn hook <name>` subcommand that reads Claude's hook JSON from **stdin**
and appends one JSON line to a signal file. This task delivers **only the subcommands + the
signal contract + their tests**.

**Explicitly OUT OF SCOPE (separate downstream task):**
- Materializing hooks into `.claude/settings.json` (the generic hooks-in-cards mechanism:
  manifest/project-config `hooks`, merge, card-hook gating, conditional-ownership writer,
  the `.claude/hooks/` wrapper).
- Export/analyze transport (`--include-signals`, `signals/` archive namespace).
- Downstream consumers (DHS session↔card, SA extractor changes).
- Codex hooks.

These are designed elsewhere; this task only needs the signals to be **correctly produced
and testable in isolation**, plus a documented manual registration snippet so the hooks can
be smoke-tested in a real session.

## 1a. Scope guard

This task is **only** the hook subcommands and tests. Do not add card manifest `hooks`,
project-config `hooks`, card-hook defaulting, `.claude/settings.json` materialization,
managed `.claude/hooks/` wrappers, `--include-signals`, DHS/SA ingestion, Codex hooks, or
default drwn-card behavior here.

The one allowed export/analyze touch is a defensive exclusion: current session discovery must
ignore `*.drwn-signals.jsonl` so manually smoke-tested sidecars are not accidentally archived as
Claude transcript logs before the later transport task exists.

## 1b. Current state vs completion criteria

Already present on the current branch:
- [x] `drwn hook card-usage` and `drwn hook skill-marker` are registered in `cli/index.ts`,
      read Claude hook JSON from stdin, append signal lines, exit 0, and stay silent for the
      covered malformed/missing-transcript cases.
- [x] `card-usage` resolves the nearest `card.lock` from stdin `cwd`, skips when absent, and
      appends **write-on-change**.
- [x] `skill-marker` emits `skill_invocation`, `skill_result`, `skill_failure`, and raw
      `slash_expansion` records for representative fixtures.
- [x] Focused hook tests cover the current happy paths and basic robustness.

Remaining before this task can be marked complete:
- [x] Make the hook commands genuinely **hidden** (absent from `drwn --help`).
- [x] Add strict per-phase guards: tool phases require matching `hook_event_name`, `tool_name:
      "Skill"`, `tool_use_id`, and required phase fields; expansion requires
      `UserPromptExpansion`, `command_name`, and `command_source`; mismatches no-op silently.
- [x] Add `expansion_type` to raw `slash_expansion` when present; deliberately omit the user
      `prompt` for privacy.
- [x] Add spawned-process tests for unwritable sinks, malformed lockfiles, phase/event
      mismatch, missing required marker fields, and hidden-help behavior.
- [x] Add per-type contract-shape tests for every emitted signal line.
- [x] Make session discovery exclude `*.drwn-signals.jsonl` so sidecars never archive as Claude
      logs. This is damage containment, not `--include-signals` transport.
- [x] Manual live smoke (§5a) confirms real `UserPromptSubmit`, `UserPromptExpansion`,
      `Skill` Pre/PostToolUse, and `PostToolUseFailure` payload shapes. Fixtures are saved
      under `test/fixtures/claude-hooks/`. Note: on Claude Code 2.1.179, an unknown `Skill`
      produced an errored transcript `tool_result` but did not emit Skill lifecycle hooks;
      `PostToolUseFailure` shape was captured via a failing `Bash` tool.

## 2. Background

Both eventual consumers ingest the Claude session transcript JSONL, so the hooks emit signal
records **co-located with the transcript** and rely on nothing else at runtime.

Claude invokes a command hook with a JSON object on **stdin** carrying (per event):
`session_id`, `transcript_path`, `cwd`, `hook_event_name`, and event-specific fields —
`tool_name`/`tool_input` (+ `tool_use_id`) for Pre/Post/PostToolUseFailure;
`command_name`/`command_source`/`command_args` for UserPromptExpansion; `agent_id`/
`agent_type` in subagent contexts. (Exact field names/shapes — especially the built-in
`Skill` tool's `tool_input` and the PostToolUseFailure payload — must be confirmed from a
**real captured payload** during implementation.)

Implementation notes:
- `card.lock` is read by a **permissive hot-path reader** that walks up for
  `.agents/drwn/card.lock` and parses it directly — deliberately NOT via the semver-backed
  `validateCardLockfile`, to keep the hook fast and dependency-light. It skips on
  parse/shape errors and drops entries lacking a string `name`+`version`.
- Append uses `appendFileSync` (append mode / `O_APPEND`). Add a focused regression if
  concurrent append behavior becomes a hard contract.
- Signal sidecars are co-located with the transcript. Because current Claude discovery walks
  every `*.jsonl`, this task must add a narrow exclusion for `*.drwn-signals.jsonl`; it must not
  add positive signal transport yet.

## 3. The hook subcommands

Both are hidden subcommands under `drwn hook …` registered in `cli/index.ts`. Each:

1. Reads all of stdin and `JSON.parse`s it; on any parse/shape error → exit 0, write nothing.
   Per-phase guards drop partial or phase/event-mismatched payloads as a no-op.
2. Derives the **sink path**: `${dirname(transcript_path)}/${session_id}.drwn-signals.jsonl`.
   If `transcript_path` is absent → skip silently (do not invent a path).
3. Appends exactly one JSON line via a single `O_APPEND` write. If the sink is unwritable →
   skip silently.
4. **Always exits 0** and prints nothing to stdout/stderr. Errors are swallowed silently;
   **this task writes no debug file** (a `DRWN_HOOK_DEBUG` channel is deferred).

> **Silence note:** the subcommand path must avoid `cli/index.ts`'s pre-dispatch stderr/exit
> (`validateRepoRoot` etc., `cli/index.ts:199-206`) — e.g. resolve under a hook-safe path that
> tolerates a missing repo root. (Production registration/wrapper that also guarantees this is
> the deferred materialization task; for tests we invoke the subcommand directly.)

### `drwn hook card-usage` ← `UserPromptSubmit`

- Resolve the nearest `card.lock` from the stdin `cwd`. **If absent → skip silently** (do not
  fall back to `config.json` `cards`; refs there can be ranges/URLs, not resolved
  `{name,version}`, and resolving is too heavy for a per-prompt hook).
- Read locked `{name, version}` for each card; compute the active set.
- **Write-on-change:** scan the sink for the **last `card_usage` line** for this session
  (not the last line — the sink interleaves skill records); append a new `card_usage` line
  only if the set differs.
- *Why `UserPromptSubmit` not `SessionStart`:* the card set changes only via
  `drwn card add/remove/apply`; there is no "lock changed" event; `UserPromptSubmit`
  re-observes `card.lock` each prompt and catches mid-session switches; write-on-change keeps
  the file small.

### `drwn hook skill-marker` ← `PreToolUse` / `PostToolUse` / `PostToolUseFailure` (matcher `Skill`) + `UserPromptExpansion`

A single subcommand dispatched by a `--phase {pre|post|fail|expansion}` arg (passed by the
registration) and/or `hook_event_name`:
- `pre` → `skill_invocation`: `skill` (from `tool_input`), `tool_name`, `tool_use_id`.
- `post` → `skill_result`: `tool_use_id`, `tool_name`.
- `fail` → `skill_failure`: `tool_use_id`, `tool_name`.
- `expansion` → `slash_expansion`: **raw** `command_name`, `command_source`, `command_args`,
  and `expansion_type` when present (no drwn-derived `skill` — `expansion_type` is
  `slash_command` for skills *and* custom commands, so classification is the consumer's job).
  The user `prompt` is **deliberately omitted** (privacy).
- `tool_use_id` is the anchor for tool markers; `slash_expansion` has none (correlates via
  `session_id` + `transcript_basename` + `command_name`).
- Guards: tool phases require `tool_name: "Skill"` and `tool_use_id`; expansion
  requires `command_name`+`command_source`; a payload whose `hook_event_name` disagrees with
  `--phase` is a no-op. `hook_event_name` in the record is the phase's canonical event.

## 4. Signal contract

One JSON object per line. All records carry `schema_version`, `type`, `hook_event_name`,
`session_id`, `ts` (ISO-8601 UTC), `transcript_basename` (basename of `transcript_path`), and
`agent_id`/`agent_type` when present. Markers are flags (identifiers only), not payloads.

```jsonc
{ "schema_version":1, "type":"card_usage", "hook_event_name":"UserPromptSubmit",
  "session_id":"abc", "ts":"…", "cwd":"/proj", "transcript_basename":"f.jsonl",
  "cards":[ { "name":"@curation-labs/improve", "version":"1.2.3" } ] }

{ "schema_version":1, "type":"slash_expansion", "hook_event_name":"UserPromptExpansion",
  "session_id":"abc", "ts":"…", "transcript_basename":"f.jsonl",
  "command_name":"brainstorming", "command_source":"plugin", "command_args":"…",
  "expansion_type":"slash_command" }   // user `prompt` deliberately omitted (privacy)

{ "schema_version":1, "type":"skill_invocation", "hook_event_name":"PreToolUse",
  "session_id":"abc", "ts":"…", "transcript_basename":"f.jsonl",
  "skill":"superpowers:brainstorming", "tool_name":"Skill", "tool_use_id":"toolu_…" }

{ "schema_version":1, "type":"skill_result", "hook_event_name":"PostToolUse",
  "session_id":"abc", "ts":"…", "transcript_basename":"f.jsonl",
  "tool_name":"Skill", "tool_use_id":"toolu_…" }

{ "schema_version":1, "type":"skill_failure", "hook_event_name":"PostToolUseFailure",
  "session_id":"abc", "ts":"…", "transcript_basename":"f.jsonl",
  "tool_name":"Skill", "tool_use_id":"toolu_…" }
```

(Fields needed only for archive transport — e.g. a `source_dir_hash` — are deferred to the
transport task; `schema_version` lets the contract grow without breaking consumers.)

## 5. Testing (the focus)

- **Unit (stdin fixtures → assert sink lines):**
  - `card-usage`: emits on first prompt; **write-on-change** no-op when the set is unchanged;
    new line on card switch; **finds the last `card_usage` line in a mixed sink** (interleaved
    skill records); **no `card.lock` → no output**; missing `transcript_path` → no output;
    unwritable sink → no output, exit 0.
  - `skill-marker`: each phase (`pre`/`post`/`fail`/`expansion`) emits the right record with
    the right fields; `tool_use_id` captured on tool markers; raw `slash_expansion` for a
    non-skill `/foo` (still emitted raw, not classified); `agent_id`/`agent_type` propagated.
  - **Silence + robustness:** empty/malformed stdin, partial payloads, phase/event mismatch,
    unwritable sink → exit 0, no stdout/stderr, no throw.
  - **Contract:** a per-type required-field validator (`hook-signals.test.ts`).
  - **Discovery:** `discoverClaudeSessions` excludes `*.drwn-signals.jsonl`
    (`core-session-discovery.test.ts` or a focused export-signal exclusion test).
- **Integration (real entrypoint, `commands-hook.test.ts`):** invoke `drwn hook …` as a
  spawned process piping a fixture on stdin; assert the sink content and that stdout/stderr
  are empty and exit 0 even with a misconfigured repo root (guards pre-dispatch silence), plus
  no-`card.lock`, malformed lock, missing `transcript_path`, phase/event mismatch, unwritable
  sink (sink path is a directory).

### 5a. Manual live smoke (required before marking complete)

Register the hooks in a scratch `.claude/settings.json` (project or user), run a real session
that triggers a `/slash` skill, a model-invoked skill, and a failing skill, then inspect the
co-located `<session>.drwn-signals.jsonl`. **Save the captured stdin payloads as fixtures** to
confirm the real `Skill` `tool_input` field, the `PostToolUseFailure` shape, and the
`UserPromptExpansion` fields before considering the task done.

```json
{ "hooks": {
  "UserPromptSubmit":   [ { "hooks": [ { "type": "command", "command": "drwn hook card-usage", "timeout": 5 } ] } ],
  "UserPromptExpansion":[ { "hooks": [ { "type": "command", "command": "drwn hook skill-marker --phase expansion", "timeout": 5 } ] } ],
  "PreToolUse":         [ { "matcher": "Skill", "hooks": [ { "type": "command", "command": "drwn hook skill-marker --phase pre", "timeout": 5 } ] } ],
  "PostToolUse":        [ { "matcher": "Skill", "hooks": [ { "type": "command", "command": "drwn hook skill-marker --phase post", "timeout": 5 } ] } ],
  "PostToolUseFailure": [ { "matcher": "Skill", "hooks": [ { "type": "command", "command": "drwn hook skill-marker --phase fail", "timeout": 5 } ] } ]
} }
```

## 6. Out of scope (deferred to follow-up tasks)

- **Materialization:** the generic hooks-in-cards mechanism (manifest/project `hooks`, merge,
  **card-hook gating / default-deny**, conditional-ownership writer into `.claude/settings.json`,
  the managed `.claude/hooks/` wrapper + `drwn` path resolution).
- **Transport:** `--include-signals` on export/analyze, the `signals/` archive namespace +
  collision handling, `source_dir_hash`.
- **Consumers:** DHS (skip/parse `signals/`, session↔card storage + UI) and SA (mount the
  sidecar, follow the flags, classify `slash_expansion`).
- **Codex hooks; Windows wrapper.**

## 7. Risks & mitigation

| Risk | Mitigation |
|---|---|
| Real stdin shapes differ from assumptions (esp. `Skill` `tool_input`, PostToolUseFailure) | Confirm via the manual-smoke captured payloads before finalizing field extraction; `schema_version` allows later tweaks. |
| Hook prints / throws and disrupts the agent | Always exit 0; no stdout/stderr; wrap all logic in a catch; integration test asserts silence even with a misconfigured repo root. |
| Latency on the hot path | Local file I/O only; small `card.lock` read; write-on-change; single `O_APPEND`; target < 50 ms. |
| Pre-dispatch noise (`cli/index.ts:199-206`) when invoked directly | Hook subcommand path tolerates missing repo root and never writes to stderr; covered by the integration test. |
| Unwritable / read-only sink or store | Skip silently. |

## 8. Open questions

1. Confirm the real `Skill` tool name + `tool_input` field for the skill id, and the
   `PostToolUseFailure` / `UserPromptExpansion` payload fields, from a captured session
   (manual smoke) before locking field extraction.
