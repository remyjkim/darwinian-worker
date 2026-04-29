# Write Command Subcommand Update Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every behavior change. Do not commit unless explicitly instructed.

**Goal:** Replace the ambiguous `apply` command vocabulary with the clearer `write` command vocabulary, so users understand the command writes the effective harness state into downstream local agent tool files.

**Architecture:** This is a public CLI surface rename, not a core engine rewrite. Keep the existing materialization engine in `cli/core/sync.ts` unless a later refactor renames internals. Replace public `bgng apply` and `bgng mcp apply` commands with `bgng write` and `bgng mcp write`. Update user-facing docs, tests, release checks, and next-step hints so `write` is the only public materialization verb.

**Tech Stack:** Bun, TypeScript, Clipanion, existing CLI command tests, docs-readiness tests, release-readiness tests.

---

## Product Decision

Use `write` as the canonical command name.

Meaning:

```text
bgng write = write the effective beginning-harness state into downstream local agent tool config
```

Direction:

```text
beginning-harness effective state -> local agent tool config and skill symlinks
```

The command does write local files unless `--dry-run` is used.

## Command Surface Target

Keep:

```bash
bgng write
bgng write --dry-run
bgng write --json
bgng write --target=claude
bgng write --mcp-only
bgng write --skills-only
bgng mcp write
bgng mcp write --dry-run
bgng mcp write --json
bgng mcp write --target=claude
```

Remove:

```bash
bgng apply
bgng mcp apply
```

Already removed by the prior task and should remain absent:

```bash
bgng sync
bgng mcp sync
bgng skills sync
```

Keep:

```bash
bgng scan
```

`scan` remains a placeholder for future non-mutating discovery.

## Rationale

`apply` is ambiguous because it does not say what is being applied or where. `write` is plainer:

- Users can infer that it mutates local files.
- `write --dry-run` reads naturally as "show what would be written."
- Re-running after `add`, `library defaults`, or project config changes is intuitive.
- It avoids the directional ambiguity of `sync`.
- It avoids the infrastructure implication of `deploy`.
- It avoids the persistent-state implication of `activate`.

## Non-Goals

- Do not implement scan behavior.
- Do not add back any `sync` commands.
- Do not rename internal core functions such as `syncRepository`, `syncMcp`, or `syncSkills` in this task unless required by type errors.
- Do not change the filesystem materialization behavior.
- Do not change project config schema.
- Do not change package name, binary name, or config paths.
- Do not commit unless explicitly instructed.

## Functional Equivalence Requirement

Every behavior currently covered by `apply` must remain available through `write`:

- full write of MCP and skills
- dry-run mode
- JSON output
- `--target=claude|codex|cursor`
- `--mcp-only`
- `--skills-only`
- project config discovery
- user defaults
- user MCP library
- package-backed skills
- extension-derived skills
- extension-derived MCP state
- stale downstream skill symlink warnings
- non-destructive backups for managed file replacement

## Files To Touch

Expected command files:

- Create: `cli/commands/write.ts`
- Create: `cli/commands/mcp/write.ts`
- Delete: `cli/commands/apply.ts`
- Delete: `cli/commands/mcp/apply.ts`
- Modify: `cli/index.ts`

Expected tests:

- Rename or replace: `test/commands-apply.test.ts` -> `test/commands-write.test.ts`
- Modify: `test/commands-mcp.test.ts`
- Modify: `test/commands-output-contracts.test.ts`
- Modify: `test/scenarios-user-journeys.test.ts`
- Modify: `test/cli-smoke.test.ts`
- Modify: `test/docs-readiness.test.ts`
- Modify: `test/package-readiness.test.ts` if package contents or command references require it

Expected docs:

