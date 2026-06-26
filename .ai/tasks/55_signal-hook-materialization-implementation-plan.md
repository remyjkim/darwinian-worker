# ABOUTME: TDD plan to auto-materialize the session-signal hooks into Claude settings.json through the conditional-ownership writer.
# ABOUTME: Sequenced after Task 54 + #14 merge; retires the manual README registration, opt-in and default-off.

# Task 55: Session-Signal Hook Materialization — Implementation Plan

**Status**: Implemented in working tree; live Skill-failure smoke remains a follow-up
**Created**: 2026-06-25
**Updated**: 2026-06-25
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 1.5–2 days
**Branch**: implemented on `remyjkim/drwn-write-root-and-optional-mcp` after cleanly merging `origin/design/session-signal-hooks` into the working tree
**Dependencies**: **Task 54** (conditional-ownership writer) implemented first; PR #14 is already on `origin/main`; PR #15 signal producer files are merged from `origin/design/session-signal-hooks`
**References**: [.ai/analyses/73_session-signal-vs-card-hooks-architecture-decision.md, `.ai/tasks/41_card-embedded-session-signal-hooks-design.md` from `origin/design/session-signal-hooks`, .ai/tasks/54_claude-hooks-conditional-ownership-writer-implementation-plan.md, `cli/core/hook-signals.ts` from `origin/design/session-signal-hooks`, cli/core/mcp.ts, cli/core/hook-generator/sync-hooks.ts, cli/core/hook-generator/runtime-selection.ts, cli/core/types.ts, cli/core/paths.ts, cli/index.ts, README.md]

---

## Objective

Make `drwn write` **automatically register the session-signal hooks** into `.claude/settings.json` through the conditional-ownership writer (Task 54), instead of asking users to hand-edit the file (the current "Claude Session Signals Beta" README block). Because the writer owns only the entries it creates, the signal hooks and the card-hook composer coexist as distinct owned entries under the shared `hooks` key — the collision characterized in analysis 73 is gone.

Materialization is **opt-in and default-off**: it injects hooks into a project's `.claude/settings.json` only when explicitly enabled, mirroring the default-off Mastra-runtime precedent.

**Out of scope:** Codex signal hooks and a Windows wrapper (deferred by design doc 41 §6); the downstream consumers (DHS session↔card, SA extractor); export transport (`--include-signals`); materializing the `PostToolUseFailure`/`fail` entry unless a real Skill-failure payload is captured and validated before implementation.

## Success Criteria

- [x] With signal materialization enabled, `drwn write` registers the four validated signal entries in `.claude/settings.json`: `UserPromptSubmit`→`card-usage`; `UserPromptExpansion`→`skill-marker --phase expansion`; `PreToolUse`/`PostToolUse` (matcher `Skill`)→`--phase pre|post`.
- [x] `PostToolUseFailure` (matcher `Skill`)→`skill-marker --phase fail` is materialized only if a real Skill-failure payload is captured and the signal producer test suite validates that shape; otherwise it remains a follow-up and is not written.
- [x] Signal entries and card-hook composer entries **coexist** under `PreToolUse`/`PostToolUse` (matcher `Skill` alongside matcher `.*`); both are drwn-owned, neither clobbers the other; foreign/user entries still preserved.
- [x] The materialized command uses an **absolute path to the `drwn` binary** (or a generated wrapper), never bare `drwn` — it must fire in a dev checkout where `drwn` is not on PATH.
- [x] Default-off: a project with no signal-hook enablement gets **no** signal entries written.
- [x] Disabling/removing signal materialization **cleans up only the signal entries** (via the Task 54 side-table), leaving card hooks and foreign entries intact.
- [x] The manual registration block is **removed from the README** and replaced with the enablement instruction.
- [x] `bun test`, `bun run typecheck` green.
- [ ] Live smoke (design 41 §5a) re-run with auto-materialization and a real Skill-failure payload capture, if obtainable.

## Approach

### Two solutions considered (path resolution)

**Solution A — absolute drwn-bin command (CHOSEN as MVP).** Resolve the running `drwn`/`bun` invocation once at materialization time and emit `{ type:"command", command:"<abs>/drwn", args:["hook","card-usage"], timeout:5 }`, mirroring how card hooks emit `node <absoluteComposerPath>` (`sync-hooks.ts:93`). Minimal, consistent with the existing precedent, no extra generated files.

**Solution B — generated `.claude/hooks/` wrapper script (deferred).** Emit a small managed wrapper that re-finds `bun`/`drwn` and tolerates a missing repo root. More robust (and what design 41 §6 envisioned), but more moving parts and another managed-content path. Defer unless Solution A proves fragile; the subcommand path already tolerates a missing repo root (`index.ts` `isHookInvocation`).

### Type widening (`cli/core/mcp.ts`)

