# ABOUTME: Completion summary for `drwn write --root` test coverage hardening (task 51).
# ABOUTME: Records the 1:1 traceability between the task-49 plan's 9-scenario contract and the actual bun:test cases.

# Task 51 Completion: `drwn write --root` Test Coverage Hardening

**Completed**: 2026-06-24
**Scope completed**: must-have tests (M1, M2, M3a, M3b) closing strict task-49 plan gaps; should-have tests (S1, S2a/b/c, S3, S4, S5) anchoring implementation behaviors that shipped in task 49 but lacked scenario-level tests
**Scope deferred**: nice-to-haves N1 (skills-at-root path), N2 (legacy managed-fields fall-through), N3 (backup-proliferation behavior) — see "Deferred" section

## What Shipped

- Augmented `test/scenarios-scope-isolation.test.ts` to assert that a project-scope write leaves `~/.claude.json` (the user-scope MCP file) byte-identical, not just `~/.claude/settings.json`. Closes task-49 plan Scenario 4 — "Coexistence: project write doesn't touch ~/.claude.json" — in its semantically-correct home.
- Added 9 new test cases to `test/scenarios-root-scope.test.ts` covering:
  - Claude Code re-serialization resilience (canonical-hash order independence at e2e level).
  - `--root` / `--user` CLI flag composition: mutual exclusion contract, alias equivalence.
  - `--root --dry-run` planning without writes or write-record persistence.
  - `--root --target=<tool>` filter for claude / codex / cursor (three separate tests).
  - Empty-defaults-with-prior-ownership: warn-and-skip path is correctly bypassed when prior MCP ownership exists in the write-record, so removal cleanup still runs across both Claude and Codex.
  - Atomic-write `.tmp` cleanup as a synthetic proxy for write atomicity (full SIGKILL test remains deferred but the .tmp absence asserts the rename completed).
- Added 1 new test case to `test/commands-write-codex-drift.test.ts` covering Codex per-server removal symmetry — the equivalent of the existing Claude per-server removal test, driven through `--root`.

**Test count math**: 794 baseline + 10 new = **804 pass** (plus pre-existing 1 skipped, 8 failing). All 8 failures are unrelated loose-skill / `installSkillBundleRoot` / `ingestLooseSkill` tests from a parallel work-in-progress branch state.

## Files Updated

- `test/scenarios-scope-isolation.test.ts` (+2 LOC: M1 augmentation)
- `test/scenarios-root-scope.test.ts` (+~175 LOC: 9 new tests)
- `test/commands-write-codex-drift.test.ts` (+~40 LOC: S3 new test)
- `.ai/tasks/51_completion_drwn-write-root-test-hardening.md` (this doc)

**No production code changes** (`git diff --stat HEAD -- 'cli/**'` is empty).

## Traceability: task-49 plan scenarios → actual test cases

