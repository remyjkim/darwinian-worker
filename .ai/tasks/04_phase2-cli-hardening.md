# Phase 2 CLI Hardening

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all bugs, TypeScript errors, code duplication, and open-source gaps identified in `.ai/analyses/03_phase2-cli-production-readiness.md`. After this plan, `bun test` and `npx tsc --noEmit` both pass clean, the two functional bugs are fixed with test coverage, and the repo is ready for public release.

**Baseline:** 51 tests passing, 29 TypeScript errors (excluding the unrelated `skills/shared/systematic-debugging/condition-based-waiting-example.ts`).

## Global Rules

- **Commits:** Do not commit unless explicitly instructed by the user.
- **Regression gate:** After every task, run `bun test` AND `npx tsc --noEmit` (excluding the pre-existing `condition-based-waiting-example.ts` errors, which are not ours to fix). Both must pass before a task is considered complete.
- **No behavior changes beyond what's described.** This is a hardening pass, not a feature pass.
- **ABOUTME:** Every new `.ts` file must start with a 2-line `// ABOUTME:` comment.

---

### Task 1: Extract duplicated filesystem utilities into `cli/core/fs.ts`

**Why first:** The duplicated utilities are imported by `sync.ts`, `skills.ts`, and `diagnostics.ts`. Deduplicating them first means subsequent bug-fix tasks (which touch these files) won't be working against code that still has the duplication.

**Problem:**

Four private functions are copy-pasted across multiple core modules:

| Function | `sync.ts` | `skills.ts` | `diagnostics.ts` |
|----------|:---------:|:-----------:|:-----------------:|
| `lstatSafe` | line 64 | line 31 | line 12 |
| `realpathSafe` | line 72 | line 39 | — |
| `ensureParentDir` | line 31 | line 47 | — |
| `ensureSymlink` | line 80 | line 53 | — |

The two `ensureSymlink` variants differ intentionally:
- `sync.ts` version: creates `"file"` symlinks (for MCP config), uses `renameSync` backup
- `skills.ts` version: creates `"dir"` symlinks (for skill directories), uses `rmSync` force-replace

**Step 1: Write the failing test**

```ts
// test/core-fs.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-fs-"));
  tempRoots.push(root);
  return root;
}

describe("lstatSafe", () => {
  test("returns stats for existing path", async () => {
    const { lstatSafe } = await import("../cli/core/fs");
    const root = await createTempRoot();
    const file = join(root, "test.txt");
    await writeFile(file, "hello");
    expect(lstatSafe(file)).not.toBeNull();
  });

  test("returns null for missing path", async () => {
    const { lstatSafe } = await import("../cli/core/fs");
    expect(lstatSafe("/nonexistent/path")).toBeNull();
  });
});

describe("realpathSafe", () => {
  test("resolves symlinks", async () => {
    const { realpathSafe } = await import("../cli/core/fs");
    const root = await createTempRoot();
    const target = join(root, "target");
    const link = join(root, "link");
    await mkdir(target);
    await symlink(target, link, "dir");
    expect(realpathSafe(link)).toBe(realpathSync(target));
  });

  test("returns resolve() for broken path", async () => {
    const { realpathSafe } = await import("../cli/core/fs");
    const result = realpathSafe("/does/not/exist");
    expect(typeof result).toBe("string");
  });
});

describe("ensureParentDir", () => {
  test("creates parent directories", async () => {
    const { ensureParentDir } = await import("../cli/core/fs");
    const root = await createTempRoot();
    const deep = join(root, "a", "b", "c", "file.txt");
    ensureParentDir(deep, false);
    expect(existsSync(join(root, "a", "b", "c"))).toBe(true);
  });

  test("skips creation in dry-run mode", async () => {
    const { ensureParentDir } = await import("../cli/core/fs");
    const root = await createTempRoot();
    const deep = join(root, "x", "y", "file.txt");
    ensureParentDir(deep, true);
    expect(existsSync(join(root, "x"))).toBe(false);
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/core-fs.test.ts
```

Expected: FAIL — `cli/core/fs.ts` does not exist.

