# Task 19: Harness Cards Phase M6-M7 Scope And Diagnostics Handoff

**Status**: Ready After M5, With External Verification Gate
**Created**: 2026-05-20
**Updated**: 2026-05-20
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 2 PRs plus release prep
**Dependencies**: M5 complete; Claude/Codex/Cursor project-read verification complete before M6
**References**: [tasks/14_harness-cards-implementation-plan.md, tasks/18_harness-cards-phase-m4-m5-card-lifecycle-handoff.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/30_bgng-cli-usage-guide-cards-v1.md, knowledges/02_per-project-config-guide.md, cli/core/paths.ts, cli/core/sync.ts, cli/core/diagnostics.ts, cli/commands/status.ts, cli/commands/doctor.ts]

---

## Objective

Complete the user-visible cards rollout: project-local materialization, scoped generated files, explicit legacy orphan cleanup, extended diagnostics, `--explain`, `--why`, and release documentation.

---

## Scope

This document covers:

- **M6:** project-vs-machine materialization scope, scope isolation tests, scoped Cursor generated files, fresh project target-file creation, legacy orphan cleanup, per-project config knowledge update.
- **M7:** diagnostics section builders, cards/store/write-record sections, `--explain`, `--why`, release docs and usage guide update.

---

## M6 Entry Gate

Before coding M6, resolve the architecture's open read-semantics question.

Create or update:

```text
.ai/knowledges/02_per-project-config-guide.md
```

Record empirical findings for:

- Claude Code reading `<project>/.claude/skills/` and `<project>/.claude/settings.json`
- Codex reading `<project>/.codex/skills/` and `<project>/.codex/config.toml`
- Cursor reading `<project>/.cursor/mcp.json`

If a tool does not read project-local state as assumed:

1. Stop M6.
2. Record the mismatch.
3. Choose one of:
   - adapt M6 while preserving the architecture's user-visible goal
   - revise architecture and plan
   - defer M6 and ship M0-M5 as partial v1

Do not silently implement project-local writes against unverified tool behavior.

---

## M6 Work Plan

### M6.1 Tool Scope Type

Modify:

```text
cli/core/paths.ts
```

Add:

```ts
export type ToolScope =
  | { kind: "project"; projectRoot: string }
  | { kind: "machine"; homeDir: string };
```

Refactor:

```ts
resolveToolPaths(scope: ToolScope)
```

Project scope root: `projectRoot`.

Machine scope root: `homeDir`.

### M6.2 Propagate Scope Through Write

Modify:

```text
cli/core/sync.ts
cli/core/skills.ts
cli/core/mcp.ts
```

Behavior:

- detect project scope from `projectConfigPath`
- pass `ToolScope` or resolved `toolPaths` through all materialization functions
- keep machine scope behavior unchanged outside projects
- ensure write-record path matches scope

### M6.3 Fresh Project File Creation

Project writes must create missing parents and files:

```text
<project>/.claude/settings.json
<project>/.codex/config.toml
<project>/.cursor/mcp.json
```

Use empty defaults when files do not exist:

- JSON: `{}` plus newline
- TOML: empty text

### M6.4 Cursor Generated Path

Project scope:

```text
<project>/.agents/bgng/generated/cursor-mcp.json
<project>/.cursor/mcp.json -> <project>/.agents/bgng/generated/cursor-mcp.json
```

Machine scope:

```text
~/.agents/bgng/generated/cursor-mcp.json
~/.cursor/mcp.json -> ~/.agents/bgng/generated/cursor-mcp.json
```

### M6.5 Diagnostics Scope Awareness

Modify:

```text
cli/core/diagnostics.ts
```

All symlink scans and drift checks must use the same `ToolScope` as write.

### M6.6 Legacy Orphan Cleanup

Complete:

```bash
bgng store migrate --cleanup-legacy-orphans
```

Cleanup candidates:

- symlinks under `~/.claude/skills/`
- symlinks under `~/.codex/skills/`
- targets resolving into the migration archive
- targets resolving into the new store

Do not delete:

- regular files
- directories
- symlinks that do not resolve into bgng-owned locations
- repo-native skill symlinks unless a separately documented flag exists

### M6.7 Tests

Add:

```text
test/scenarios-scope-isolation.test.ts
```

Minimum coverage:

