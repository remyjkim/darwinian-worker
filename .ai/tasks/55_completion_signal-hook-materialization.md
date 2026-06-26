# ABOUTME: Completion summary for Task 55, session-signal hook materialization.
# ABOUTME: Records dependency sequencing, shipped wiring, verification, and deferred fail-phase work.

# Task 55 Completion: Session-Signal Hook Materialization

**Status**: Completed and merged
**Completed**: 2026-06-26
**PR**: [#18 Materialize Claude session signal hooks](https://github.com/remyjkim/darwinian-harness/pull/18)
**Merge commit**: `38e43a7`
**Implementation commit**: `67e3d5b`
**Dependencies merged first**: Task 54 / PR #17 (`dfbb6c8`), signal producer PR #15 (`ad0644a`)
**References**: [.ai/tasks/55_signal-hook-materialization-implementation-plan.md, .ai/tasks/41_card-embedded-session-signal-hooks-design.md, .ai/analyses/73_session-signal-vs-card-hooks-architecture-decision.md, README.md, cli/core/hook-generator/sync-signals.ts, cli/core/hook-generator/sync-hooks.ts, cli/core/types.ts, test/core-hook-signal-materialization.test.ts, test/cli-hook-write-e2e.test.ts]

## Summary

Task 55 made Claude session-signal hooks materialize through `drwn write` instead
of requiring users to hand-edit `.claude/settings.json`. The feature is opt-in and
default-off via project config:

```json
{
  "version": 1,
  "hooks": {
    "signals": { "enabled": true }
  }
}
```

When enabled, `drwn write` registers the four validated signal entries through the
Task 54 `_drwn.ownedHooks` writer. Signal entries coexist with card policy hook
composer entries under the same Claude `hooks` key, and foreign/user-authored hooks
are preserved.

## Relationship To PR #15

PR #15 was the signal producer work:

- hidden `drwn hook card-usage`;
- hidden `drwn hook skill-marker`;
- signal JSONL sidecar contract;
- Claude hook payload fixtures;
- README manual registration beta block;
- session discovery exclusion for `*.drwn-signals.jsonl`.

Task 55 is the materialization follow-up:

- automatically writes those signal hooks into `.claude/settings.json`;
- gates materialization with `hooks.signals.enabled`;
- uses Task 54's `_drwn.ownedHooks` writer;
- composes signal entries with card hook composer entries in `sync-hooks.ts`;
- removes the manual README registration block and replaces it with project-config enablement.

During PR preparation, #18 was first opened as a stack that included the producer dependency.
After #17 and #15 merged, #18 was rebased and force-updated so it carried only the Task 55
materialization commit on top of `main`.

## What Shipped

### Signal hook config builder

Added `cli/core/hook-generator/sync-signals.ts`:

- `resolveDrwnHookCommand()` resolves the current runtime invocation as:

```ts
{
  command: process.execPath,
  args: ["run", "<absolute path to cli/index.ts>"]
}
```

- `signalHooksConfig(drwnBin)` produces four Claude hook entries:
  - `UserPromptSubmit` -> `drwn hook card-usage`;
  - `UserPromptExpansion` -> `drwn hook skill-marker --phase expansion`;
  - `PreToolUse` with matcher `Skill` -> `drwn hook skill-marker --phase pre`;
  - `PostToolUse` with matcher `Skill` -> `drwn hook skill-marker --phase post`.

The generated command does not depend on a globally installed `drwn` binary. It uses the
running interpreter plus an absolute CLI entrypoint path, which keeps development checkouts
working.

### Project config gate

Extended `ProjectConfig.hooks` in `cli/core/types.ts`:

```ts
hooks?: {
  exclude?: string[];
  runtimes?: { ... };
  signals?: {
    enabled?: boolean;
  };
};
```

`signals.enabled` defaults to false. A project with no signal enablement writes no signal entries.

### Composition in `syncHooks`

Updated the Claude runtime branch in `cli/core/hook-generator/sync-hooks.ts`:

- reads `projectHookConfig` once from card-merged project config or project config;
- computes `signalsEnabled = projectHookConfig?.signals?.enabled === true`;
- builds one composed desired `ClaudeHooksConfig`;
- concatenates per-event arrays so card composer entries and signal entries both survive:
  - card composer uses matcher `.*`;
  - session signals use matcher `Skill` for tool events;
  - prompt events are matcher-less;
- creates `.claude/settings.json` for signal-only projects when signals are enabled;
- skips touching Claude settings when there are no card policies, no signals, and no owned hooks to clean.

### README and architecture docs

- Replaced the manual `.claude/settings.json` registration block in `README.md` with the project config enablement snippet.
- Updated `.ai/tasks/41_card-embedded-session-signal-hooks-design.md` to note that manual registration is superseded by Task 55 materialization.
- Updated `.ai/analyses/73_session-signal-vs-card-hooks-architecture-decision.md` with the final implemented decision.
- Updated `.ai/analyses/60_drwn-card-hooks-target-architecture.md` and `.ai/knowledges/10_drwn-cli-architecture.md` so the evergreen architecture references describe `ownedHooks`, signal materialization, and coexistence correctly.

### Version hygiene

- Bumped `DRWN_VERSION` to `0.2.2` so generated hook metadata matches the package version introduced by PR #15.
- Kept the `tsconfig.json` Bun types entry in a single stable location after PR #15 and Task 55 were combined.

## Files Changed

Production and docs:

- `README.md`
- `cli/core/hook-generator/sync-hooks.ts`
- `cli/core/hook-generator/sync-signals.ts`
- `cli/core/types.ts`
- `cli/core/version.ts`
- `tsconfig.json`
- `.ai/analyses/60_drwn-card-hooks-target-architecture.md`
- `.ai/analyses/73_session-signal-vs-card-hooks-architecture-decision.md`
- `.ai/knowledges/10_drwn-cli-architecture.md`
- `.ai/tasks/41_card-embedded-session-signal-hooks-design.md`
- `.ai/tasks/55_signal-hook-materialization-implementation-plan.md`

Tests:

- `test/core-hook-signal-materialization.test.ts`
- `test/cli-hook-write-e2e.test.ts`

## Traceability

| Success criterion | Implementation / test evidence |
| --- | --- |
| Enabled write registers four validated entries | `test/core-hook-signal-materialization.test.ts` and `drwn write materializes enabled session-signal hooks with absolute invocation`. |
| `PostToolUseFailure` not materialized without real Skill-failure evidence | `signalHooksConfig` omits `PostToolUseFailure`; tests assert it is undefined. |
| Signal entries coexist with card composer entries | `drwn write composes and removes session signals without disturbing card or foreign hooks`. |
| Absolute invocation, not bare `drwn` | `resolveDrwnHookCommand` unit test and CLI E2E assertion check absolute command and CLI entrypoint path. |
| Default-off behavior | `drwn write leaves session-signal hooks off by default`. |
| Disable cleanup preserves card and foreign hooks | CLI E2E disables signals and asserts only signal entries are removed. |
| README manual block removed | README now documents `hooks.signals.enabled` and `drwn write`. |

## Validation

Focused Task 55 verification after rebasing onto merged `main`:

```bash
bun test test/core-hook-signal-materialization.test.ts test/cli-hook-write-e2e.test.ts test/hook-signals.test.ts test/hook-runner.test.ts test/commands-hook.test.ts test/export-signal-exclusion.test.ts test/core-session-discovery.test.ts
bun run typecheck
```

Results:

- Focused regression: **85 pass, 0 fail**.
- Typecheck: clean.

Full clean-stack verification before opening and merging the PR stack:

```bash
bun test
```

Result:

- **891 pass, 1 skip, 0 fail**.

Real bash CLI smoke was run against isolated temp homes after the final rebase onto merged
`main`. It exercised the real CLI entrypoint:

```bash
bun run /Users/pureicis/dev/darwinian-harness/cli/index.ts write --json
bun run /Users/pureicis/dev/darwinian-harness/cli/index.ts write --mcp-only --json
```

The smoke covered:

- default-off: no `.claude/settings.json` created for signals;
- opt-in: `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse Skill`, and `PostToolUse Skill` materialized;
- no `PostToolUseFailure` entry;
- absolute Bun plus CLI entrypoint invocation;
- pre-existing foreign hook preserved;
- `--mcp-only` left signal hooks intact;
- disabling `hooks.signals.enabled` removed only owned signal entries.

## Merge Sequence

The final merge order was:

1. PR #17 / Task 54 -> `main` (`dfbb6c8`).
2. PR #15 / signal producer work -> `main` (`ad0644a`).
3. PR #18 / Task 55 materialization -> `main` (`38e43a7`).

After #17 and #15 landed, PR #18 was retargeted to `main` and reduced to a single Task 55
commit (`67e3d5b`). That left the final history with a clean conceptual boundary:

- PR #15 creates the signal producers.
- Task 55 wires those producers into `drwn write`.

## Deviations And Decisions

- `PostToolUseFailure` / `--phase fail` was not materialized. PR #15 includes a non-Skill failure fixture, and the signal producer can build `skill_failure`, but no real Claude Skill-failure hook payload was captured and validated. The materialized set therefore ships only the four validated entries.
- A generated wrapper script was not added. The MVP uses `process.execPath run <abs cli/index.ts>`, which matches the dev-checkout requirement without introducing another managed artifact.
- Codex signal hooks remain out of scope.
- The downstream consumers and export transport remain out of scope.
- The feature is default-off, matching the existing cautious pattern for optional hook runtimes.

## Deferred

- Capture and validate a real Claude Skill-failure hook payload. If it exists and matches the expected shape, add `PostToolUseFailure` -> `skill-marker --phase fail`.
- Consider a generated wrapper if absolute Bun plus CLI entrypoint proves fragile in packaged installs.
- Add Codex signal hooks only after a Codex-native signal contract exists.
- Build downstream session-to-card and skill attribution consumers.
- Add export transport for signal sidecars when the consumer contract is ready.