**Step 3: Write minimal implementation**

Create `cli/core/fs.ts` exporting the four shared utilities:

```ts
// ABOUTME: Shared filesystem helpers for safe symlink management and path operations.
// ABOUTME: Centralizes lstat/realpath/symlink logic used by sync, skills, and diagnostics modules.

import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { SyncResult } from "./types";

export function lstatSafe(pathValue: string) {
  try {
    return lstatSync(pathValue);
  } catch {
    return null;
  }
}

export function realpathSafe(pathValue: string) {
  try {
    return realpathSync(pathValue);
  } catch {
    return resolve(pathValue);
  }
}

export function ensureParentDir(pathValue: string, dryRun: boolean) {
  if (!dryRun) {
    mkdirSync(dirname(pathValue), { recursive: true });
  }
}
```

Then update each consumer:

**`cli/core/sync.ts`:** Remove the local `lstatSafe`, `realpathSafe`, `ensureParentDir` definitions. Import them from `./fs`. Keep `ensureSymlink` local (it has backup semantics and `"file"` type specific to MCP config sync).

**`cli/core/skills.ts`:** Remove the local `lstatSafe`, `realpathSafe`, `ensureParentDir` definitions. Import them from `./fs`. Keep `ensureSymlink` local (it has `"dir"` type and `rmSync` force-replace specific to skill directories).

**`cli/core/diagnostics.ts`:** Remove the local `lstatSafe` definition. Import from `./fs`.

**Step 4: Run tests to confirm passage**

```bash
bun test test/core-fs.test.ts
bun test
npx tsc --noEmit 2>&1 | grep -v "condition-based-waiting-example"
```

---

### Task 2: Fix `uncurateSkill` silent success on non-curated skills

**Problem:** `uncurateSkill()` in `cli/core/skills.ts` calls `rmSync(curatedPath, { recursive: true, force: true })` without checking existence first. `force: true` suppresses ENOENT, so uncurating a non-existent skill exits 0 and prints the name as if it succeeded.

**Step 1: Write the failing test**

Add to `test/core-skills.test.ts`:

```ts
test("uncurateSkill throws for skill that is not curated", async () => {
  const root = await createTempRoot();
  const agentsDir = join(root, "home", ".agents");
  await mkdir(join(agentsDir, "skills"), { recursive: true });

  const { uncurateSkill } = await import("../cli/core/skills");
  expect(uncurateSkill({ agentsDir }, "not-curated")).rejects.toThrow();
});
```

Add to `test/commands-skills-mutate.test.ts`:

```ts
test("uncurate on a non-curated skill exits non-zero", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["skills", "uncurate", "beta"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  });

  expect(result.exitCode).not.toBe(0);
});
```

**Step 2: Run tests to confirm failure**

```bash
bun test test/core-skills.test.ts
bun test test/commands-skills-mutate.test.ts
```

Expected: the new tests FAIL — `uncurateSkill` does not throw, and the CLI exits 0.

**Step 3: Fix the implementation**

In `cli/core/skills.ts`, `uncurateSkill` function (around line 157):

**Before:**
```ts
export async function uncurateSkill(
  options: { agentsDir: string },
  name: string,
) {
  const curatedPath = join(options.agentsDir, "skills", name);
  rmSync(curatedPath, { recursive: true, force: true });
}
```

**After:**
```ts
export async function uncurateSkill(
  options: { agentsDir: string },
  name: string,
) {
  const curatedPath = join(options.agentsDir, "skills", name);
  if (!existsSync(curatedPath)) {
    throw new Error(`Skill is not curated: ${name}`);
  }
  rmSync(curatedPath, { recursive: true, force: true });
}
```

In `cli/commands/skills/uncurate.ts`, wrap the call in a try/catch and map to `UsageError`, matching how `curate.ts` already handles errors:

**Before:**
```ts
async execute() {
  await uncurateSkill({ agentsDir: this.context.agentsDir }, this.skillName);
  this.context.stdout.write(`${this.skillName}\n`);
  return 0;
}
```