- Modify: `README.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Modify: `.ai/knowledges/04_homebrew-release-checklist.md`
- Modify: any `.ai/analyses/*` living target architecture docs that describe the current command surface

Expected incidental comments:

- Update user-facing comments and ABOUTME text only where they mention `apply` as the public verb.
- Do not churn internal engine comments unless they would confuse future maintainers.

---

## Task 1: Write Failing Tests For The New Public Surface

**Files:**

- Modify: `test/cli-smoke.test.ts`
- Create or rename later: `test/commands-write.test.ts`
- Modify: `test/commands-mcp.test.ts`
- Modify: `test/commands-output-contracts.test.ts`

**Step 1: Update CLI help smoke test**

In `test/cli-smoke.test.ts`, update the command-surface test so it asserts:

```ts
expect(stdout).toContain("bgng write");
expect(stdout).toContain("bgng mcp write");
expect(stdout).not.toContain("bgng apply");
expect(stdout).not.toContain("bgng mcp apply");
expect(stdout).not.toContain("bgng sync");
expect(stdout).not.toContain("bgng mcp sync");
expect(stdout).not.toContain("bgng skills sync");
```

Keep the existing `scan` assertion.

**Step 2: Create failing write command tests**

Copy the existing `test/commands-apply.test.ts` behavior into `test/commands-write.test.ts`, but replace all command invocations and descriptions:

```ts
describe("bgng write", () => {
  test("dry-run reports planned writes", async () => {
    const result = await runAgentsCli(["write", "--dry-run"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Changes:");
  });
});
```

Coverage must include:

- `write --dry-run`
- `write --dry-run --json`
- `write --dry-run --target=claude`
- `write --dry-run --mcp-only`
- `write --mcp-only --skills-only` usage error
- global default skills through `write --dry-run`
- project skill excludes through `write --dry-run`
- project server disable overriding global defaults
- global default user MCP library entries
- project-enabled user MCP library entries

**Step 3: Update MCP command tests to expect mcp write**

In `test/commands-mcp.test.ts`, replace `mcp apply` invocations with `mcp write`.

Test names should say `write`, not `apply`.

Coverage must include:

- `mcp write --dry-run`
- `mcp write --dry-run --json`
- `mcp write --target=claude`
- project extension-derived MCP state

**Step 4: Update output contract tests**

In `test/commands-output-contracts.test.ts`, replace:

```ts
["apply", "--dry-run"]
["apply", "--dry-run", "--json"]
["mcp", "apply", "--dry-run"]
["mcp", "apply", "--dry-run", "--json"]
```

with:

```ts
["write", "--dry-run"]
["write", "--dry-run", "--json"]
["mcp", "write", "--dry-run"]
["mcp", "write", "--dry-run", "--json"]
```

**Step 5: Verify red**

Run:

```bash
bun test test/cli-smoke.test.ts test/commands-write.test.ts test/commands-mcp.test.ts test/commands-output-contracts.test.ts
```

Expected:

- Tests fail because `write` and `mcp write` do not exist yet.
- Help test fails because `apply` still appears.

Do not implement before observing this failure.

---

## Task 2: Implement `bgng write` And `bgng mcp write`

**Files:**

- Create: `cli/commands/write.ts`
- Create: `cli/commands/mcp/write.ts`
- Modify: `cli/index.ts`
- Delete: `cli/commands/apply.ts`
- Delete: `cli/commands/mcp/apply.ts`

**Step 1: Add top-level write command**

Create `cli/commands/write.ts` from the current `cli/commands/apply.ts` structure.

Class target:

```ts
export class WriteCommand extends BaseCommand {
  static override paths = [["write"]];
}
```

Usage description:

```ts
description: "Write effective bgng config to downstream local agent tools."
```

Options:

- `--dry-run`: preview writes without writing
- `--json`: emit machine-readable JSON
- `--mcp-only`: write only MCP configuration
- `--skills-only`: write only skills
- `--target`: limit write to one target

Implementation:

Keep the same `syncRepository(...)` call and option mapping used by `ApplyCommand`.

Usage error:

```ts
throw new UsageError("Use either --mcp-only or --skills-only, not both.");
```

Keep target validation unchanged.

**Step 2: Add MCP-scoped write command**

Create `cli/commands/mcp/write.ts` from the current `cli/commands/mcp/apply.ts` structure.

Class target:

```ts
export class McpWriteCommand extends BaseCommand {
  static override paths = [["mcp", "write"]];
}
```

Usage description:

```ts
description: "Write effective MCP configuration into enabled targets."
```

Implementation:

Keep the same `syncRepository({ mcpOnly: true, ... })` behavior from `McpApplyCommand`.

**Step 3: Register write commands**

In `cli/index.ts`:

- Remove imports for `ApplyCommand` and `McpApplyCommand`.
- Add imports for `WriteCommand` and `McpWriteCommand`.
- Register `McpWriteCommand`.
- Register `WriteCommand`.
- Do not register `ApplyCommand`.
- Do not register `McpApplyCommand`.

**Step 4: Delete apply command files**

Remove:

```bash
cli/commands/apply.ts
cli/commands/mcp/apply.ts
```

**Step 5: Verify green for command tests**

Run:

```bash
bun test test/cli-smoke.test.ts test/commands-write.test.ts test/commands-mcp.test.ts test/commands-output-contracts.test.ts
```

Expected:

- All targeted command tests pass.
- Help includes `bgng write` and `bgng mcp write`.
- Help does not include `bgng apply`, `bgng mcp apply`, or any sync commands.

---

## Task 3: Update User Journey And Integration Tests

**Files:**

- Modify: `test/scenarios-user-journeys.test.ts`
- Modify: `test/commands-skills-mutate.test.ts`
- Modify: `test/commands-doctor.test.ts`
- Modify: any test still invoking `apply`

**Step 1: Replace top-level apply invocations**

Replace:

```ts
runAgentsCli(["apply", ...], env)
```

with:

```ts
runAgentsCli(["write", ...], env)
```

Replace:

```ts
runAgentsCli(["apply", "--skills-only"], env)
```

with:

```ts
runAgentsCli(["write", "--skills-only"], env)
```

**Step 2: Update test names and variables**

Rename test descriptions:

- "apply a skill" -> "write a skill downstream"
- "ignored by apply" -> "ignored by write"
- "apply --skills-only" -> "write --skills-only"

Rename local variables when useful:

```ts
const applyResult
```

to:

```ts
const writeResult
```

**Step 3: Run affected tests**

Run:

```bash
bun test test/scenarios-user-journeys.test.ts test/commands-skills-mutate.test.ts test/commands-doctor.test.ts
```

Expected:

- All affected tests pass.

---

## Task 4: Update Docs And Knowledge Guides

**Files:**

- Modify: `README.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Modify: `.ai/knowledges/04_homebrew-release-checklist.md`
- Modify: `.ai/analyses/12_target-cli-ui-architecture.md`
- Modify: `.ai/analyses/13_library-defaults-config-target-architecture.md`
- Modify: `.ai/analyses/14_meta_harness_report.md` only if it names `apply` as the current public command

**Step 1: Update README command reference**

Replace:

```bash
bgng apply
bgng apply --dry-run
bgng apply --mcp-only
bgng apply --skills-only
bgng apply --target=claude
bgng mcp apply
```

with:

```bash
bgng write
bgng write --dry-run
bgng write --mcp-only
bgng write --skills-only
bgng write --target=claude
bgng mcp write
```

Update prose:

- "apply" -> "write" when referring to the public command
- "Apply commands support `--dry-run`" -> "Write commands support `--dry-run`"
- "How Apply Works" -> "How Write Works"
- "`bgng apply` materializes..." -> "`bgng write` writes..."

Preferred explanation:

```md
`bgng write` resolves the effective harness state, then writes it into downstream local agent tool config and skill directories. Use `--dry-run` to preview writes before mutating files.
```

**Step 2: Update usage guide**

In `.ai/knowledges/01_agents-cli-usage-guide.md`:

- Replace command examples with `write`.
- Rename "Apply Command" section to "Write Command".
- Explain that `write` is the one-way file-writing command.
- Replace "apply model" with "write model" only where it describes the CLI command.
- Keep generic English words "apply" only when they do not refer to the command.

**Step 3: Update per-project and bundle guides**

In `.ai/knowledges/02_per-project-config-guide.md`:

- Update affected command list to `bgng write` and `bgng mcp write`.
- Replace "downstream apply" with "downstream write" where it refers to command behavior.

In `.ai/knowledges/03_npm-skill-bundles-guide.md`:

- Replace `bgng apply` examples with `bgng write`.
- Replace "downstream apply" with "downstream write".

In `.ai/knowledges/04_homebrew-release-checklist.md`:

- Replace `bgng apply --dry-run` with `bgng write --dry-run`.

**Step 4: Update living architecture docs**

Search:

```bash
rg "bgng apply|mcp apply|apply --|Apply" .ai/analyses README.md .ai/knowledges docs
```

Update living target architecture docs that describe current/future command surfaces. Avoid mass-editing historical documents unless they are actively used as current docs.

**Step 5: Update docs-readiness tests**

In `test/docs-readiness.test.ts`, replace:

```ts
expect(doc).toContain("bgng apply");
```

with:

```ts
expect(doc).toContain("bgng write");
```

Add an assertion that current docs do not contain public apply examples if useful:

```ts
expect(readme).not.toContain("bgng apply");
expect(usageGuide).not.toContain("bgng apply");
```

**Step 6: Run docs tests**

Run:

```bash
bun test test/docs-readiness.test.ts
```

Expected:

- Docs readiness passes.

---

## Task 5: Update Add/Library Next-Step Hints

**Files:**

- Modify: `cli/commands/add/skill.ts`
- Modify: `cli/commands/add/mcp.ts`
- Modify: `cli/commands/add/extension.ts`
- Modify: `cli/commands/library/add/skill.ts`
- Modify: `cli/commands/library/defaults/add-skill.ts`
- Modify: `cli/commands/library/defaults/remove-skill.ts`
- Modify: `cli/commands/library/defaults/add-mcp.ts`
- Modify: `cli/commands/library/defaults/remove-mcp.ts`
- Modify tests if they assert next-step hints

**Step 1: Replace next-step hints**

Replace:

```ts
"bgng apply --dry-run"
```

with:

```ts
"bgng write --dry-run"
```

**Step 2: Search for remaining public apply hints**

Run:

```bash
rg "bgng apply|mcp apply|apply --dry-run" cli test README.md .ai/knowledges .ai/analyses docs
```

Expected:

- No current public command examples remain, except historical docs intentionally excluded from update.

**Step 3: Run command tests likely to cover hints**

Run:

```bash
bun test test/commands-add-skill.test.ts test/commands-add-mcp.test.ts test/commands-add-extension.test.ts test/commands-library-defaults.test.ts test/commands-library.test.ts
```

Expected:

- Tests pass.

---

## Task 6: Update Release And Package Readiness Checks

**Files:**

- Modify: `scripts/verify-release-readiness.ts`
- Modify: `test/package-readiness.test.ts`
- Modify: `test/cli-install-mode.test.ts` only if it mentions `apply`
- Modify: `test/homebrew-readiness.test.ts` only if docs assertions mention `apply`

**Step 1: Ensure package contents include write command files**

`npm pack --dry-run --json` should include:

```text
cli/commands/write.ts
cli/commands/mcp/write.ts
```

It should not include:

```text
cli/commands/apply.ts
cli/commands/mcp/apply.ts
cli/commands/sync.ts
cli/commands/mcp/sync.ts
cli/commands/skills/sync.ts
sync-mcp.ts
```

**Step 2: Add or update package readiness assertions**

In `test/package-readiness.test.ts`, update pack checks:

```ts
expect(paths).toContain("cli/commands/write.ts");
expect(paths).toContain("cli/commands/mcp/write.ts");
expect(paths).not.toContain("cli/commands/apply.ts");
expect(paths).not.toContain("cli/commands/mcp/apply.ts");
expect(paths).not.toContain("sync-mcp.ts");
```

**Step 3: Run package tests**

Run:

```bash
bun test test/package-readiness.test.ts test/homebrew-readiness.test.ts test/cli-install-mode.test.ts
```

Expected:

- Package and release readiness tests pass.

---

## Task 7: Full Search Sweep

**Files:**

- Any remaining docs/tests/commands found by search.

**Step 1: Search current public surfaces**

Run:

```bash
rg "bgng apply|bgng mcp apply|ApplyCommand|McpApplyCommand|commands/apply|mcp/apply" cli test README.md .ai/knowledges .ai/analyses docs package.json scripts
```

Expected:

- No current public command references remain.
- If historical `.ai` files retain old references, document why they are intentionally historical. Prefer updating living architecture docs.

**Step 2: Search write coverage**

Run:

```bash
rg "bgng write|bgng mcp write|WriteCommand|McpWriteCommand" cli test README.md .ai/knowledges docs
```

Expected:

- CLI command files, command registration, tests, README, and usage guide all reference `write`.

**Step 3: Search removed sync commands**

Run:

```bash
rg "bgng sync|bgng mcp sync|bgng skills sync|SyncCommand|McpSyncCommand|SkillsSyncCommand" cli test README.md .ai/knowledges docs package.json scripts
```

Expected:

- No current public sync command references remain.
- Low-level internal function names such as `syncRepository`, `syncMcp`, and `syncSkills` may remain.

---

## Task 8: Full Verification

**Files:**

- No new file edits unless verification fails.

**Step 1: Run full tests**

Run:

```bash
bun test
```

Expected:

- All tests pass.
- No skipped tests.

**Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected:

- Exit code 0.

**Step 3: Run release readiness**

Run:

```bash
bun run verify:release --json
```

Expected:

```json
{
  "ok": true,
  "warnings": []
}
```

**Step 4: Verify package contents**

Run:

```bash
npm pack --dry-run --json
```

Expected:

- Package includes `cli/commands/write.ts`.
- Package includes `cli/commands/mcp/write.ts`.
- Package does not include deleted apply/sync command files.
- Package does not include `.ai/`, `test/`, `.env`, or `sync-mcp.ts`.

**Step 5: Verify real CLI help and commands**

Run:

```bash
bun run bgng -- --help
bun run bgng -- write --dry-run
bun run bgng -- write --dry-run --json
bun run bgng -- mcp write --dry-run
bun run bgng -- scan
```

Expected:

- Help lists `bgng write`, `bgng mcp write`, and `bgng scan`.
- Help does not list `bgng apply`, `bgng mcp apply`, or any sync commands.
- `write --dry-run` exits 0.
- JSON output parses.
- `scan` remains non-mutating placeholder.

**Step 6: Verify removed commands fail**

Run:

```bash
bun run bgng -- apply --dry-run
bun run bgng -- mcp apply --dry-run
bun run bgng -- sync --dry-run
bun run bgng -- mcp sync --dry-run
bun run bgng -- skills sync --dry-run
```

Expected:

- Each exits non-zero with "Command not found" or equivalent Clipanion unknown command output.

**Step 7: Check whitespace**

Run:

```bash
git diff --check
```

Expected:

- No whitespace errors.

---

## Acceptance Criteria

- `bgng write` exists and behaves like the former `bgng apply`.
- `bgng mcp write` exists and behaves like the former `bgng mcp apply`.
- `bgng apply` is removed from help and exits non-zero.
- `bgng mcp apply` is removed from help and exits non-zero.
- `bgng sync`, `bgng mcp sync`, and `bgng skills sync` remain removed.
- `bgng scan` remains available as a non-mutating placeholder.
- README and knowledge docs use `write` as the materialization verb.
- User-facing next-step hints say `bgng write --dry-run`.
- Package contents include write command files and exclude removed command files.
- Full tests, typecheck, release readiness, npm pack dry-run, CLI smoke checks, and `git diff --check` pass.

## Commit Guidance

Do not commit unless explicitly instructed.

If later instructed to commit, a clean logical grouping would be:

1. `[feat:cli] rename materialization command to write`
   - command files
   - registration
   - command tests

2. `[doc:cli] document write command workflow`
   - README
   - knowledge docs
   - docs-readiness tests

3. `[test:release] align package checks with write command`
   - package readiness tests
   - release readiness updates

Use no language implying AI assistance in commit messages.
