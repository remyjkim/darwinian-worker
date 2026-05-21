# `bgng` CLI Help Gap Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Follow TDD (write the failing test first), commit after each task, and stop at every checkpoint.

**Goal:** Close the gaps surfaced in `.ai/analyses/27_cli_help_gap_analysis.md` so `bgng --help` and `bgng <cmd> --help` accurately reflect implemented behavior.

**Architecture:** Three classes of work in one branch:
1. **Correctness** — remove the orphaned `--project` flag from `search mcp` / `search skill`; close the `--json` parity gap on `skills curate` / `skills uncurate`; clarify the misleading `--include-skill` description.
2. **Description-line precision** — tighten the one-line `description` strings on commands whose help elides important behavior (auto-TTY guided mode, idempotent no-op branches, side effects, project-aware merges).
3. **Per-command help enrichment** — populate `usage.details` and `usage.examples` on every registered command using Clipanion's native fields (no wrapper changes needed — `BaseCommand` in `cli/commands/base.ts:7` is already a thin extension of `Command<AgentsContext>`).

Designed-but-unimplemented surfaces (analyzer family per analyses 21–22; Harness Cards family per analyses 25–26) are **out of scope** — they should ship as their own implementation plans when each family is built.

**Tech Stack:** TypeScript, Bun test runner, Clipanion CLI framework. All commands extend `BaseCommand`. Existing test pattern: `runAgentsCli([...args], env)` from `test/helpers.ts`, plus `Bun.spawn(["bun", "run", "cli/index.ts", ...])` for help-text smoke tests (see `test/cli-smoke.test.ts:10-37` for the existing precedent).

**Source of truth for findings:** `.ai/analyses/27_cli_help_gap_analysis.md`. Every fix below maps to a specific finding (§3.x or §5.x) in that report.

---

## Pre-flight

### Task 0: Prepare a clean execution branch or worktree and verify baseline

**Files:** None modified yet.

**Step 1: Confirm working directory and baseline test state**

Run:
```bash
cd /Users/pureicis/dev/beginning-harness
bun test 2>&1 | tail -20
```

Expected: existing test suite is green. If it is not, STOP and surface the failures to Remy before doing any of the work below. Do not stack help-surface work on an already-failing baseline.

**Step 2: Check for unrelated work**

```bash
git status --short --branch
```

Expected: the working tree is clean, or every existing change is known to belong to the same help-gap branch. If unrelated work is present, use a separate git worktree instead of mixing this plan into it:

```bash
git worktree add ../beginning-harness-cli-help-gap -b fix/cli-help-gap
cd ../beginning-harness-cli-help-gap
```

If the current checkout is already clean and you are intentionally working in place, create the branch with:

```bash
git switch -c fix/cli-help-gap
```

If this task file or `.ai/analyses/27_cli_help_gap_analysis.md` is untracked in the original checkout, make sure those files are available in the execution worktree before continuing. Do not commit `.ai/` files unless Remy explicitly asks for that.

**Step 3: Confirm the analysis report is in place**

```bash
ls .ai/analyses/27_cli_help_gap_analysis.md
```

Expected: file exists. This is the source of truth — every task below references it.

---

## Phase 1: Correctness fixes (do these first; they are atomic and unblock the rest)

### Task 1: Remove the orphaned `--project` flag from `search mcp` and `search skill`

**Maps to:** §3.3 of the analysis, recommendation §5.2 (option 2: remove).

**Background.** Both `cli/commands/search/mcp.ts:48-50` and `cli/commands/search/skill.ts:48-50` declare a `--project` boolean. Neither passes it to the underlying `searchMcp` / `searchSkills` call. The core `cli/core/search.ts:23-86` has no `project` parameter at all — there is **zero plumbing** to implement the ranking-hint behavior the flag advertises. Implementing it would be net-new feature work. Remove the flag rather than preserve a documented no-op.

**Files:**
- Modify: `cli/commands/search/mcp.ts:48-50` (remove `project` field).
- Modify: `cli/commands/search/skill.ts` (find and remove the equivalent `project` field).
- Modify: `test/commands-search.test.ts` (add a test asserting `--project` is rejected as an unknown flag).

**Step 1: Write the failing test**

Add to `test/commands-search.test.ts` (place inside the existing `describe("bgng search", ...)` block):

```ts
test("search mcp rejects the removed --project flag", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["search", "mcp", "alpha", "--project", "--json"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  // Clipanion writes unsupported-option diagnostics to stdout in this CLI.
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/unsupported|unknown|not allowed/i);
});

test("search skill rejects the removed --project flag", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["search", "skill", "alpha", "--project", "--json"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/unsupported|unknown|not allowed/i);
});
```

**Step 2: Run the new tests to confirm they fail**

```bash
bun test test/commands-search.test.ts -t "rejects the removed --project flag" 2>&1 | tail -20
```

Expected: both tests fail because `--project` is currently accepted.

**Step 3: Remove the flag from both command files**

In `cli/commands/search/mcp.ts`, delete lines 48–50:

```ts
  project = Option.Boolean("--project", false, {
    description: "Use current project context as a ranking hint.",
  });
```

In `cli/commands/search/skill.ts`, delete the analogous `project = Option.Boolean(...)` block (locate via `grep -n "project = Option" cli/commands/search/skill.ts`).

**Step 4: Run the new tests to confirm they pass**

```bash
bun test test/commands-search.test.ts -t "rejects the removed --project flag" 2>&1 | tail -20
```