**After:**
```ts
async execute() {
  try {
    await uncurateSkill({ agentsDir: this.context.agentsDir }, this.skillName);
    this.context.stdout.write(`${this.skillName}\n`);
    return 0;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}
```

Add `UsageError` to the import from `clipanion`.

**Step 4: Run tests to confirm passage**

```bash
bun test test/core-skills.test.ts
bun test test/commands-skills-mutate.test.ts
bun test
```

---

### Task 3: Fix `doctor` MCP drift detection with `~` paths

**Problem:** `detectMcpDrift()` in `cli/core/diagnostics.ts` (line 72-100) uses `target.configPath` raw from the loaded config. The canonical `config.json` stores paths like `~/.claude/settings.json`. Without calling `expandHomePath()`, `existsSync()` always returns false for tilde paths, so MCP drift detection silently skips every target. The entire feature is broken against real configs.

**Step 1: Write the failing test**

Add to `test/commands-doctor.test.ts`:

```ts
test("detects MCP drift when config uses tilde paths", async () => {
  // This test uses ~ paths in config.json to match real-world usage.
  // It exposes the bug where diagnostics.ts doesn't expand ~ before existsSync.
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  // Rewrite config.json with tilde-style configPath values
  const { writeFile: wf } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const tildeHome = `~`;
  const configWithTildes = {
    version: 1,
    targets: {
      claude: {
        enabled: true,
        configPath: `${tildeHome}/.claude/settings.json`,
        format: "json-merge",
        mcpKey: "mcpServers",
      },
      codex: { enabled: false, configPath: `${tildeHome}/.codex/config.toml`, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: false, configPath: `${tildeHome}/.cursor/mcp.json`, format: "json-standalone", mcpKey: "mcpServers" },
    },
    optional: {},
    parallel: { cli: { enabled: true }, mcp: { enabled: false } },
  };
  await wf(join(fixture.repoRoot, "config.json"), JSON.stringify(configWithTildes, null, 2));

  // Create a claude settings file at the expanded path with drifted content
  const claudeDir = join(fixture.homeDir, ".claude");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, "settings.json"),
    JSON.stringify({ model: "sonnet", mcpServers: { rogue: { url: "x" } } }, null, 2),
  );

  const result = await runAgentsCli(["doctor", "--json"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  });

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { mcpDrift: string[] };
  expect(parsed.mcpDrift.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/commands-doctor.test.ts
```

Expected: the new test FAILS — drift is not detected because tilde paths are not expanded.

**Step 3: Fix the implementation**

In `cli/core/diagnostics.ts`, `detectMcpDrift` function:

1. Import `expandHomePath` from `./paths`
2. Expand every `target.configPath` before using it

**Before** (line 77-100):
```ts
for (const [targetName, target] of Object.entries(config.targets)) {
    if (!target.enabled) {
      continue;
    }

    if (targetName === "claude" && existsSync(target.configPath)) {
      const current = readFileSync(target.configPath, "utf8");
```

**After:**
```ts
for (const [targetName, target] of Object.entries(config.targets)) {
    if (!target.enabled) {
      continue;
    }

    const configPath = expandHomePath(target.configPath, homeDir);

    if (targetName === "claude" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = mergeClaudeSettingsText(current, activeServers);
      if (current !== expected) {
        drifts.push(`claude:${configPath}`);
      }
    }

    if (targetName === "codex" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = mergeCodexTomlText(current, activeServers);
      if (current !== expected) {
        drifts.push(`codex:${configPath}`);
      }
    }

    if (targetName === "cursor") {
      const generatedPath = join(agentsDir, "generated", "cursor-mcp.json");
      if (existsSync(generatedPath)) {
        const current = readFileSync(generatedPath, "utf8");
        const expected = renderCursorConfig(activeServers);
        if (current !== expected) {
          drifts.push(`cursor:${generatedPath}`);
        }
      }
    }
  }
```

Also apply the same fix to `detectMissingGeneratedFiles` if it reads `target.configPath` — verify it doesn't (it only checks cursor's generated path, which is already absolute).

**Step 4: Run tests to confirm passage**

```bash
bun test test/commands-doctor.test.ts
bun test
```