```ts
export interface ClaudeHookGroup { hooks: ClaudeCommandHook[]; }              // matcher-less events
export interface ClaudeHooksConfig {
  UserPromptSubmit?: ClaudeHookGroup[];      // NEW — no matcher
  UserPromptExpansion?: ClaudeHookGroup[];   // NEW — no matcher
  PreToolUse?: ClaudeHookMatcher[];
  PostToolUse?: ClaudeHookMatcher[];
  PostToolUseFailure?: ClaudeHookMatcher[];  // NEW — matcher "Skill"
}
```

(Task 54 already made `ClaudeHookMatcher.matcher` optional and made `hookEntryIdentity` key matcher-less entries by command — so the side-table handles these for free.)

### Signal config builder (new, alongside `sync-hooks.ts` or a new `sync-signals.ts`)

```ts
function signalHooksConfig(drwnBin: { command: string; args: string[] }): ClaudeHooksConfig {
  const cmd = (extra: string[]) => ({ type: "command" as const, command: drwnBin.command, args: [...drwnBin.args, ...extra], timeout: 5 });
  return {
    UserPromptSubmit:    [{ hooks: [cmd(["hook", "card-usage"])] }],
    UserPromptExpansion: [{ hooks: [cmd(["hook", "skill-marker", "--phase", "expansion"])] }],
    PreToolUse:          [{ matcher: "Skill", hooks: [cmd(["hook", "skill-marker", "--phase", "pre"])] }],
    PostToolUse:         [{ matcher: "Skill", hooks: [cmd(["hook", "skill-marker", "--phase", "post"])] }],
    // Add PostToolUseFailure only after a real Skill-failure payload is validated.
  };
}
```

### Composition (`cli/core/hook-generator/sync-hooks.ts`)

The claude-code runtime must pass **one** composed `ClaudeHooksConfig` to `mergeClaudeSettingsText` — card composer entries (`.*`) plus, when enabled, the signal entries — so both are owned and merged in a single call:

```ts
const claudeConfig = { ...claudeHooksConfig(composerPath), ...(signalsEnabled ? signalHooksConfig(drwnBin) : {}) };
// PreToolUse/PostToolUse arrays must be CONCATENATED, not overwritten, when both contribute:
mergeEventArrays(claudeConfig, signalHooksConfig(drwnBin)); // .*  +  Skill under the same event
```

### Enablement (`cli/core/types.ts`, `runtime-selection.ts`)

Add to `ProjectConfig.hooks`:

```ts
hooks?: {
  exclude?: string[];
  runtimes?: { ... };
  signals?: { enabled?: boolean };   // NEW — default false
};
```

Default-off; resolved like the default-off Mastra runtime. `drwn write` only emits signal entries when `hooks.signals.enabled === true`.

---

## Implementation Plan (TDD)

### Phase S0 — Pre-flight integration
1. Confirm Task 54 is merged and `mergeClaudeSettingsText` uses per-entry `ownedHooks`, not whole-key `fieldHashes.hooks`.
2. Rebase/merge `origin/design/session-signal-hooks`; confirm `cli/core/hook-signals.ts`, `cli/core/hook-runner.ts`, hidden `drwn hook` commands, README beta block, fixtures, and signal tests are present.
3. Decide the `fail` phase from evidence: ship it only with a real Skill-failure fixture and tests; otherwise keep it deferred.

### Phase S1 — Type widening + signal config builder
1. RED: unit test asserting `signalHooksConfig(bin)` produces the validated entries with absolute-path commands and correct phases/matchers. Include `fail` only if S0 validates it.
2. GREEN: widen `ClaudeHooksConfig`, add `ClaudeHookGroup`, implement `signalHooksConfig` + drwn-bin resolution.

### Phase S2 — Composition + coexistence through the writer
1. RED: integration test — enable signals + a card hook; `drwn write`; assert `PreToolUse` and `PostToolUse` each contain **both** a `.*` (composer) and a `Skill` (signal) entry, prompt/expansion signal events are present, and a pre-existing foreign hook is preserved. Assert `PostToolUseFailure` only if S0 validated `fail`. Then disable signals; `drwn write`; assert only signal entries are removed, composer + foreign intact.
2. GREEN: compose configs in `sync-hooks.ts` (concatenate per-event arrays); wire the `signals.enabled` gate.

### Phase S3 — Enablement, README, naming, live smoke
1. Add `hooks.signals.enabled` to the project-config schema + effective-state resolution; default-off test.
2. Replace the README "Claude Session Signals Beta" manual block with the enablement instruction.
3. Resolve the CLI naming overlap (analysis 73): introduce a distinct help category or rename so "policy hooks" (`drwn card … --hooks`) vs "signal hooks" (`drwn hook …`) read as separate concepts.
4. Re-run the design 41 §5a live smoke with auto-materialization. If a real Skill-failure payload is unobtainable, record that explicitly and leave `fail` unmaterialized.

## Execution gates
- **`fail` phase (F1)**: default to shipping the four validated entries; add `fail` only with a real Skill-failure fixture and tests.
- **Naming**: dedicated "Hooks" help category vs rename of one family.
- **Version skew hygiene**: check after merging PR #15. The current checkout has `DRWN_VERSION` and `package.json` both at `0.2.1`; PR #15 may reintroduce a package/version diff.