- project write creates `<project>/.claude/skills/...`
- project write does not touch `~/.claude/skills/...`
- machine write outside project writes to home scope
- fresh project creates missing Claude/Codex/Cursor files
- Cursor symlink points to project generated file in project scope
- Cursor symlink points to store generated file in machine scope
- write-record paths remain scope-relative
- idempotency holds after scope refactor
- legacy orphan cleanup removes only bgng-owned symlinks

### M6.8 Documentation

Update:

```text
.ai/knowledges/02_per-project-config-guide.md
.ai/analyses/30_bgng-cli-usage-guide-cards-v1.md
```

The knowledge doc should record verified read semantics. The usage guide should reflect any implementation adjustment discovered during verification.

### M6 Exit Checks

Run:

```bash
bun test test/scenarios-scope-isolation.test.ts
bun test test/scenarios-idempotency.test.ts
bun test
bun run typecheck
```

---

## M7 Work Plan

### M7.1 Diagnostics Section Builders

Refactor:

```text
cli/core/diagnostics.ts
```

Into section builders:

- machine
- project
- store
- write-record
- skills
- mcp
- extensions
- cards
- targets

Preserve default human output shape where practical. M0 snapshot tests are the regression net.

### M7.2 Cards, Store, Write-record Sections

Add sections that report:

Cards:

- configured refs
- locked versions
- integrity status
- deprecated warnings
- bundle conflicts or resolution warnings

Store:

- store path
- schema version
- card count
- source count
- skill bundle count
- MCP definition count
- legacy layout warning if applicable

Write-record:

- present/missing/corrupt
- managed path count
- drift summary
- last write time and harness version

### M7.3 Explain Trails

Add:

```bash
bgng status --explain
bgng card status --explain
```

Explain output should show enough provenance to answer:

- which card or overlay introduced a skill
- which layer supplied an MCP definition
- why an extension is enabled
- why a target is enabled or disabled
- which write-record entry owns a path

### M7.4 Why Queries

Add:

```bash
bgng status --why skill:<name>
bgng status --why server:<name>
bgng status --why extension:<name>
bgng status --why target:<name>
bgng status --why card:<name>
bgng status --why <bare-name>
```

Bare-name behavior:

- if exactly one match exists, print it
- if multiple matches exist, exit non-zero with disambiguation hints
- if none exists, exit non-zero with "not found"

### M7.5 Doctor Output

Extend:

```bash
bgng doctor
bgng doctor --json
```

Doctor must include cards, store, and write-record health, but remain report-only.

### M7.6 Docs And Release Prep

Update:

```text
README.md
.ai/analyses/30_bgng-cli-usage-guide-cards-v1.md
```

The usage guide is currently forward-looking. At M7 it must be checked against the implemented command surface and marked Final or updated with any deviations.

If the release process requires it, update changelog/release notes with:

- project-local materialization behavior change
- drift refusal
- `bgng add extension` removal
- explicit store migration
- cards command surface

### M7 Tests

Add:

```text
test/core-diagnostics-sections.test.ts
test/commands-status-why.test.ts
```

Minimum coverage:

- status report composes all sections
- cards section reports lockfile and warnings
- store section reports schema/counts
- write-record section reports missing/corrupt/present
- `--why skill:name` works
- `--why server:name` works
- bare `--why` succeeds when unique
- bare `--why` fails when ambiguous
- `--explain` includes provenance for cards, skills, servers, targets
- `doctor --json` includes cards/store/write-record sections

### M7 Exit Checks

Run:

```bash
bun test test/core-diagnostics-sections.test.ts test/commands-status-why.test.ts
bun test
bun run typecheck
bun run verify:release
```

---

## Known Phase Risks

| Risk | Mitigation |
|---|---|
| Downstream tools do not read project-local files | M6 entry gate requires empirical verification before coding. |
| Scope refactor accidentally writes both home and project paths | Scope isolation tests in both directions. |
| Legacy orphan cleanup deletes too much | Only delete symlinks resolving into archive/store; test regular files and unrelated symlinks. |
| Diagnostics refactor changes existing output unexpectedly | Preserve M0 baseline tests; add section tests. |
| Usage guide drifts from implementation | M7 release prep explicitly reconciles `30_*` with code. |

---

## Handoff Exit Criteria

M7 is handoff-complete when:

- project-local materialization is verified and implemented
- home-scope and project-scope writes are isolated
- legacy orphan cleanup is explicit and safe
- status/doctor include card/store/write-record health
- `--explain` and `--why` work with ambiguity handling
- README and the cards-era usage guide match the implemented CLI
- `bun test`, `bun run typecheck`, and `bun run verify:release` pass