---

### Task 4: Fix all TypeScript compilation errors

**Problem:** `npx tsc --noEmit` produces 29 errors (excluding the pre-existing example file). These break contributor confidence and prevent CI from gating on type safety.

This task has three sub-parts with no cross-dependencies:

#### 4a: Add `override` modifiers to all Clipanion command statics (16 errors)

Every command class needs `static override paths` and `static override usage`. The `tsconfig.json` has `noImplicitOverride: true`.

**Files to edit (8 files, same mechanical change in each):**

- `cli/commands/doctor.ts`: `static paths` -> `static override paths`, `static usage` -> `static override usage`
- `cli/commands/status.ts`: same
- `cli/commands/mcp/list.ts`: same
- `cli/commands/mcp/sync.ts`: same
- `cli/commands/skills/list.ts`: same
- `cli/commands/skills/curate.ts`: same
- `cli/commands/skills/uncurate.ts`: same
- `cli/commands/skills/sync.ts`: same

#### 4b: Fix core module type narrowing (2 errors)

**`cli/core/mcp.ts:81`** — `sectionName` could be `undefined` from the regex match group:

```ts
// Before
const sectionName = match[1];
skipping = sectionName === sectionPrefix || sectionName.startsWith(`${sectionPrefix}.`);

// After
const sectionName = match[1] ?? "";
skipping = sectionName === sectionPrefix || sectionName.startsWith(`${sectionPrefix}.`);
```

**`cli/core/output.ts:12`** — `widths[index]` could be `undefined` due to `noUncheckedIndexedAccess`:

```ts
// Before
const formatRow = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index])).join("  ");

// After
const formatRow = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ");
```

#### 4c: Fix test file type narrowing (11 errors)

**`test/core-config.test.ts:85`** — registry server access possibly undefined:

Use a non-null assertion `registry.servers.context7!.command` or add an explicit `expect().toBeDefined()` guard before the access.

**`test/sync-mcp.test.ts`** — 10 errors, all the same pattern: indexed record access on `createRegistry().servers["name"]` returns `RegistryServer | undefined`. These are pre-existing from Phase 1.

Fix by adding `!` non-null assertions at each call site (these are test fixtures where the keys are guaranteed to exist), or by using helper functions that assert:

```ts
function getServer(registry: CanonicalRegistry, name: string): RegistryServer {
  const server = registry.servers[name];
  if (!server) throw new Error(`Missing fixture server: ${name}`);
  return server;
}
```

Then replace all `createRegistry().servers.context7` with `getServer(createRegistry(), "context7")`.

**Step 1: Make the changes across all files**

Apply all three sub-parts.

**Step 2: Verify**

```bash
npx tsc --noEmit 2>&1 | grep -v "condition-based-waiting-example"
bun test
```

Expected: zero TypeScript errors (excluding the unrelated example file), all tests still pass.

---

### Task 5: Add skill name validation

**Problem:** Skill names are used directly in filesystem paths (`join(agentsDir, "skills", name)`) without sanitization. While path traversal is currently blocked by the skill-lookup step, this is defense by accident rather than by design. An explicit check is cheap and prevents future regressions.

**Step 1: Write the failing test**

Add to `test/core-skills.test.ts`:

```ts
describe("skill name validation", () => {
  test("rejects names with path separators", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    const { curateSkill } = await import("../cli/core/skills");
    expect(curateSkill({ repoRoot: root, agentsDir }, "../../../etc/passwd")).rejects.toThrow();
    expect(curateSkill({ repoRoot: root, agentsDir }, "foo/bar")).rejects.toThrow();
    expect(curateSkill({ repoRoot: root, agentsDir }, "foo\\bar")).rejects.toThrow();
  });

  test("rejects names that are '.' or '..'", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    const { curateSkill } = await import("../cli/core/skills");
    expect(curateSkill({ repoRoot: root, agentsDir }, "..")).rejects.toThrow();
    expect(curateSkill({ repoRoot: root, agentsDir }, ".")).rejects.toThrow();
  });
});
```

**Step 2: Run test to confirm failure**

