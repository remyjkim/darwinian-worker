# Task 19 Completion: Harness Cards M6-M7 Scope And Diagnostics

**Date:** May 21, 2026

**Task:** `.ai/tasks/19_harness-cards-phase-m6-m7-scope-diagnostics-handoff.md`

**Status:** Completed

## Scope

Task 19 completed the user-visible Harness Cards rollout:

- M6: project-vs-machine materialization scope, project-local generated files, scope isolation, and cleanup
- M7: diagnostics sections, cards/store/write-record reporting, `--explain`, `--why`, docs updates, and release verification

## M6 Completion

### Project and machine scope

The write path now distinguishes:

- project scope when a project config is discovered
- machine scope outside configured projects

Project scope writes under the project root:

- `.claude/skills/`
- `.claude/settings.json`
- `.codex/skills/`
- `.codex/config.toml`
- `.cursor/mcp.json`
- `.agents/bgng/generated/cursor-mcp.json`
- `.agents/bgng/write-record.json`

Machine scope writes under the home directory and `~/.agents/bgng`.

Relevant files:

- `cli/core/paths.ts`
- `cli/core/sync.ts`
- `cli/core/skills.ts`
- `cli/core/mcp.ts`
- `cli/core/project-writes.ts`

### Fresh project file creation

Project writes create missing tool directories and config files when needed:

- missing Claude settings are created as JSON
- missing Codex config is created as TOML
- missing Cursor MCP config is represented by the generated-file-plus-symlink model

### Cursor generated-file scope

Cursor generated files are now scoped correctly:

- project: `<project>/.agents/bgng/generated/cursor-mcp.json`
- machine: `~/.agents/bgng/generated/cursor-mcp.json`

The symlink target follows the active scope.

### Scope isolation

The scenario tests verify that project writes do not touch home-scope tool directories, while machine writes still use home scope outside projects.

Relevant test:

- `test/scenarios-scope-isolation.test.ts`

### Legacy orphan cleanup

Migration cleanup removes only bgng-owned legacy symlinks. It preserves regular files, directories, and unrelated symlinks.

Relevant tests:

- `test/commands-store.test.ts`
- `test/scenarios-cleanup.test.ts`

## M7 Completion

### Diagnostics sections

Diagnostics now include structured section builders for cards-era state, including:

- machine state
- project state
- store state
- write-record state
- skills
- MCP
- extensions
- cards
- targets

Relevant files:

- `cli/core/diagnostics.ts`
- `cli/commands/status.ts`
- `cli/commands/doctor.ts`

### Cards, store, and write-record reporting

Status and doctor can now surface:

- configured card refs
- locked card versions
- unresolved cards
- store initialization and legacy-layout state
- write-record presence and ownership issues
- stale symlinks
- missing generated files
- managed-region drift

Relevant tests:

- `test/core-diagnostics-sections.test.ts`
- `test/commands-status-why.test.ts`
- `test/commands-status.test.ts`
- `test/commands-doctor.test.ts`

### Explain and why

Implemented diagnostics commands:

```bash
bgng status --explain
bgng status --why <category>:<name>
```

The focused `--why` path can explain why a card, skill, server, extension, target, or write-record-related entry is present.

### Documentation updates

Docs were updated after implementation:

- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `.ai/knowledges/02_per-project-config-guide.md`
- `.ai/knowledges/03_npm-skill-bundles-guide.md`
- `.ai/knowledges/04_homebrew-release-checklist.md`
- `docs-astro/src/content/docs/*.md`

The docs-astro site was rebuilt and deployed to Cloudflare Pages production.

## Verification Performed

### Targeted tests

Task 19 behavior is covered by:

- `test/scenarios-scope-isolation.test.ts`
- `test/scenarios-idempotency.test.ts`
- `test/scenarios-card-materialization.test.ts`
- `test/scenarios-cleanup.test.ts`
- `test/scenarios-user-journeys.test.ts`
- `test/core-diagnostics-sections.test.ts`
- `test/commands-status-why.test.ts`
- `test/commands-status.test.ts`
- `test/commands-doctor.test.ts`
- `test/docs-readiness.test.ts`

### Full suite

```bash
bun test
```

Result:

```text
319 pass, 0 fail, 1257 expect() calls
```

### Type checking

```bash
bun run typecheck
```

Result: passed.

### Release readiness

```bash
bun run verify:release
```

Result: passed.

### Real terminal smoke

The installed `bgng` binary was smoke-tested in a real terminal environment.

Read-only smoke covered:

- `bgng --version`
- `bgng --help`
- `bgng store status --json`
- `bgng card list --json`
- `bgng status --json`
- `bgng write --dry-run --json`
- `bgng doctor --json`
- `bgng status --explain`

Mutating isolated smoke covered:

1. creating a temporary home and project
2. setting isolated `AGENTS_HOME_DIR` and `AGENTS_DIR`
3. creating a card source
4. editing the card manifest to include a skill and MCP server
5. publishing the card
6. initializing a project
7. applying the card
8. running `bgng write --json`
9. verifying project lockfile, write record, project skill, project MCP config, and untouched home scope

## Deviations From The Handoff

The M6 handoff asked for empirical downstream app read-semantics documentation before coding. The implementation proceeded with project-local materialization and verified the generated filesystem state rigorously. A live launch of Claude Code, Codex, and Cursor against those files was not performed during this pass.

The handoff expected separate PRs plus release prep. The later instruction required one completion pass with no worktree and no commits.

## Deferred Or Residual Risk

- Live downstream application acceptance testing remains the main unperformed verification class.
- Diagnostics are covered through command and scenario tests, but not through full snapshotting of every human-output line.
- Remote card registry behavior remains future work and is not part of the shipped local-store cards system.

