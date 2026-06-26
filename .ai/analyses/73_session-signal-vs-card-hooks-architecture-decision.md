# Session-Signal Hooks (PR #15) vs Card Hooks (PR #14): Integration Test + Architecture Decision

**Date**: 2026-06-25
**Author**: Claude + Remy
**Status**: Implemented — Option 1 (separate mechanisms + shared conditional-ownership writer). Decided + built 2026-06-25. Tasks 54 (per-entry `ownedHooks` writer) and 55 (signal materialization, opt-in `hooks.signals.enabled`, four events — `fail` deferred) are implemented and tested; target-arch docs 60/10 updated. `DRWN_VERSION` bumped to 0.2.2.
**References**:
- PR #15 `design/session-signal-hooks` (observational signal hooks)
- PR #14 `remyjkim/task-44-drwn-card-hooks-with-cicd` (card-hook policy engine)
- Integration branch `integ/hooks-collision` (both PRs merged), test `test/hooks-collision.test.ts` (commit `ff842e0`)
- `.ai/analyses/60_drwn-card-hooks-target-architecture.md`, `.ai/analyses/59_hooks_policy_research.md`
- `.ai/tasks/41_card-embedded-session-signal-hooks-design.md`
- `.ai/analyses/71_session-signal-hooks-pr-review.md` (the PR #15 code review)
- `cli/core/mcp.ts` (`mergeClaudeSettingsText`), `cli/core/hook-generator/sync-hooks.ts`, `cli/core/hook-runner.ts`

---

## Executive Summary

The two open hook PRs are **independent everywhere except one shared resource: the `.claude/settings.json` `hooks` key** — and there they are on a direct collision course. The card-hook system (PR #14) treats the entire `hooks` key as exclusively drwn-managed: on `drwn write` it does `parsed.hooks = options.hooks` — a **wholesale replace** — and records a hash for drift detection. The session-signal system (PR #15) tells users to **hand-write** signal command-hooks into that same key, across event types (`UserPromptSubmit`, `UserPromptExpansion`, `PostToolUseFailure`) that PR #14 neither emits nor can even represent.

I merged both PRs (clean merge; only `cli/index.ts`, `package.json`, `tsconfig.json` overlapped, all mechanical) and wrote a test that reproduces the collision against the real merge function. **All four collision behaviors are confirmed:**

1. **Silent clobber (worst case).** When a hook-shipping card is first added to a project that already has manual signal hooks, `drwn write` replaces the whole `hooks` key with **no warning** — every signal hook vanishes.
2. **Drift lock-out.** Once drwn manages `hooks`, a user re-adding signal hooks makes the next ordinary `drwn write` **throw** `Drift detected … hooks`.
3. **`--force` = data loss.** The documented escape hatch overwrites the signal hooks again.
4. **Coexistence only by absence.** Signal hooks survive solely while no card in the project ships hooks.

The root cause is an **ownership model mismatch**, not a bug in either PR: PR #14 claims the whole key; PR #15 expects a co-tenant. PR #15's own design already anticipated the fix it lacks — a "conditional-ownership writer" and "merge" — and explicitly deferred it.

The good news, verified against captured payloads and Claude docs: **Claude runs multiple matcher entries under a single event key**, so policy hooks and observational signal hooks *can* coexist in one settings file. The decision is about **how drwn should own its slice of the `hooks` key**, and secondarily whether signal hooks should remain a separate mechanism or be folded into the card-hook engine. My recommendation is **Option 1: keep two separate mechanisms behind one shared conditional-ownership writer.** The architecture choice is yours; this doc lays out the options with tradeoffs.

---

## Context

PR #14 and PR #15 both branch from the same `main` commit and both, ultimately, write Claude hooks. They serve **different purposes**:

- **PR #14 — card hooks**: a *decision* engine at the tool-call boundary. Card authors ship runtime-agnostic TypeScript **policy modules** (`hooks/<name>/policy.ts`) that can `allow`/`deny`/`ask`/`log-only` on `PreToolUse`/`PostToolUse`. `drwn write` bundles all locked policies into a composer (`.mjs`) and registers it. Executing third-party code at the tool boundary is gated by **per-card hook consent** in lockfile v3.
- **PR #15 — session signals**: an *observation* recorder. Two hidden `drwn hook` subcommands, registered as command hooks, append JSONL records (active cards, skill markers, slash expansions) beside the transcript. They **always exit 0**, make no decision, and carry no consent.

Neither is merged. On `main` today there is no conflict. The question is what happens — and which architecture we commit to — when both land. This investigation covers every aspect I could identify.

---

## Investigation

### 1. The collision, reproduced (verified in code)

`mergeClaudeSettingsText` (`cli/core/mcp.ts:93-135`) is the single writer for the Claude `hooks` key. Key mechanics:

- `shouldManageHooks = options?.hooks !== undefined || previouslyManagedKeys.includes("hooks")` (mcp.ts:101).
- Drift: `detectManagedFieldDrift` flags `hooks` only if a hash was **previously recorded** (mcp.ts:104-108) → throws unless `force`.
- Write: `if (options?.hooks !== undefined) parsed.hooks = options.hooks; else delete parsed.hooks` (mcp.ts:116-120) — **wholesale replace or delete, never merge**.

The card-hook config it writes (`claudeHooksConfig`, `sync-hooks.ts:92-98`) is **only** `PreToolUse`/`PostToolUse` with matcher `.*`. The `ClaudeHooksConfig` **type itself** (`mcp.ts:21-24`) has only those two keys — it structurally cannot represent the signal hooks' events.

`test/hooks-collision.test.ts` (integ branch, commit `ff842e0`) exercises the real function with a fixture mirroring PR #15's README registration. Result: **4 pass + 1 `todo`** (the `todo` is the coexistence contract neither PR satisfies). The four passing tests are the four behaviors in the Executive Summary.

Two additional wipe/▸break vectors found during investigation:
- **MCP-only re-sync also deletes signal hooks.** Once `_drwn.managedKeys` includes `"hooks"`, a later MCP-only `drwn write` (no `hooks` option) hits `delete parsed.hooks` (mcp.ts:118-120).
- **`drwn doctor` can emit spurious drift or hit an uncaught throw.** Doctor's MCP-drift check calls `mergeClaudeSettingsText(current, activeServers)` with no `hooks` option (`cli/core/diagnostics.ts:465-469`); on a file carrying signal hooks this reports false drift, and if `hooks` is already managed it can hit the drift-**throw** path inside doctor.

### 2. Same file, by default (why the collision actually bites)

- Card-hook write scope defaults to **project** whenever a project root exists (`effective-state.ts:89`), writing `<root>/.claude/settings.json` (`sync-hooks.ts:37-44`, `paths.ts:72`).
- PR #15's README instructs users to add signal hooks to the **project** `.claude/settings.json`.
- So the default scopes **target the same file** — the dangerous case is the default, not an edge case.

### 3. The two systems are architecturally different shapes

| Dimension | Card hooks (PR #14) | Signal hooks (PR #15) |
|---|---|---|
| Purpose | Decision (allow/deny/ask/log-only) | Observation (record-only) |
| Unit | Policy module `hooks/<name>/policy.ts` | `drwn hook <name>` subcommand |
| Events | `PreToolUse`, `PostToolUse` only | `UserPromptSubmit`, `UserPromptExpansion`, Skill-matched Pre/Post/Fail |
| Matcher | `.*` (every tool call) | `Skill` / event-wide |
| Registration | `drwn write` materializes composer | Manual settings.json edit (materialization deferred) |
| Settings ownership | Owns the **entire** `hooks` key | Expects to be a **co-tenant** |
| Consent/trust | Per-card consent (lockfile v3), third-party code | None — first-party drwn subcommand |
| Runtimes | Claude + Codex + Mastra (adapters) | Claude only |
| Perf | Node cold-start on **every** tool call (`.*`) | Fires only on its specific events |

The card-hook engine **explicitly scopes out non-tool-use events** in v1 (`60_…:41`), because its portability invariant (one policy → three runtimes) is bounded by Mastra, whose hook surface is only before/after-tool. The signal hooks live precisely in that excluded space. They are **not** the same feature and one does not subsume the other for free.

### 4. Claude Code hook semantics (verified vs corrected)

I treated the web-docs subagent output as **low confidence** and verified the load-bearing claims against the captured payloads in `test/fixtures/claude-hooks/` (real Claude Code 2.1.179) and repo code.

- **CONFIRMED — multiple matcher entries under one event all fire.** A `PreToolUse` array can hold both a `matcher:"Skill"` entry and a `matcher:".*"` entry; Claude runs both. This is the foundation that makes coexistence possible **within a single file**. (Corroborated by both the docs agent and the cross-cutting agent.)
- **CORRECTED — `Skill` IS a real tool that emits Pre/PostToolUse hooks.** The docs agent claimed "Skill is not a valid matcher / skills don't emit tool hooks." The captured fixture `skill-pre-tool-use.json` shows `hook_event_name:"PreToolUse"`, `tool_name:"Skill"`, `tool_input.skill:"superpowers:brainstorming"`. So PR #15's `pre`/`post` phases are **real and validated**. The nuance (from the fixtures README): an *unknown* skill that fails to resolve emits **no** lifecycle hooks; a *known* skill emits Pre+Post.
- **UNCONFIRMED — `PostToolUseFailure` for a Skill.** No real Skill failure was ever captured; PR #15 substituted a failing **Bash** payload. The captured Skill `PostToolUse` shows `success:true`. So PR #15's `fail` phase is shipped against an assumed shape (this is finding **F1** from the code review, reinforced).
- **UNCERTAIN — cross-settings-source merge semantics.** The two subagents **disagreed**: one said hooks **union** across user/project/local sources; the other said project **overrides** user. I could not verify from the repo, and the docs agent's broader event taxonomy proved unreliable, so **treat this as unknown**. Consequence: any architecture that relies on "put system A at user scope, system B at project scope" is **fragile** and must not be chosen on the assumption of union.
- **Version sensitivity.** Fixtures are from 2.1.179; the machine here runs 2.1.176. Hook event names/shapes can drift between Claude versions — the exact event taxonomy is a moving target and the `schema_version` field in the signal contract is the right hedge.

### 5. Clean seams (no conflict)

- **Lockfile.** PR #15's permissive reader (`resolveActiveCardsFromLock`, `hook-runner.ts:48-65`) ignores `lockfileVersion` and reads only `cards[].{name,version}` — both present and unchanged in PR #14's v3 lock. **Forward-compatible**; verified.
- **Export/discovery.** PR #15 adds a one-line exclusion of `*.drwn-signals.jsonl`; PR #14 does not touch export. No `--include-signals` transport exists yet. Clean.
- **Merge mechanics.** The three overlapping files conflict only mechanically (command registration list, version bump, tsconfig `types`). The merged tree **typechecks and the hook test suites pass** (baseline 816 pass; the 2 failures — `gitWorktreeRoots`, `bundleHookComposer` — are pre-existing/environmental in a worktree, not merge-induced).

### 6. CLI vocabulary collision (UX, not correctness)

After merge the word "hook" means two different things to a user:
- `drwn card source add-hook`, `drwn card trust <card> --hooks` → card **policy** hooks.
- `drwn hook card-usage`, `drwn hook skill-marker` → settings.json **command** hooks for signals (hidden from `--help`).

The `drwn hook *` subcommands are deliberately hidden, which softens it, but the visible `drwn card … hook` family plus the README's "wire up `drwn hook …` by hand" instruction will read as one concept when they are two. Worth a naming pass regardless of which architecture wins (e.g. "policies" vs "signals").

### 7. Secondary observations

- **Version skew (pre-existing).** `DRWN_VERSION = 0.2.1`, `package.json` `0.2.2`, lockfile `minDrwnVersion = 0.3.0`. Doctor's composer-freshness check compares against `0.2.1`. Internal inconsistency spanning both branches — flag for the release step.
- **Privacy.** Signal `card_usage` records persist absolute `cwd`; policy hooks execute third-party code. Both are acceptable as-is (manual opt-in; consent gate respectively) but the unified-writer work is where a default-on materialization gate would surface the `cwd` write. (See review doc 71, F4.)

---

## Findings

1. **The conflict is real, default-path, and silent in the worst case.** Verified by `test/hooks-collision.test.ts`. Root cause: PR #14 owns the entire `hooks` key; PR #15 expects co-tenancy.
2. **Coexistence is technically possible** because Claude runs multiple matcher entries per event — but only if drwn writes a **merged** `hooks` key instead of replacing it.
3. **The systems are different features**, not redundant. Observation ≠ decision; first-party ≠ third-party; signal events are outside the policy engine's portable v1 scope.
4. **PR #15 already specifies the missing piece** — a "conditional-ownership writer" and "merge" — and deferred it. That deferred task *is* the fix.
5. **Two of PR #15's five record types are validated** (`pre`/`post`); the `fail` phase is not (F1).
6. **Clean seams**: lockfile, export, merge mechanics. **Soft problems**: CLI vocabulary, doctor awareness, version skew.
7. **One unknown that constrains options**: cross-source settings merge (union vs override) is unverified — do not build on it.

---

## Architecture Options

### Option 1 — Two mechanisms, one shared conditional-ownership writer (RECOMMENDED)

Keep card hooks and signal hooks as **distinct features**. Replace the wholesale `parsed.hooks = options.hooks` with a **merge** that owns only the matcher entries drwn created (tagged by a marker/namespace), preserving foreign entries — including signal hooks. Then implement PR #15's deferred materialization so signal command-hooks register **through the same writer** (manifest/project `hooks` → merged into settings.json), instead of by hand. Both concerns write multiple matcher entries under shared event keys; Claude runs all.

- **Pros:** matches both designs' stated intent; preserves the correct observation/decision split; signal hooks stay consent-free, policy hooks keep consent; grounded in Claude's verified multi-matcher support; bounded blast radius (the writer + a marker scheme + doctor awareness).
- **Cons:** must rework `mergeClaudeSettingsText` ownership (drift/cleanup now per-entry, not per-key); doctor must learn both; needs a stable marker to distinguish drwn-owned entries from user/foreign ones.
- **Effort:** medium. The hard part is the ownership/marker model; everything else is additive.

### Option 2 — Unify under the card-hook engine (System A absorbs System B)

Extend the policy engine to support (a) non-tool-use events and (b) an observational "command" hook type that emits a direct command hook (not the `.*` composer). Signal hooks become first-party policies/built-ins.

- **Pros:** one hook subsystem, one writer, one drift/doctor integration, one mental model; could also fix the `.*`-matcher perf problem by introducing narrow-matcher command hooks.
- **Cons:** **large scope** — touches the contract, decode, compose, encode, settings type, across all three runtimes; non-tool events **cannot be portable** (Mastra has no equivalent), breaking the engine's core invariant; forces observational signals through a consent/decision framing that doesn't fit them; couples a ship-ready observational beta to a much bigger engine and delays both. YAGNI for now.
- **Effort:** high.

### Option 3 — Physically separate files/scopes

Card hooks at machine/user scope, signal hooks at project scope (or vice versa), relying on Claude merging across sources.

- **Pros:** no writer changes.
- **Cons:** depends on **unverified** cross-source union semantics — one subagent says project **overrides** user, which would still lose same-event hooks; fights the default (both want project scope); fragile and version-dependent. **Not recommended** as the primary design.

### Option 4 — Sequence, don't co-design yet (process, not architecture)

Land PR #14 first; keep PR #15 as a manual-opt-in beta with a documented "incompatible while card hooks are active" warning; build the unified writer (Option 1) before enabling signal-hook materialization. This is compatible with Option 1 as a **rollout order**, not a competing end state.

---

## Recommendation

**Option 1**, optionally rolled out via Option 4's sequencing. It is the least over-engineered design that actually resolves the collision, it is what both PRs' own docs already point to, and it keeps the meaningful distinction between observational signals and policy decisions. Option 2 is the path only if we later need signals to be runtime-portable or decision-bearing — neither is true today.

Whichever we pick, three things should happen regardless:
- Add a **merge/coexistence** contract test (the `test.todo` in `hooks-collision.test.ts`) and make it pass.
- Teach `drwn doctor` about the shared `hooks` key so it stops emitting spurious drift / risking an uncaught throw.
- Resolve **F1** (validate the `fail` phase against a real Skill failure) and the version skew before release.

---

## Decision (2026-06-25)

**Option 1 selected**: keep card hooks and signal hooks as two distinct features behind one shared
conditional-ownership writer that owns only the settings.json `hooks` entries drwn created (merge,
not replace), and materialize signal command-hooks through that same writer. Rationale: least
over-engineered fix that resolves the collision; preserves the observation/decision split; matches
both PRs' stated intent; grounded in Claude's verified multi-matcher support.

## Locked decisions (2026-06-25, Remy)

1. **Ownership marker → `_drwn` side-table.** The `_drwn` meta block records the exact matcher entries
   drwn wrote (hashed). Drift detection becomes per-entry, not per-key: "did *our* entries change?",
   and foreign/user entries (including signal hooks) are preserved by construction. This also fixes
   `doctor`'s spurious-drift / uncaught-throw risk on the shared `hooks` key. Rejected the
   command-string sentinel (brittle, heuristic).
2. **Rollout → Strategy 2 (writer-gated).** Land #14 (card hooks) first; the shared conditional-ownership
   writer must exist before #15 + signal materialization merges, so `main` never exposes the silent
   clobber. No downstream signal consumer (DHS/SA) exists yet, so nothing is blocked by holding #15.
3. **Writer timing → built on #14's branch before #14 merges.** #14 ships already coexistence-capable
   and never owns the whole `hooks` key, even briefly.

## Sub-decisions

- **`fail` phase → DEFERRED (resolved).** Task 55 ships `pre`/`post`/`expansion` + `card-usage` only;
  `PostToolUseFailure`/`fail` is not materialized until a real Skill-failure payload is captured and
  validated (F1).
- **Version skew → RESOLVED.** `DRWN_VERSION` bumped to `0.2.2` to match `package.json`. (The lockfile
  `minDrwnVersion: 0.3.0` remains unenforced — no code compares it; left as-is, benign.)
- **Naming → STILL OPEN.** Disambiguating "policy hooks" (`drwn card … --hooks`) vs "signal hooks"
  (`drwn hook …`) in the CLI surface is not yet done; no dedicated help category exists.

Implementation plans (drafted 2026-06-25, two sequenced task docs per the Strategy-2 split):
- **Task 54** — `.ai/tasks/54_claude-hooks-conditional-ownership-writer-implementation-plan.md`: the writer
  on #14's branch (merge-not-replace + `_drwn` `ownedHooks` side-table, per-entry drift/cleanup, doctor
  false-drift fix, and the folded-in `--mcp-only` hooks-wipe bugfix). Critical path.
- **Task 55** — `.ai/tasks/55_signal-hook-materialization-implementation-plan.md`: auto-materialize signal
  hooks through the writer (type widening, absolute-bin path resolution, opt-in default-off enablement,
  retire the manual README block), after #14 + Task 54 merge. F1 and version-skew hygiene resolved here.