The `../../../etc/passwd` test already passes (lookup fails), but `foo/bar` and `..` may not consistently fail on all platforms. Verify.

```bash
bun test test/core-skills.test.ts
```

**Step 3: Write minimal implementation**

Add a validation function in `cli/core/skills.ts`:

```ts
function validateSkillName(name: string) {
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Invalid skill name: ${name}`);
  }
}
```

Call it at the top of `curateSkill` and `uncurateSkill`.

**Step 4: Run tests to confirm passage**

```bash
bun test test/core-skills.test.ts
bun test
npx tsc --noEmit 2>&1 | grep -v "condition-based-waiting-example"
```

---

### Task 6: Add repo-root detection to `createAgentsContext()`

**Problem:** When `AGENTS_REPO_ROOT` is not set, `createAgentsContext()` falls back to `process.cwd()`. If a user runs `agents status` from their home directory, the CLI silently tries to read `~/config.json` and crashes with a confusing JSON parse error instead of a clear message.

**Step 1: Write the failing test**

Add to `test/cli-smoke.test.ts`:

```ts
test("exits with helpful error when run outside a repo", async () => {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "status"], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      AGENTS_REPO_ROOT: "/tmp/not-a-repo",
      AGENTS_HOME_DIR: "/tmp",
    },
  });
  const stderr = await new Response(proc.stderr).text();
  expect(await proc.exited).not.toBe(0);
  expect(stderr).toMatch(/config\.json|not.*repo|not found/i);
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/cli-smoke.test.ts
```

Expected: FAIL — the CLI crashes with an unhandled exception instead of a clear error.

**Step 3: Write minimal implementation**

In `cli/context.ts`, add a validation helper:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";

export function validateRepoRoot(repoRoot: string) {
  if (!existsSync(join(repoRoot, "config.json"))) {
    throw new Error(
      `No config.json found at ${repoRoot}. Run agents from the repo root or set AGENTS_REPO_ROOT.`,
    );
  }
}
```

In `cli/index.ts`, call `validateRepoRoot(context.repoRoot)` after creating the context but before `cli.runExit()`. Wrap it in a try/catch that writes to stderr and exits 1.

**Step 4: Run tests to confirm passage**

```bash
bun test test/cli-smoke.test.ts
bun test
npx tsc --noEmit 2>&1 | grep -v "condition-based-waiting-example"
```

---

### Task 7: Improve `doctor` human-readable output format

**Problem:** The current doctor output renders as a two-column table with comma-joined paths crammed into a single cell. With multiple issues, this becomes unreadable:

```
field                  value
brokenSymlinks         /home/x/.claude/skills/foo,/home/x/.codex/skills/bar
staleSkillSymlinks     none
```

**Step 1: Write the failing test**

Update the existing `test/commands-doctor.test.ts` "reports stale downstream skill symlinks" test to verify the human output uses a structured list format rather than comma-separated:

```ts
// Existing test modified — check that human output uses list format
expect(result.stdout).toContain("Stale skill symlinks:");
expect(result.stdout).toMatch(/^\s*-\s/m);  // list items start with "- "
```

**Step 2: Run test to confirm failure**

```bash
bun test test/commands-doctor.test.ts
```

**Step 3: Write minimal implementation**

Add a `renderDoctorReport` function to `cli/core/output.ts`:

```ts
export function renderDoctorReport(report: {
  brokenSymlinks: string[];
  staleSkillSymlinks: string[];
  mcpDrift: string[];
  missingGeneratedFiles: string[];
}) {
  const sections: string[] = [];

  const categories = [
    { label: "Broken symlinks", items: report.brokenSymlinks },
    { label: "Stale skill symlinks", items: report.staleSkillSymlinks },
    { label: "MCP drift", items: report.mcpDrift },
    { label: "Missing generated files", items: report.missingGeneratedFiles },
  ];

  for (const { label, items } of categories) {
    if (items.length > 0) {
      sections.push(`${label}:\n${items.map((item) => `  - ${item}`).join("\n")}`);
    }
  }

  return sections.length > 0 ? `${sections.join("\n\n")}\n` : "No issues found.\n";
}
```