Expected: both tests pass.

**Step 5: Run the full search test file to confirm no regressions**

```bash
bun test test/commands-search.test.ts 2>&1 | tail -20
```

Expected: every test in the file passes.

**Step 6: Commit**

```bash
git add cli/commands/search/mcp.ts cli/commands/search/skill.ts test/commands-search.test.ts
git commit -m "fix(cli): remove orphaned --project flag from search commands

The --project boolean was declared on \`search mcp\` and \`search skill\` but
never threaded into the underlying searchMcp/searchSkills call (cli/core/search.ts
has no project parameter). Drop the dead flag rather than ship a documented
no-op."
```

**Checkpoint:** Stop and let Remy review before moving on.

---

### Task 2: Fix the misleading `--include-skill` description on `extensions setup`

**Maps to:** §6 (out-of-scope observation #1 from the analysis — pulled into scope because the description is actively wrong if anyone reads it for a non-Beads extension).

**Background.** `cli/commands/extensions/setup.ts:51-53` describes `--include-skill` as "Include the beads-task-tracking skill in project config." The flag is class-level — also used by `add/extension.ts:43-46` — but the wording bakes in Beads specifics. Today only Beads consumes the flag; the description should make that scope explicit rather than name a single skill ID.

**Files:**
- Modify: `cli/commands/extensions/setup.ts:51-53`.
- Modify: `cli/commands/add/extension.ts:43-46` (check whether the same wording is duplicated; if so, fix in parallel).

**Step 1: Inspect the current wording in both files**

Run:
```bash
grep -n -A2 "include-skill" cli/commands/extensions/setup.ts cli/commands/add/extension.ts
```

Note both descriptions verbatim.

**Step 2: Write the failing test**

Add to `test/commands-extensions.test.ts` (find an existing `describe(...)` block for the setup command and place inside):

```ts
test("extensions setup --help describes --include-skill in extension-agnostic terms", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "extensions", "setup", "--help"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();

  expect(await proc.exited).toBe(0);
  // Description must say which extension's skill is included, but must not
  // hard-code "beads-task-tracking" as if it were a general label.
  expect(stdout).not.toContain("beads-task-tracking skill");
  expect(stdout).toMatch(/include.*beads.*project skill|beads extension.*skill|beads.*task tracking skill/i);
});
```

**Step 3: Run the test to confirm it fails**

```bash
bun test test/commands-extensions.test.ts -t "include-skill in extension-agnostic terms" 2>&1 | tail -20
```

Expected: fail because the current description contains the literal `beads-task-tracking skill`.

**Step 4: Rewrite the descriptions**

In `cli/commands/extensions/setup.ts:51-53`, replace with:

```ts
  includeSkill = Option.Boolean("--include-skill", false, {
    description: "Include the Beads project skill (beads task tracking) in project config. Beads only.",
  });
```

In `cli/commands/add/extension.ts:43-46`, apply the same wording.

**Step 5: Run the test to confirm it passes**

```bash
bun test test/commands-extensions.test.ts -t "include-skill in extension-agnostic terms" 2>&1 | tail -20
```

Expected: pass.

**Step 6: Run the full extensions test suite for regressions**

```bash
bun test test/commands-extensions.test.ts 2>&1 | tail -20
```

Expected: pass.

**Step 7: Commit**

```bash
git add cli/commands/extensions/setup.ts cli/commands/add/extension.ts test/commands-extensions.test.ts
git commit -m "fix(cli): make --include-skill description name its applicable extension

The flag is Beads-only today. The previous wording read as if 'beads-task-tracking'
were a generic concept; tighten to call out Beads explicitly so the help line is
correct for the only extension that consumes it."
```

**Checkpoint:** Stop and let Remy review.

---

### Task 3: Add `--json` parity to `skills curate` and `skills uncurate`

**Maps to:** §3.1 (worst-case subset) and recommendation §5.4. Choose option 1 (add `--json`) for consistency with every other mutating command in the CLI.

**Background.** `cli/commands/skills/curate.ts` and `cli/commands/skills/uncurate.ts` are the only mutating/listing commands without `--json` (top-level `init` remains intentionally prompt-oriented and out of scope). They have no flags at all today. Add `--json` and emit a minimal payload describing the action.

**Files:**
- Modify: `cli/commands/skills/curate.ts`.
- Modify: `cli/commands/skills/uncurate.ts`.
- Modify: `test/commands-skills-mutate.test.ts`.

**Step 1: Read the current shape of both commands**

Run:
```bash
cat cli/commands/skills/curate.ts cli/commands/skills/uncurate.ts
```

Note the existing import pattern used by sibling commands: from `cli/commands/skills/*.ts`, core imports use the repo-rooted relative form such as `"../../../cli/core/output"`.

**Step 2: Write the failing test**

Add to `test/commands-skills-mutate.test.ts`:

```ts
function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

test("skills curate --json emits a curatedPath payload", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["skills", "curate", "alpha", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { curatedPath: string };
  expect(typeof parsed.curatedPath).toBe("string");
  expect(parsed.curatedPath).toContain("alpha");
});

test("skills uncurate --json emits an uncuratedPath payload", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["skills", "uncurate", "alpha", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { uncuratedPath: string };
  expect(parsed.uncuratedPath).toContain("alpha");
});
```

If `commands-skills-mutate.test.ts` already has an equivalent `envFor` helper by the time this task is executed, reuse it instead of adding a duplicate.

**Step 3: Run the tests to confirm they fail**

```bash
bun test test/commands-skills-mutate.test.ts -t "--json emits" 2>&1 | tail -20
```

Expected: fail — `--json` is an unknown flag today.

**Step 4: Add `--json` and structured output to `skills curate`**

Replace `cli/commands/skills/curate.ts` body with:

```ts
import { Option, UsageError } from "clipanion";
import { curateSkill } from "../../../cli/core/skills";
import { renderJson } from "../../../cli/core/output";
import { BaseCommand } from "../base";

export class SkillsCurateCommand extends BaseCommand {
  static override paths = [["skills", "curate"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Curate a shared skill into the ~/.agents publication layer.",
  });

  skillName = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      const curatedPath = await curateSkill(
        {
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
        },
        this.skillName,
      );
      this.context.stdout.write(this.json ? renderJson({ curatedPath }) : `${curatedPath}\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
```

**Step 5: Mirror the change in `cli/commands/skills/uncurate.ts`**

Read the file first. The current `uncurateSkill()` helper returns `void`, so compute the path before calling it and emit that path deliberately:

```ts
import { Option, UsageError } from "clipanion";
import { join } from "node:path";
import { uncurateSkill } from "../../../cli/core/skills";
import { renderJson } from "../../../cli/core/output";
import { BaseCommand } from "../base";

export class SkillsUncurateCommand extends BaseCommand {
  static override paths = [["skills", "uncurate"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Remove a skill from the ~/.agents curated publication layer.",
  });

  skillName = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      const uncuratedPath = join(this.context.agentsDir, "skills", this.skillName);
      await uncurateSkill({ agentsDir: this.context.agentsDir }, this.skillName);
      this.context.stdout.write(this.json ? renderJson({ uncuratedPath }) : `${this.skillName}\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
```

**Step 6: Run the new tests to confirm they pass**

```bash
bun test test/commands-skills-mutate.test.ts -t "--json emits" 2>&1 | tail -20
```

Expected: pass.

**Step 7: Run the full skills test suite for regressions**

```bash
bun test test/commands-skills-mutate.test.ts test/commands-skills-list.test.ts test/commands-skills-packages.test.ts 2>&1 | tail -20
```

Expected: pass.

**Step 8: Commit**

```bash
git add cli/commands/skills/curate.ts cli/commands/skills/uncurate.ts test/commands-skills-mutate.test.ts
git commit -m "feat(cli): add --json parity to skills curate and uncurate

These were the only mutating/listing commands in the CLI without --json. Match the
machine-readable output contract the rest of that command surface already
honors."
```

**Checkpoint:** Stop and let Remy review.

---

## Phase 2: Description-line precision

These tasks edit only the `description:` strings on existing commands (and a small number of `Option.*` descriptions). They do not change behavior. Group into one task per command file to keep commits reviewable.

For every task in Phase 2, the testing pattern is the same:

1. Add a `describe("bgng <cmd> --help", ...)` block (or extend the existing one) in the command's test file.
2. Inside, spawn `bun cli/index.ts <cmd> --help` and assert the new description text appears in stdout.
3. Run the test (it fails), edit the command file, run the test (it passes), commit.

### Task 4: `init` — convey TTY auto-guidance and `.gitignore` warning

**Maps to:** §3.2 (`init` block).

**Files:**
- Modify: `cli/commands/init.ts:18-37`.
- Modify: `test/commands-init.test.ts`.

**Step 1: Write the failing test**

In `test/commands-init.test.ts`, add:

```ts
test("init --help mentions TTY auto-guidance and gitignore warning", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "init", "--help"], {
    stdout: "pipe", stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(stdout).toMatch(/TTY|interactive shell/i);
  expect(stdout).toMatch(/\.gitignore/);
});
```

**Step 2: Run to fail, then update the descriptions**

Update `usage.description`:
```ts
description: "Create per-project configuration. In a TTY this runs guided setup; --non-interactive and --minimal both write a bare config. Warns if .gitignore appears to exclude .agents.",
```

Update `--guided` description:
```ts
description: "Force guided interactive project setup (the default in a TTY; useful in non-TTY contexts like CI).",
```

**Step 3: Run to pass, commit**

```bash
git add cli/commands/init.ts test/commands-init.test.ts
git commit -m "fix(cli): clarify init --help — TTY default and gitignore warning"
```

---

### Task 5: `add mcp` — note interactive prompt, catalog fallback, idempotent no-op

**Maps to:** §3.2 (`add mcp` block).

**Files:**
- Modify: `cli/commands/add/mcp.ts:18-21`.
- Modify: `test/commands-add-mcp.test.ts`.

**Step 1: Write the failing test**

```ts
test("add mcp --help signals interactive prompt and idempotent re-add", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "add", "mcp", "--help"], {
    stdout: "pipe", stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(stdout).toMatch(/prompt|interactive|guided/i);
  expect(stdout).toMatch(/already.*default|already.*active|no-op|safe to re-run/i);
});
```

**Step 2: Update the description**

```ts
description: "Add an MCP server to the current project. Prompts in a TTY when no name is given; with --yes, falls back to an unambiguous catalog match. Re-adding a server that is already a global default is a safe no-op.",
```

**Step 3: Run to pass, commit**

```bash
git add cli/commands/add/mcp.ts test/commands-add-mcp.test.ts
git commit -m "fix(cli): clarify add mcp --help — interactive prompt and idempotent re-add"
```

---

### Task 6: `add skill` — note interactive prompt, catalog install, `--all` semantics

**Maps to:** §3.2 (`add skill` block).

**Files:**
- Modify: `cli/commands/add/skill.ts` (`usage.description` and `--all` description).
- Modify: `test/commands-add-skill.test.ts`.

**Step 1: Write the failing test**

```ts
test("add skill --help signals interactive prompt and bundle install via --all", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "add", "skill", "--help"], {
    stdout: "pipe", stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(stdout).toMatch(/prompt|interactive|guided/i);
  expect(stdout).toMatch(/--all/);
  expect(stdout).toMatch(/bundle/i);
});
```

**Step 2: Update descriptions**

`usage.description`:
```ts
description: "Add a skill to the current project. Prompts in a TTY when no name is given; with --yes, can install a missing skill bundle from the configured catalog.",
```

`--all` description:
```ts
description: "Add every skill from the installed catalog bundle (use with a bundle package name).",
```

**Step 3: Run to pass, commit**

```bash
git add cli/commands/add/skill.ts test/commands-add-skill.test.ts
git commit -m "fix(cli): clarify add skill --help — interactive prompt, --all bundle semantics"
```

---

### Task 7: `extensions setup` — call out per-extension flag applicability

**Maps to:** §3.2 (`extensions setup` block).

**Files:**
- Modify: `cli/commands/extensions/setup.ts:17-78` (`usage.description` plus the per-flag descriptions for `--target`, `--stealth`, `--skip-bd-init`, `--skip-bd-setup`, `--install`).
- Modify: `test/commands-extensions.test.ts`.

**Step 1: Write the failing test**

```ts
test("extensions setup --help calls out per-extension flag applicability", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "extensions", "setup", "--help"], {
    stdout: "pipe", stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  // Beads-only flags name Beads.
  expect(stdout).toMatch(/--target.*Beads only|Beads only.*--target/i);
  expect(stdout).toMatch(/--stealth.*Beads only|Beads only.*--stealth/i);
  // MarkItDown-only flag names MarkItDown.
  expect(stdout).toMatch(/--install.*MarkItDown only|MarkItDown only.*--install/i);
});
```

**Step 2: Update the description for each flag**

For `--target` (line 35-37): `"Comma-separated Beads setup targets. Beads only."`
For `--stealth` (line 39-41): `"Use Beads stealth setup mode where supported. Beads only."`
For `--skip-bd-init` (line 43-45): `"Skip the bd init step during Beads setup. Beads only."`
For `--skip-bd-setup` (line 47-49): `"Skip the bd setup step during Beads setup. Beads only."`
For `--install` (line 63-65): `"Install the extension CLI prerequisite when supported. Use --no-install to skip. MarkItDown only."`
For `--mcp` (line 55-57): keep generic — multiple extensions consume it.
For `--skip-skills` (line 59-61): keep generic.

Also update `usage.description` (line 19-21):
```ts
description: "Set up one extension. Behavior varies per extension: Beads runs external `bd` commands; MarkItDown can install its CLI via uv; Parallel only writes project config.",
```

**Step 3: Run to pass, commit**

```bash
git add cli/commands/extensions/setup.ts test/commands-extensions.test.ts
git commit -m "fix(cli): label per-extension flag applicability in extensions setup --help"
```

---

### Task 8: `extensions doctor`, `mcp list`, `library defaults add skill`, `library defaults add mcp`

Each of these gets a one-line description tightening, batched into one task to keep the plan manageable.

**Maps to:** §3.2 (last four blocks).

**Files:**
- Modify: `cli/commands/extensions/doctor.ts` (`usage.description`).
- Modify: `cli/commands/mcp/list.ts` (`usage.description`).
- Modify: `cli/commands/library/defaults/add-skill.ts` (`usage.description`).
- Modify: `cli/commands/library/defaults/add-mcp.ts` (`usage.description`).
- Modify: `test/commands-extensions.test.ts`, `test/commands-mcp.test.ts`, `test/commands-library-defaults.test.ts`.

**Step 1: Write the failing tests (one per command)**

`extensions doctor` test:
```ts
test("extensions doctor --help notes all-extensions fallback", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "extensions", "doctor", "--help"], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(stdout).toMatch(/all extensions|every extension/i);
});
```

`mcp list` test:
```ts
test("mcp list --help notes project-aware merge", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "mcp", "list", "--help"], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(stdout).toMatch(/project|overlay/i);
});
```

`library defaults add skill` test:
```ts
test("library defaults add skill --help calls out auto-curation side effect", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "library", "defaults", "add", "skill", "--help"], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(stdout).toMatch(/curate|publication/i);
});
```

`library defaults add mcp` test:
```ts
test("library defaults add mcp --help signals idempotent re-add", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "library", "defaults", "add", "mcp", "--help"], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(stdout).toMatch(/already.*default|no-op|safe to re-run/i);
});
```

**Step 2: Update each `usage.description`**

`extensions doctor`:
```ts
description: "Report extension issues without mutating anything. Reports on all extensions if no name is given.",
```

`mcp list`:
```ts
description: "List harness MCP servers and their current active state. Project-aware when run inside a configured repo.",
```

`library defaults add skill`:
```ts
description: "Add a shared-scope skill to machine-wide defaults and curate it into the ~/.agents publication layer (--dry-run skips the curation step).",
```

`library defaults add mcp`:
```ts
description: "Add an MCP server to machine-wide defaults. Re-adding an already-default server is a safe no-op.",
```

**Step 3: Run to pass, commit**

```bash
git add cli/commands/extensions/doctor.ts cli/commands/mcp/list.ts cli/commands/library/defaults/add-skill.ts cli/commands/library/defaults/add-mcp.ts test/commands-extensions.test.ts test/commands-mcp.test.ts test/commands-library-defaults.test.ts
git commit -m "fix(cli): tighten description lines on doctor, mcp list, defaults add"
```

**Checkpoint:** Stop and let Remy review Phase 2 as a whole.

---

## Phase 3: Per-command help enrichment (`usage.details` + `usage.examples`)

This is the bulk of the work. The pattern is uniform across all 32 registered non-built-in commands, so the plan documents it once (Task 9) and then enumerates the per-command content for the rest (Tasks 10–18). Each per-command task is small: add `details` and `examples` fields to the `BaseCommand.Usage({...})` call, add a help-output test that asserts both sections render, run, commit.

### Task 9: Establish the help-enrichment pattern with `init`

**Files:**
- Modify: `cli/commands/init.ts`.
- Modify: `test/commands-init.test.ts`.

**Background.** Clipanion's `Command.Usage()` accepts these fields natively:
- `category: string` — already used.
- `description: string` — already used.
- `details: string` — multi-paragraph; supports backtick code spans and `\`\`\`` fences.
- `examples: Array<[label: string, command: string]>` — rendered as the `Examples` section.

No changes needed to `cli/commands/base.ts` — `BaseCommand` already inherits the static `Usage` helper.

**Step 1: Write the failing test**

In `test/commands-init.test.ts`:

```ts
test("init --help renders Details and Examples sections", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "init", "--help"], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  // Clipanion renders plain section headers in this project.
  expect(stdout).toMatch(/^Details$/m);
  expect(stdout).toMatch(/^Examples$/m);
  // Concrete example signal — at least one bgng init invocation must be shown.
  expect(stdout).toContain("bgng init");
});
```

**Step 2: Run to confirm failure**

```bash
bun test test/commands-init.test.ts -t "Details and Examples" 2>&1 | tail -10
```

Expected: fail.

**Step 3: Expand the `usage` stanza in `cli/commands/init.ts`**

```ts
static override usage = BaseCommand.Usage({
  category: "General",
  description: "Create per-project configuration. In a TTY this runs guided setup; --non-interactive and --minimal both write a bare config. Warns if .gitignore appears to exclude .agents.",
  details: `
    Writes \`<project>/.agents/bgng/config.json\`.

    In an interactive terminal, runs a guided flow that asks about Parallel
    and Beads extensions and (conditionally) about MCP setup and downstream
    targets. Outside a TTY, falls back to a minimal \`{ "version": 1 }\` config.

    Use --force to overwrite an existing config; use --guided to force the
    interactive flow in a non-TTY context (e.g. when piping into bgng from a
    script).

    After running init, see \`bgng add extension\`, \`bgng add skill\`, and
    \`bgng add mcp\` for what to layer on next.
  `,
  examples: [
    ["First-time setup in a fresh repo", "bgng init"],
    ["Minimal config without prompts (CI-friendly)", "bgng init --non-interactive"],
    ["Re-run guided setup over an existing config", "bgng init --force --guided"],
  ],
});
```

**Step 4: Run to confirm pass**

```bash
bun test test/commands-init.test.ts -t "Details and Examples" 2>&1 | tail -10
```

Expected: pass.

**Step 5: Run the full init test file for regressions**

```bash
bun test test/commands-init.test.ts 2>&1 | tail -20
```

Expected: pass.

**Step 6: Commit**

```bash
git add cli/commands/init.ts test/commands-init.test.ts
git commit -m "feat(cli): add details and examples to bgng init --help

Establishes the per-command help-enrichment pattern. Subsequent commits
apply the same shape to the remaining 31 commands."
```

**Checkpoint:** Stop. Let Remy review the template before applying it across the rest of the CLI.

---

### Task 10: General commands — `write`, `doctor`, `status`, `scan`

For each, follow the Task 9 pattern: failing test (assert plain `Details` + `Examples` section headers + at least one expected command in the examples), implement, run, commit.

**Per-command content guidance:**

**`bgng write`** (`cli/commands/write.ts`):
- Details: "Reads the effective config (merge of machine defaults + project overlay + per-extension config) and materializes it into the enabled downstream targets' files (e.g. `.claude/settings.json`, `.codex/config.toml`, `.cursor/mcp.json`). Use `--dry-run` to preview the diff without writing. `--mcp-only` and `--skills-only` scope the materialization."
- Examples: `["Preview the write", "bgng write --dry-run"]`, `["Write only MCP config", "bgng write --mcp-only"]`, `["Write only to claude", "bgng write --target=claude"]`.

**`bgng doctor`** (`cli/commands/doctor.ts`):
- Details: "Inspects the local harness state for drift, stale write-records, broken symlinks, and configuration mismatches. Read-only — never mutates. Renders issues in the report and currently exits 0 for reportable drift; use the JSON payload in automation if you need to gate on issue count. For extension-specific diagnostics, see `bgng extensions doctor`."
- Examples: `["Run a quick health check", "bgng doctor"]`, `["Use in CI", "bgng doctor --json | jq ."]`.

**`bgng status`** (`cli/commands/status.ts`):
- Details: "Prints the current repo root, aggregation source (machine config + project overlay), active downstream targets, and counts of skills and MCP servers in effect. Read-only."
- Examples: `["Quick status snapshot", "bgng status"]`, `["JSON for tooling", "bgng status --json"]`.

**`bgng scan`** (`cli/commands/scan.ts`):
- Details: "Placeholder for a future non-mutating local harness discovery command. Today it does nothing useful — the implementation will inspect existing local agent tool config and report candidates for library / default / project promotion."
- Examples: include a single `["Today this is a no-op", "bgng scan"]` so the global help-shape guard can require examples for every command.

**Test pattern (repeat per command):** assert plain `Details` + `Examples` sections render in the per-command help, and assert one of the example commands appears verbatim in stdout. Commit each command individually so the diff stays reviewable.

**Suggested commits:**
- `feat(cli): add details and examples to bgng write --help`
- `feat(cli): add details and examples to bgng doctor --help`
- `feat(cli): add details and examples to bgng status --help`
- `feat(cli): add details and examples to bgng scan --help`

**Checkpoint after Task 10:** Stop. Let Remy review.

---

### Task 11: Add commands — `add extension`, `add mcp`, `add skill`

Same pattern. Per-command content:

**`bgng add extension`** (`cli/commands/add/extension.ts`):
- Details: "Adds an extension to the current project by writing/merging the extension's config into `<project>/.agents/bgng/config.json`. Use `bgng extensions setup <name>` first to install any CLI prerequisites; `bgng add extension` then enables the extension in this project. Some flags apply only to specific extensions (e.g. `--target` and `--include-skill` for Beads)."
- Examples: `["Enable Parallel in the current project", "bgng add extension parallel"]`, `["Enable Beads with the project skill", "bgng add extension beads --include-skill"]`, `["Preview the change", "bgng add extension markitdown --dry-run"]`.

**`bgng add mcp`** (`cli/commands/add/mcp.ts`):
- Details: "Activates a known MCP server in the current project without mutating global defaults. Looks up the server in the local library first; with `--yes`, falls back to an unambiguous catalog match. In a TTY, prompts for the server name if none is given. Re-adding a server that is already active by global default is a safe no-op."
- Examples: `["Add a library server", "bgng add mcp context7"]`, `["Add an unambiguous catalog server", "bgng add mcp github --yes"]`, `["Preview without writing", "bgng add mcp playwright --dry-run"]`.

**`bgng add skill`** (`cli/commands/add/skill.ts`):
- Details: "Adds a skill to the current project. Looks in the local library first; with `--yes`, can install a missing skill bundle from the configured catalog before activating it. Use `--all` with a bundle name to add every skill the bundle ships."
- Examples: `["Add a library skill", "bgng add skill systematic-debugging"]`, `["Install a bundle and add one skill", "bgng add skill @acme/skill-bundle/foo --yes"]`, `["Install a bundle and add all its skills", "bgng add skill @acme/skill-bundle --yes --all"]`.

**Suggested commits:** one per command.

---

### Task 12: Extensions commands — `extensions list`, `extensions show`, `extensions status`, `extensions doctor`, `extensions setup`

Per-command content:

**`bgng extensions list`** — Details: "Lists the registered extension families. Read-only." Examples: a single `["List supported extensions", "bgng extensions list"]`.

**`bgng extensions show <name>`** — Details: "Shows one extension family's metadata: id, description, scopes, default modes, external command prerequisites, associated skills, MCP servers, and docs links." Examples: `["Show Beads metadata", "bgng extensions show beads"]`, `["Machine-readable", "bgng extensions show parallel --json"]`.

**`bgng extensions status`** — Details: "Shows whether each extension is enabled in the current project and whether its prerequisites are present. Read-only. Reports on all extensions if no name is given." Examples: `["All extensions", "bgng extensions status"]`, `["One extension", "bgng extensions status markitdown"]`.

**`bgng extensions doctor`** — Details: "Inspects the extension's prerequisites and project state for drift. Read-only. Reports on all extensions if no name is given. For overall harness drift, see `bgng doctor`." Examples: `["All extensions", "bgng extensions doctor"]`, `["One extension, JSON", "bgng extensions doctor beads --json"]`.

**`bgng extensions setup <name>`** — Details: "Sets up one extension. The behavior varies per extension. Beads: runs `bd init` and `bd setup` against the project (control with `--stealth`, `--skip-bd-init`, `--skip-bd-setup`, `--target`) and optionally adds the Beads project skill (`--include-skill`). MarkItDown: detects whether the `markitdown` CLI is on PATH and can install it via `uv` (`--install` approves install without prompting; `--no-install` skips install). Parallel: writes project config only — no external CLI involved." Examples: `["Preview Beads setup", "bgng extensions setup beads --dry-run"]`, `["Set up Beads stealth-mode with the project skill", "bgng extensions setup beads --stealth --include-skill"]`, `["Set up MarkItDown and install the CLI without prompting", "bgng extensions setup markitdown --install"]`.

**Suggested commits:** one per command.

---

### Task 13: Library commands — `library list`, `library show`, `library add skill`, `library add mcp`

**`bgng library list`** — Details: "Lists items in the local reusable inventory at `~/.agents/`. Optionally filtered by `kind` (`skill` or `mcp`)." Examples: `["All library items", "bgng library list"]`, `["Only MCP servers", "bgng library list mcp"]`.

**`bgng library show <id>`** — Details: "Shows one item from the local library." Examples: `["Show a skill", "bgng library show systematic-debugging"]`, `["JSON", "bgng library show github --json"]`.

**`bgng library add skill <packageSpec>`** — Details: "Adds a skill bundle (npm package or local path) to the local library by running the same ingestion path used during catalog install. Does not activate it in any project — see `bgng add skill`." Examples: `["From npm", "bgng library add skill @acme/skill-bundle"]`, `["From a local tarball", "bgng library add skill ./bundle.tgz"]`.

**`bgng library add mcp <spec>`** — Details: "Adds an MCP server (or a multi-server file) to the local library. The optional `--as` selects the server when the spec contains more than one and registers it under that id. `--replace` overwrites an existing library entry with the same id." Examples: `["Single-server spec", "bgng library add mcp ./github-mcp.json"]`, `["Select one server from a multi-server file", "bgng library add mcp ./registry.json --as github"]`, `["Overwrite an existing entry", "bgng library add mcp ./github-mcp.json --replace"]`.

**Suggested commits:** one per command.

---

### Task 14: Library defaults commands — `library defaults list`, `library defaults add mcp`, `library defaults add skill`, `library defaults remove mcp`, `library defaults remove skill`

**`bgng library defaults list`** — Details: "Lists machine-wide default skills and MCP servers (the items every project gets unless overridden)." Example: `["Show the defaults", "bgng library defaults list"]`.

**`bgng library defaults add mcp <serverName>`** — Details: "Promotes an MCP server to machine-wide defaults. Re-adding a server that is already a default is a safe no-op. Use `--dry-run` to preview." Examples: `["Add a default", "bgng library defaults add mcp context7"]`, `["Preview", "bgng library defaults add mcp github --dry-run"]`.

**`bgng library defaults add skill <skillName>`** — Details: "Promotes a shared-scope skill to machine-wide defaults and curates it into `~/.agents/skills/`. Rejects non-shared-scope skills. Use `--dry-run` to skip the curation side effect." Examples: `["Add a default", "bgng library defaults add skill systematic-debugging"]`, `["Preview", "bgng library defaults add skill brainstorming --dry-run"]`.

**`bgng library defaults remove mcp <serverName>`** — Details: "Removes an MCP server from machine-wide defaults. Does not touch projects that have explicitly added the server." Example: `["Remove a default", "bgng library defaults remove mcp playwright"]`.

**`bgng library defaults remove skill <skillName>`** — Details: "Removes a skill from machine-wide defaults and uncurates it from `~/.agents/skills/`." Example: `["Remove a default", "bgng library defaults remove skill brainstorming"]`.

**Suggested commits:** one per command.

---

### Task 15: MCP commands — `mcp list`, `mcp write`

**`bgng mcp list`** — Details: "Lists harness MCP servers (built-in registry merged with the user library) and shows which are active in the current state. Project-aware when run inside a configured repo." Examples: `["List active MCP servers", "bgng mcp list"]`, `["JSON for tooling", "bgng mcp list --json"]`.

**`bgng mcp write`** — Details: "Writes only the effective MCP configuration into the enabled downstream targets. Equivalent to `bgng write --mcp-only`. Use `--dry-run` to preview." Examples: `["Preview", "bgng mcp write --dry-run"]`, `["Write to claude only", "bgng mcp write --target=claude"]`.

**Suggested commits:** one per command.

---

### Task 16: Search commands — `search mcp`, `search skill`

**`bgng search mcp <query>`** — Details: "Searches the local MCP library and configured online catalogs. Use `--library` or `--catalog` (mutually exclusive) to restrict the source. Returns ranked matches with their source group." Examples: `["Search everywhere", "bgng search mcp github"]`, `["Local only", "bgng search mcp playwright --library"]`, `["JSON for tooling", "bgng search mcp postgres --json"]`.

**`bgng search skill <query>`** — Details: "Searches the local skill library and configured npm-skill catalogs. Use `--library` or `--catalog` (mutually exclusive) to restrict the source." Examples: `["Search everywhere", "bgng search skill debug"]`, `["Catalog only", "bgng search skill brainstorm --catalog"]`.

**Suggested commits:** one per command.

---

### Task 17: Skills commands — `skills list`, `skills curate`, `skills uncurate`, `skills packages add`, `skills packages list`, `skills packages show`

**`bgng skills list`** — Details: "Lists every skill the repo knows about with its scope and whether it is currently curated into `~/.agents/skills/`." Examples: `["List skills", "bgng skills list"]`, `["JSON for tooling", "bgng skills list --json"]`.

**`bgng skills curate <skillName>`** — Details: "Publishes a shared-scope skill into `~/.agents/skills/` by symlinking from the repo. Idempotent. To remove, see `bgng skills uncurate`." Examples: `["Curate a skill", "bgng skills curate systematic-debugging"]`, `["JSON output", "bgng skills curate systematic-debugging --json"]`.

**`bgng skills uncurate <skillName>`** — Details: "Removes a skill's symlink from `~/.agents/skills/`. Does not touch the repo source." Examples: `["Uncurate a skill", "bgng skills uncurate brainstorming"]`, `["JSON output", "bgng skills uncurate brainstorming --json"]`.

**`bgng skills packages add <packageSpec>`** — Details: "Installs a package-backed skill bundle into the managed local cache. The bundle then becomes addable via `bgng add skill`." Examples: `["From npm", "bgng skills packages add @acme/skill-bundle"]`, `["From a local tarball", "bgng skills packages add ./bundle.tgz"]`.

**`bgng skills packages list`** — Details: "Lists installed package-backed skill bundles." Example: `["List bundles", "bgng skills packages list"]`.

**`bgng skills packages show <packageName>`** — Details: "Shows one installed bundle's metadata and the skills it ships." Example: `["Show a bundle", "bgng skills packages show @acme/skill-bundle"]`.

**Suggested commits:** one per command.

---

### Task 18: Final sweep — verify every command has `Details` and `Examples`

This is a single test that protects against future regressions.

**Files:**
- Create: `test/cli-help-shape.test.ts`.

**Step 1: Write the test**

```ts
// ABOUTME: Asserts every registered bgng command renders Details and Examples sections in --help.
// ABOUTME: Protects against future commands shipping with threadbare help.

import { describe, expect, test } from "bun:test";

async function helpFor(args: string[]) {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", ...args, "--help"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

function extractCommandPaths(topLevelHelp: string) {
  return topLevelHelp
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("bgng "))
    .map((line) =>
      line
        .replace(/^bgng\s+/, "")
        .split(/\s+/)
        .filter((part) => !part.startsWith("[") && !part.startsWith("<")),
    )
    .filter((path) => path.length > 0);
}

describe("every command has Details and Examples in --help", () => {
  test("registered commands expose rich per-command help", async () => {
    const topLevel = await helpFor([]);
    expect(topLevel.exitCode).toBe(0);

    const commands = extractCommandPaths(topLevel.stdout);
    expect(commands.length).toBeGreaterThan(0);

    for (const cmd of commands) {
      const result = await helpFor(cmd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^Details$/m);
      expect(result.stdout).toMatch(/^Examples$/m);
    }
  });
});
```

**Step 2: Run the test**

```bash
bun test test/cli-help-shape.test.ts 2>&1 | tail -40
```

Expected: every command passes. If any command fails, it means an earlier task missed it — return to that task and add the missing fields before moving on.

**Step 3: Commit**

```bash
git add test/cli-help-shape.test.ts
git commit -m "test(cli): assert every command renders Details and Examples in --help

Regression guard: any new command added to cli/index.ts must also populate
usage.details and usage.examples, otherwise this suite fails."
```

**Checkpoint:** Stop. Phase 3 done.

---

## Phase 4: Final verification

### Task 19: Full test suite, doctor self-check, and README cross-reference

**Step 1: Full test suite**

```bash
bun test 2>&1 | tail -20
```

Expected: green.

**Step 2: Manual sanity check on the top-level help**

```bash
bun cli/index.ts --help 2>&1 | head -80
```

Expected: each command's one-line description matches the updated copy from Phase 2. No analyzer/cards commands appear.

**Step 3: Manual sanity check on a sample per-command help**

```bash
bun cli/index.ts init --help
bun cli/index.ts extensions setup --help
bun cli/index.ts add mcp --help
```

Expected: each shows `Details` and `Examples` sections, and the examples are syntactically valid for the documented command. Do not require examples that depend on external tools (for example `bd`, `uv`, `markitdown`) to execute successfully during this smoke check.

**Step 4: Confirm the README still aligns**

Skim `README.md` for any text that contradicts the new help output (e.g. examples that use the removed `--project` flag). Update the README in the same branch if found, in a separate commit:

```bash
git add README.md
git commit -m "docs: drop reference to removed search --project flag"
```

**Step 5: Push the branch and open a PR**

Only on Remy's go-ahead. See `.ai/rules/01_git.md` — never push without explicit instruction.

---

## Out of Scope (Tracked Elsewhere)

These items from the analysis report are intentionally not addressed here:

| Item | Why deferred | Track in |
|---|---|---|
| Analyzer family (`analyze`, `login`, `logout`, `whoami`) | Designed but unimplemented; needs its own implementation plan | `.ai/analyses/22_analyzer_cli_implementation_plan.md` already exists |
| Harness Cards family (`card *`, `store *`, `apply`, `update`) | Designed but unimplemented; large surface area | Target architecture lives at `.ai/analyses/26_harness-cards-target-architecture.md`; implementation plan still TBD |
| `library add mcp --as` dual-purpose wording | The wording is correct today; refactor decision can wait until a second use case appears | None — captured in §6 of `.ai/analyses/27_cli_help_gap_analysis.md` |
| `BaseCommand.Usage` wrapper enrichment | Unnecessary — Clipanion's native `Command.Usage` already supports `details` and `examples` | None — captured in §6 of `.ai/analyses/27_cli_help_gap_analysis.md` |

---

## Risk and Rollback Notes

- **Phase 1 risk:** removing `--project` is a public-surface change. If any external script depends on the flag (unlikely — it never worked), the regression is a non-zero exit. The fix is to add the flag back as a no-op deprecation shim, but **do not pre-empt this** unless Remy confirms a real consumer.
- **Phase 2 risk:** description-line edits change `--help` text only. Help-output tests in this plan are intentionally fuzzy (regex matches on keywords) to allow small wording adjustments without test churn.
- **Phase 3 risk:** the `usage.details` strings use template literals with backticks. If Clipanion strips backtick rendering, the help text still reads correctly; no behavior changes.
- **Rollback:** every task lands in its own commit, so partial rollback is a `git revert <sha>` per task.