| # | Plan scenario | Test name | File |
| --- | --- | --- | --- |
| 1 | Surgical add | `write --root surgically adds default MCPs to user-scope tool configs` | `test/scenarios-root-scope.test.ts` |
| 2 | Drift detection + recovery | `write --root detects drift only for drwn-owned MCP server entries` | `test/scenarios-root-scope.test.ts` |
| 3 | Removal | `write --root removes the last drwn-owned MCP entry without touching hand-managed siblings` | `test/scenarios-root-scope.test.ts` |
| 4 | Coexistence — project doesn't touch `~/.claude.json` | `project write targets project-local agent files and leaves home files unchanged` (augmented assertion added) | `test/scenarios-scope-isolation.test.ts` |
| 5 | Project unaffected by `--root` | `write --root ignores project config and leaves project MCP files untouched` | `test/scenarios-root-scope.test.ts` |
| 6 | Hooks regression | Covered by existing `cli-hook-write-e2e.test.ts` + `core-mcp-merge-hooks.test.ts` after task 49's return-shape update | (multiple) |
| 7 | Empty defaults no-op | `write --root with no machine MCP defaults leaves user-scope MCP files unchanged` | `test/scenarios-root-scope.test.ts` |
| 8 | Claude Code rewrite resilience | `write --root does not flag drift after ~/.claude.json is re-serialized with different key ordering` | `test/scenarios-root-scope.test.ts` |
| 9 | Hand-managed sibling edit ignored | `write --root detects drift only for drwn-owned MCP server entries` (embedded with #2 — the `manual` sibling is edited freely without triggering drift) | `test/scenarios-root-scope.test.ts` |

Every plan scenario now has a named, passing test behind it. Scenarios 2 and 9 are combined in the same test because the per-server ownership semantics make the distinction artificial — the test asserts both (hand-edit on owned `context7` → drift error; hand-edit on unowned sibling `manual` → no drift).

## Implementation-behavior coverage (S1–S5)

These were not in the original task-49 plan but were anchored as part of the 2026-06-24 review:

| ID | Behavior | Test name | File |
| --- | --- | --- | --- |
| S1 | `--root --dry-run` plans without writing | `write --root --dry-run produces a plan but does not modify any user-scope file` | `test/scenarios-root-scope.test.ts` |
| S2a | `--root --target=claude` filter | `write --root --target=claude writes only ~/.claude.json` | `test/scenarios-root-scope.test.ts` |
| S2b | `--root --target=codex` filter | `write --root --target=codex writes only ~/.codex/config.toml` | `test/scenarios-root-scope.test.ts` |
| S2c | `--root --target=cursor` filter | `write --root --target=cursor writes only ~/.cursor/mcp.json` | `test/scenarios-root-scope.test.ts` |
| S3 | Codex per-server removal via `--root` | `write --root removes a Codex MCP entry when the default is removed and leaves user-authored servers intact` | `test/commands-write-codex-drift.test.ts` |
| S4 | Empty-defaults bypass when prior ownership exists | `write --root with empty defaults but prior ownership prunes without emitting the no-defaults warning` | `test/scenarios-root-scope.test.ts` |
| S5 | Atomic-write `.tmp` cleanup | `write --root leaves no orphaned .tmp files after a successful write` | `test/scenarios-root-scope.test.ts` |

Plus 2 CLI-surface tests (M3a, M3b) that ensure `--root` and `--user` are mutually exclusive and that `--user` is a true alias for `--root`. These were called out in the must-have set because the implementation enforces the mutual-exclusion contract in `cli/commands/write.ts:73-75` and adding `--user` as an alias was an explicit design choice; both deserved scenario-level assertion.

## Validation

Commands run:

```bash
bun test test/scenarios-root-scope.test.ts test/scenarios-scope-isolation.test.ts test/commands-write-codex-drift.test.ts
bun run typecheck
bun test
git diff --stat HEAD -- 'cli/**'
```

Results:

- **Target test-file suite**: `19 pass`, `0 fail` (15 in `scenarios-root-scope` + 1 in `scenarios-scope-isolation` + 3 in `commands-write-codex-drift`).
- **Typecheck**: 5 pre-existing errors in `test/core-skill-packages.test.ts` from the parallel loose-skill WIP. **Zero new errors** introduced by this task.
- **Full suite**: `804 pass / 1 skip / 8 fail` (up from `794 pass / 1 skip / 8 fail` baseline). The 10-test delta exactly matches the 10 tests added. All 8 failures are pre-existing loose-skill failures unrelated to `--root`.
- **Production code diff**: empty. No file under `cli/**` was modified.

## Baseline Note

The expected baseline in the task 51 plan was `781 pass / 1 skip / 0 fail` (matching task 49's completion). The actual baseline at task 51 execution time was `794 pass / 1 skip / 8 fail` due to a parallel WIP — task 49's loose-skill-addition feature (`.ai/tasks/49_drwn-loose-skill-addition-implementation-plan.md`) being implemented concurrently with uncommitted changes to ~22 files. Key WIP impacts on the codebase at the time of this task:

- `cli/core/sync.ts`: adds `computeOptionalMcpReport` call at top of `syncRepository`, producing a new `result.optionalMcpReport` field. Does not affect `--root` behavior — purely informational.
- `cli/commands/write.ts`: appends `renderOptionalMcpReport(result.optionalMcpReport)` to the non-JSON output path. New tests use `--json`, so no interaction.
- `cli/core/types.ts`, `cli/core/output.ts`, `cli/core/effective-state.ts`: minor type/renderer/state additions for the optional-MCP-report feature.
- Other modified files (commands/add/mcp, card/project-command, docs, multiple test files) are loose-skill or doc-update territory.

The 6 existing `scenarios-root-scope.test.ts` tests, 2 existing `commands-write-codex-drift.test.ts` tests, and 1 existing `scenarios-scope-isolation.test.ts` test all pass cleanly on top of the WIP. The new tests interact only with the `--root` surface, which the WIP does not touch behaviorally.

## Real CLI Smoke

Deliberately not performed against the real `~/.claude.json` / `~/.codex/config.toml` / `~/.cursor/mcp.json`. Task 49's completion already validated the real-CLI behavior against a disposable temp home; this task is test-only and runs purely against `scaffoldCliFixture`-built temp roots. The new tests collectively exercise:

- The CLI entrypoint (`runAgentsCli` spawns `bun run cli/index.ts` as a real subprocess for every test case).
- The full `syncRepository` → `syncMcp` orchestration with the `--root`-driven `forceMachineScope = true` path.
- The side-table write record at `~/.agents/drwn/global-write-record.json` (verified read + written contents per test).
- The atomic-write contract at `writeManagedFile` (no `.tmp` orphans).
- The clipanion `UsageError` flow for mutual-exclusion.

Every test runs as a fresh subprocess against a fresh temp home — no real-machine state is touched, no flakiness from shared state.

## Deferred

Three nice-to-haves from the 2026-06-24 review remain explicitly deferred:

- **N1 — Skills-at-root path**: skills already symlink to `~/.claude/skills/` and `~/.codex/skills/` via the auto-machine-scope path; the `--skills-only` composition with `--root` is not separately tested. Adding `~25 LOC` of test code would assert the path explicitly. Worth doing if the skills slice is ever edited; not blocking.
- **N2 — Legacy managed-fields fall-through**: a pre-task-49 write-record could contain a `.claude/settings.json` `managed-fields` entry with `fields: ["mcpServers", "hooks"]` and `fieldHashes: {}`. The cleanup path correctly falls through to the catch-all warning, but no test exercises this path because no live user has such records (the prior `fieldHashes: {}` state never enabled drift checking). Defensive test worth adding if an upgrade-path task ever lands.
- **N3 — Backup-proliferation behavior**: Risk 6 in task 49 noted that `~/.claude.json.bak`, `.bak.1`, `.bak.2`, ... accumulate. No test asserts current behavior because asserting "we keep growing the chain" would lock in something we'd have to change when a cap-at-N is implemented.

All three would add modest LOC and orthogonal coverage; none are correctness gaps in the current implementation.

## Constraints Honored

- No `claude mcp add`, `codex mcp add`, or direct edit of any real user-scope file. Tests run entirely against `scaffoldCliFixture` temp roots.
- No Git commit was created (per Remy's instruction).
- No Git worktree was created (per Remy's instruction).
- No production code under `cli/**` was modified (verified by `git diff --stat HEAD -- 'cli/**'` returning empty).
- Test additions follow the existing fixture/helper patterns (`runAgentsCli`, `scaffoldCliFixture`, `envFor`) — no new test infrastructure was introduced.