Update `cli/commands/doctor.ts` to use `renderDoctorReport` instead of `renderTable` for human output.

**Step 4: Run tests to confirm passage**

```bash
bun test test/commands-doctor.test.ts
bun test
```

---

### Task 8: Fix `mcp list` misleading targets column

**Problem:** The `targets` column in `agents mcp list` shows all enabled targets for every server, regardless of whether the server is active. An inactive server like `slack` (optional, not enabled) shows `claude,codex,cursor` which implies it's configured everywhere.

**Step 1: Write the failing test**

Add to `test/commands-mcp.test.ts`:

```ts
test("inactive servers show empty targets", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["mcp", "list", "--json"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  });

  const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean; targets: string }>;
  const inactive = parsed.find((s) => !s.active);
  expect(inactive).toBeDefined();
  expect(inactive!.targets).toBe("");
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/commands-mcp.test.ts
```

**Step 3: Fix the implementation**

In `cli/commands/mcp/list.ts`, change the `targets` field to only show targets for active servers:

```ts
// Before
targets: targetSummary,

// After
targets: Object.hasOwn(active, name) ? targetSummary : "",
```

**Step 4: Run tests to confirm passage**

```bash
bun test test/commands-mcp.test.ts
bun test
```

---

### Task 9: Scrub hardcoded user paths

**Problem:** Several files contain `/Users/pureicis/`-prefixed paths that are machine-specific and will break or confuse other users.

**Locations:**

1. `mcp-servers.json` — `markdownify` server has `"args": ["/Users/pureicis/dev/markdownify-mcp/dist/index.js"]`
2. `README.md` — References like `See /Users/pureicis/dev/.agents/ARCHITECTURE.md` and absolute paths in links
3. `.ai/analyses/02_phase2-cli-target-architecture-design.md` — Reference to Clipanion manual at a local path (internal doc, lower priority)

**Step 1: Fix `mcp-servers.json`**

The markdownify server uses an absolute local path. For open-source, it needs a portable command. Options:
- Use `npx` with an npm package if markdownify-mcp is published
- Mark it as `optional: true` since it's a local dev tool
- Use an environment variable or placeholder

**Decision needed from Remy:** How should the markdownify server be referenced? I suggest marking it `"optional": true` and replacing the absolute path with a placeholder comment/note, then disabling it in `config.json` by default:

```json
"markdownify": {
  "description": "HTML to Markdown conversion",
  "transport": "stdio",
  "command": "node",
  "args": ["markdownify-mcp/dist/index.js"],
  "notes": "Requires a local markdownify-mcp installation. Set the args path to your local install.",
  "optional": true
}
```

**Step 2: Fix `README.md`**

Replace all absolute `/Users/pureicis/` references with relative paths or generic descriptions:

- `See /Users/pureicis/dev/.agents/ARCHITECTURE.md` -> `See the ARCHITECTURE.md in your ~/.agents/ directory`
- `Edit [mcp-servers.json](/Users/pureicis/dev/agents-config-saam/mcp-servers.json)` -> `Edit [mcp-servers.json](./mcp-servers.json)`
- Same for `config.json` links

**Step 3: Verify no hardcoded paths remain in CLI source**

```bash
grep -r "/Users/" cli/ sync-mcp.ts README.md mcp-servers.json config.json package.json
```

Expected: zero matches.

**Step 4: Run tests**

```bash
bun test
```

---

### Task 10: Add open-source scaffolding and clean up `package.json`

**Decision needed from Remy before this task:** License choice (MIT? Apache 2.0?), package name, and whether `private: true` should be removed.

This task is a placeholder to be fleshed out after Remy's decisions. It would include:

**Step 1: Add LICENSE**

Create `LICENSE` with the chosen license text.

**Step 2: Update `package.json`**

```json
{
  "name": "<decided-name>",
  "description": "Canonical MCP and skill registry CLI for multi-agent configuration",
  "version": "0.1.0",
  "license": "<chosen-license>",
  "repository": {
    "type": "git",
    "url": "<repo-url>"
  },
  "author": "<author>",
  "keywords": ["mcp", "agents", "cli", "skills", "configuration"],
  "bin": {
    "agents": "./cli/index.ts"
  },
  "type": "module",
  "scripts": {
    "agents": "bun run cli/index.ts",
    "sync": "bun run sync-mcp.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "<pinned-version>"
  },
  "dependencies": {
    "clipanion": "^4.0.0-rc.4",
    "smol-toml": "^1.6.1"
  }
}
```

Key changes:
- Pin `@types/bun` to a specific version instead of `latest`
- Add `description`, `license`, `repository`, `author`, `keywords`
- Add `typecheck` script
- Remove `private: true` if publishing
- Remove `module` field (it pointed to `sync-mcp.ts` which isn't really the module entry)
- Remove `peerDependencies` for `typescript` (Bun includes TypeScript)

**Step 3: Add CONTRIBUTING.md**

Brief file covering:
- How to set up the repo (`bun install`)
- How to run tests (`bun test`)
- How to type-check (`bun run typecheck`)
- PR guidelines
- Naming conventions (reference the ABOUTME and naming rules from CLAUDE.md)

**Step 4: Verify**

```bash
bun test
npx tsc --noEmit 2>&1 | grep -v "condition-based-waiting-example"
```

---

### Task 11: Add `agents sync` top-level convenience command

**Problem:** Users migrating from `bun run sync-mcp.ts` must now learn two commands (`agents mcp sync` + `agents skills sync`). A unified `agents sync` command that runs both (matching `syncRepository` behavior) would ease migration and match the mental model.

**Step 1: Write the failing test**

```ts
// Add to test/commands-mcp.test.ts or a new test/commands-sync.test.ts

describe("agents sync", () => {
  test("runs both MCP and skill sync", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["sync", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Changes:");
  });

  test("supports --target and --dry-run flags", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["sync", "--dry-run", "--target=claude"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("codex");
  });

  test("supports --json output", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["sync", "--dry-run", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.changes).toBeDefined();
    expect(parsed.warnings).toBeDefined();
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/commands-sync.test.ts
```

**Step 3: Write minimal implementation**

Create `cli/commands/sync.ts`:

```ts
// ABOUTME: Implements the top-level `agents sync` command as a convenience wrapper over MCP + skills sync.
// ABOUTME: Matches the behavior of the legacy `bun run sync-mcp.ts` entrypoint for migration ease.
```

Thin Clipanion command that calls `syncRepository` from `cli/core/sync.ts` with the provided flags. Supports `--dry-run`, `--target`, `--mcp-only`, `--skills-only`, `--json`.

Register in `cli/index.ts`.

**Step 4: Run tests to confirm passage**

```bash
bun test test/commands-sync.test.ts
bun test
npx tsc --noEmit 2>&1 | grep -v "condition-based-waiting-example"
```

---

### Task 12: Final verification

**No new files.** This is the end-to-end pass.

**Automated:**

```bash
bun test
npx tsc --noEmit 2>&1 | grep -v "condition-based-waiting-example"
```

Expected: all tests pass, zero TypeScript errors in project code.

**Manual CLI verification:**

```bash
bun run agents -- --help
bun run agents -- sync --dry-run
bun run agents -- skills list
bun run agents -- skills list --json
bun run agents -- mcp list
bun run agents -- mcp list --json
bun run agents -- mcp sync --dry-run
bun run agents -- status
bun run agents -- status --json
bun run agents -- doctor
bun run agents -- doctor --json
bun run agents -- skills uncurate nonexistent    # should exit non-zero
bun run agents -- mcp sync --target=bogus        # should exit non-zero

# Compatibility wrapper
bun run sync-mcp.ts --dry-run
bun run sync-mcp.ts --mcp-only --dry-run

# Verify no hardcoded paths
grep -r "/Users/" cli/ sync-mcp.ts README.md mcp-servers.json config.json
```

**Verify test count increased:** Should be ~60+ tests (up from 51), covering the new bug-fix tests, fs utility tests, sync command tests, and validation tests.
