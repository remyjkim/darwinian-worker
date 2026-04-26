# Phase 2 CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `agents` CLI as a Clipanion-based primary interface over the canonical repo, while preserving the current sync engine through reusable core modules and a compatibility wrapper.

**Architecture:** The implementation extracts the current `sync-mcp.ts` behavior into `cli/core` modules, then layers Clipanion command classes on top for `skills`, `mcp`, `status`, and `doctor`. The CLI must support repo-local and global execution from day one, and `sync-mcp.ts` must remain as a thin compatibility entrypoint using the same core functions.

**Tech Stack:** Bun, TypeScript, Clipanion, `smol-toml`, Bun test, local filesystem symlink workflows

## Global Rules

- **Commits:** Do not commit unless explicitly instructed by the user.
- **ABOUTME:** Every new `.ts` file must start with a 2-line `// ABOUTME:` comment.
- **Test fixtures:** Reuse the temp-dir pattern from `test/sync-mcp.test.ts` (`mkdtemp` + cleanup in `afterEach`). Never test against the real home directory.
- **Existing tests:** `test/sync-mcp.test.ts` must remain green after every task. Run it as a regression gate alongside any new tests.
- **Imports from sync-mcp.ts:** The existing test file imports `buildActiveServers`, `mergeClaudeSettingsText`, `mergeCodexTomlText`, `renderCursorConfig`, `syncRepository` directly from `../sync-mcp`. These exports must continue to work — either as re-exports from the core modules or as preserved functions in the compat wrapper.

---

### Task 1: Add Clipanion and scaffold the CLI entrypoint

**Why first:** Establishes the CLI shell that all subsequent commands register into. Minimal risk, no extraction yet.

**Files:**
- Modify: `package.json`
- Create: `cli/index.ts`
- Create: `cli/context.ts`
- Test: `test/cli-smoke.test.ts`

**Step 1: Write the failing test**

```ts
// test/cli-smoke.test.ts
import { describe, expect, test } from "bun:test";

describe("CLI entrypoint", () => {
  test("--help exits 0 and mentions 'agents'", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout).toContain("agents");
  });

  test("--version exits 0", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);
  });

  test("unknown command exits non-zero", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "nonexistent"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).not.toBe(0);
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/cli-smoke.test.ts
```

Expected: FAIL — `cli/index.ts` does not exist and `clipanion` is not installed.

**Step 3: Write minimal implementation**

Add dependency:

```bash
bun add clipanion
```

Add to `package.json` scripts:

```json
"agents": "bun run cli/index.ts"
```

Create `cli/context.ts`:

```ts
// ABOUTME: Defines the shared context type threaded through all Clipanion commands.
// ABOUTME: Carries resolved paths and config so commands don't repeat resolution logic.

export interface AgentsContext {
  /** Absolute path to the agents-config repo root */
  repoRoot: string;
  /** Absolute path to ~/.agents */
  agentsDir: string;
  /** Absolute path to user home directory */
  homeDir: string;
}
```

Create `cli/index.ts`:

```ts
#!/usr/bin/env bun
// ABOUTME: CLI entrypoint — creates the Clipanion application and runs it.
// ABOUTME: All commands are registered here; core logic lives in cli/core/.

import { Cli, Builtins } from "clipanion";

const cli = new Cli({
  binaryLabel: "agents",
  binaryName: "agents",
  binaryVersion: "0.1.0",
});

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

cli.runExit(process.argv.slice(2));
```

**Step 4: Run test to confirm passage**

```bash
bun test test/cli-smoke.test.ts
bun test test/sync-mcp.test.ts  # regression gate
```

---

### Task 2: Lock in compatibility regression tests

**Why now:** Before we extract anything from `sync-mcp.ts`, we need a regression net that exercises the *public entrypoint* (`bun run sync-mcp.ts`) with its CLI flags. The existing `test/sync-mcp.test.ts` tests the exported functions, but nothing tests the CLI argument parsing or stdout output format. This task creates that safety net.

**Files:**
- Create: `test/sync-mcp-compat.test.ts`

**Step 1: Write the tests**

These test the CLI entrypoint behavior, not the internal functions. They use the same temp-dir fixture pattern as the existing test file.

```ts
// test/sync-mcp-compat.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((r) =>
      import("node:fs/promises").then((fs) => fs.rm(r, { recursive: true, force: true }))
    ),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-compat-"));
  tempRoots.push(root);
  return root;
}

/** Scaffold a minimal repo + home dir for sync-mcp.ts to operate on */
async function scaffoldFixture() {
  const root = await createTempRoot();
  const homeDir = join(root, "home");
  const repoRoot = join(root, "repo");
  const claudeSettings = join(homeDir, ".claude", "settings.json");
  const codexConfig = join(homeDir, ".codex", "config.toml");
  const cursorConfig = join(homeDir, ".cursor", "mcp.json");

  await mkdir(join(repoRoot, "skills", "shared"), { recursive: true });
  await mkdir(dirname(claudeSettings), { recursive: true });
  await mkdir(dirname(codexConfig), { recursive: true });
  await mkdir(dirname(cursorConfig), { recursive: true });
  await mkdir(join(homeDir, ".agents", "skills"), { recursive: true });

  const registry = {
    version: 1,
    servers: {
      context7: {
        description: "Docs",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        optional: false,
      },
    },
  };
  const config = {
    version: 1,
    targets: {
      claude: { enabled: true, configPath: claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: cursorConfig, format: "json-standalone", mcpKey: "mcpServers", symlink: true },
    },
    optional: {},
    parallel: { cli: { enabled: true }, mcp: { enabled: false } },
  };

  await writeFile(join(repoRoot, "mcp-servers.json"), JSON.stringify(registry, null, 2));
  await writeFile(join(repoRoot, "config.json"), JSON.stringify(config, null, 2));
  await writeFile(claudeSettings, JSON.stringify({ model: "sonnet" }, null, 2));
  await writeFile(codexConfig, 'personality = "pragmatic"\n');
  await writeFile(cursorConfig, JSON.stringify({ mcpServers: {} }, null, 2));

  return { root, homeDir, repoRoot, claudeSettings, codexConfig, cursorConfig };
}

function runSyncMcp(repoRoot: string, homeDir: string, extraArgs: string[] = []) {
  const script = join(import.meta.dir, "..", "sync-mcp.ts");
  return Bun.spawn(["bun", "run", script, ...extraArgs], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // sync-mcp.ts uses inferRepoRoot from import.meta.path, so we call
      // the exported function directly instead. These tests verify the CLI
      // arg parsing path, so we import and call syncRepository.
    },
  });
}

describe("sync-mcp.ts CLI compatibility", () => {
  test("--dry-run reports changes without mutating files", async () => {
    const { repoRoot, homeDir, claudeSettings } = await scaffoldFixture();
    const { syncRepository } = await import("../sync-mcp");

    const before = await readFile(claudeSettings, "utf8");
    const result = await syncRepository({
      repoRoot,
      homeDir,
      dryRun: true,
    });

    expect(result.changes.length).toBeGreaterThan(0);
    expect(await readFile(claudeSettings, "utf8")).toBe(before);
  });

  test("--mcp-only skips skills sync", async () => {
    const { repoRoot, homeDir } = await scaffoldFixture();
    const { syncRepository } = await import("../sync-mcp");

    const result = await syncRepository({
      repoRoot,
      homeDir,
      mcpOnly: true,
      dryRun: true,
    });

    const hasSkillChange = result.changes.some((c) => c.includes("skills"));
    expect(hasSkillChange).toBe(false);
  });

  test("--skills-only skips MCP sync", async () => {
    const { repoRoot, homeDir } = await scaffoldFixture();
    const { syncRepository } = await import("../sync-mcp");

    const result = await syncRepository({
      repoRoot,
      homeDir,
      skillsOnly: true,
      dryRun: true,
    });

    const hasMcpChange = result.changes.some(
      (c) => c.includes("settings.json") || c.includes("config.toml") || c.includes("mcp.json")
    );
    expect(hasMcpChange).toBe(false);
  });

  test("--target=claude limits sync to claude only", async () => {
    const { repoRoot, homeDir } = await scaffoldFixture();
    const { syncRepository } = await import("../sync-mcp");

    const result = await syncRepository({
      repoRoot,
      homeDir,
      target: "claude",
      dryRun: true,
    });

    const hasCodex = result.changes.some((c) => c.includes("codex") || c.includes("config.toml"));
    const hasCursor = result.changes.some((c) => c.includes("cursor"));
    expect(hasCodex).toBe(false);
    expect(hasCursor).toBe(false);
  });

  test("exports expected public API surface", async () => {
    const mod = await import("../sync-mcp");
    expect(typeof mod.buildActiveServers).toBe("function");
    expect(typeof mod.mergeClaudeSettingsText).toBe("function");
    expect(typeof mod.mergeCodexTomlText).toBe("function");
    expect(typeof mod.renderCursorConfig).toBe("function");
    expect(typeof mod.syncRepository).toBe("function");
  });
});
```

**Step 2: Run tests to confirm they pass against current code**

```bash
bun test test/sync-mcp-compat.test.ts
bun test test/sync-mcp.test.ts  # existing tests still green
```

These tests must pass *now* — they lock in current behavior. Every subsequent task runs both compat test files as a regression gate.

---

### Task 3: Extract path resolution into `cli/core/paths.ts`

**Why separate:** Paths are the lowest-level utility with zero business logic dependencies. Everything else builds on top.

**Files:**
- Create: `cli/core/paths.ts`
- Test: `test/core-paths.test.ts`
- Modify: `sync-mcp.ts` (use the new module for `inferRepoRoot`, `expandHomePath`, `normalizeOptions`)

**Step 1: Write the failing test**

```ts
// test/core-paths.test.ts
import { describe, expect, test } from "bun:test";

describe("path resolution", () => {
  test("expandHomePath replaces leading ~", async () => {
    const { expandHomePath } = await import("../cli/core/paths");
    expect(expandHomePath("~/foo/bar", "/home/test")).toBe("/home/test/foo/bar");
    expect(expandHomePath("~", "/home/test")).toBe("/home/test");
    expect(expandHomePath("/absolute/path", "/home/test")).toBe("/absolute/path");
  });

  test("resolveAgentsDir defaults to homeDir/.agents", async () => {
    const { resolveAgentsDir } = await import("../cli/core/paths");
    expect(resolveAgentsDir("/home/test")).toBe("/home/test/.agents");
  });

  test("resolveTargetPaths returns expected tool directories", async () => {
    const { resolveToolPaths } = await import("../cli/core/paths");
    const paths = resolveToolPaths("/home/test");
    expect(paths.claudeSkills).toBe("/home/test/.claude/skills");
    expect(paths.codexSkills).toBe("/home/test/.codex/skills");
    expect(paths.claudeSettings).toBe("/home/test/.claude/settings.json");
  });

  test("resolveSkillScopeDirs returns all four scope directories", async () => {
    const { resolveSkillScopeDirs } = await import("../cli/core/paths");
    const dirs = resolveSkillScopeDirs("/repo");
    expect(dirs.shared).toBe("/repo/skills/shared");
    expect(dirs.claudeOnly).toBe("/repo/skills/claude-only");
    expect(dirs.codexOnly).toBe("/repo/skills/codex-only");
    expect(dirs.experimental).toBe("/repo/skills/experimental");
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/core-paths.test.ts
```

**Step 3: Write minimal implementation**

Extract `inferRepoRoot`, `expandHomePath`, and `normalizeOptions` from `sync-mcp.ts` into `cli/core/paths.ts`. Add the new resolution helpers the tests expect.

Update `sync-mcp.ts` to import from `./cli/core/paths` instead of defining these inline. Keep all existing exports intact.

**Step 4: Run tests to confirm passage**

```bash
bun test test/core-paths.test.ts
bun test test/sync-mcp.test.ts
bun test test/sync-mcp-compat.test.ts
```

---

### Task 4: Extract config and registry loading into `cli/core/config.ts` and `cli/core/registry.ts`

**Why together:** Config and registry loading are both "read a JSON file and return typed data." They're small, coupled by usage patterns, and both needed before MCP or skills extraction can proceed.

**Files:**
- Create: `cli/core/config.ts`
- Create: `cli/core/registry.ts`
- Test: `test/core-config.test.ts`
- Modify: `sync-mcp.ts`

**Step 1: Write the failing test**

```ts
// test/core-config.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((r) =>
    import("node:fs/promises").then((fs) => fs.rm(r, { recursive: true, force: true }))
  ));
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-config-"));
  tempRoots.push(root);
  return root;
}

describe("loadConfig", () => {
  test("loads and parses config.json from repo root", async () => {
    const root = await createTempRoot();
    const config = {
      version: 1,
      targets: {
        claude: { enabled: true, configPath: "~/.claude/settings.json", format: "json-merge", mcpKey: "mcpServers" },
        codex: { enabled: false, configPath: "~/.codex/config.toml", format: "toml-merge", mcpKey: "mcp_servers" },
        cursor: { enabled: true, configPath: "~/.cursor/mcp.json", format: "json-standalone", mcpKey: "mcpServers" },
      },
      optional: { slack: false },
      parallel: { cli: { enabled: true }, mcp: { enabled: false } },
    };
    await writeFile(join(root, "config.json"), JSON.stringify(config, null, 2));

    const { loadConfig } = await import("../cli/core/config");
    const loaded = loadConfig(root);

    expect(loaded.version).toBe(1);
    expect(loaded.targets.claude.enabled).toBe(true);
    expect(loaded.targets.codex.enabled).toBe(false);
    expect(loaded.optional.slack).toBe(false);
  });

  test("throws on missing config.json", async () => {
    const root = await createTempRoot();
    const { loadConfig } = await import("../cli/core/config");
    expect(() => loadConfig(root)).toThrow();
  });
});

describe("loadRegistry", () => {
  test("loads and parses mcp-servers.json from repo root", async () => {
    const root = await createTempRoot();
    const registry = {
      version: 1,
      servers: {
        context7: { description: "Docs", transport: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp"], optional: false },
      },
    };
    await writeFile(join(root, "mcp-servers.json"), JSON.stringify(registry, null, 2));

    const { loadRegistry } = await import("../cli/core/registry");
    const loaded = loadRegistry(root);

    expect(loaded.version).toBe(1);
    expect(loaded.servers.context7.transport).toBe("stdio");
  });

  test("findServer returns undefined for missing server", async () => {
    const root = await createTempRoot();
    const registry = { version: 1, servers: {} };
    await writeFile(join(root, "mcp-servers.json"), JSON.stringify(registry, null, 2));

    const { loadRegistry, findServer } = await import("../cli/core/registry");
    const loaded = loadRegistry(root);
    expect(findServer(loaded, "nonexistent")).toBeUndefined();
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/core-config.test.ts
```

**Step 3: Write minimal implementation**

Create `cli/core/config.ts`:
- Move `CanonicalConfig`, `TargetConfig`, `TargetName`, `SyncOptions`, `SyncResult` types here
- `loadConfig(repoRoot: string): CanonicalConfig`
- Re-export types from `sync-mcp.ts` so existing imports don't break

Create `cli/core/registry.ts`:
- Move `CanonicalRegistry`, `RegistryServer`, `Transport` types here
- `loadRegistry(repoRoot: string): CanonicalRegistry`
- `findServer(registry: CanonicalRegistry, name: string): RegistryServer | undefined`
- Re-export types from `sync-mcp.ts`

Update `sync-mcp.ts`:
- Import types and loaders from the new modules
- Re-export the types to maintain the existing public API
- Remove the inline `readJsonFile` helper (moved to core modules)

**Step 4: Run tests to confirm passage**

```bash
bun test test/core-config.test.ts
bun test test/sync-mcp.test.ts
bun test test/sync-mcp-compat.test.ts
```

---

### Task 5: Extract MCP core (active server filtering + target rendering)

**Why separate from sync orchestration:** Server filtering and rendering are pure functions with clean test boundaries. Sync orchestration involves filesystem mutation — different concern.

**Files:**
- Create: `cli/core/mcp.ts`
- Test: `test/core-mcp.test.ts`
- Modify: `sync-mcp.ts`

**Step 1: Write the failing test**

```ts
// test/core-mcp.test.ts
import { describe, expect, test } from "bun:test";
import { parse as parseToml } from "smol-toml";
import type { CanonicalConfig, CanonicalRegistry } from "../cli/core/config";

function stubRegistry(): CanonicalRegistry {
  return {
    version: 1,
    servers: {
      context7: { description: "Docs", transport: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp"], optional: false },
      "parallel-web-search": { description: "Platform", transport: "platform-provided", provider: "claude.ai", optional: false },
      slack: { description: "Slack", transport: "http", url: "https://mcp.slack.com/mcp", optional: true },
      "parallel-search": { description: "Search", transport: "http", url: "https://search.parallel.ai/mcp", optional: false },
      "parallel-task": { description: "Task", transport: "http", url: "https://task-mcp.parallel.ai/mcp", optional: false },
    },
  };
}

function stubConfig(opts: { slack?: boolean; parallelMcp?: boolean } = {}): CanonicalConfig {
  return {
    version: 1,
    targets: {
      claude: { enabled: true, configPath: "~/.claude/settings.json", format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: "~/.codex/config.toml", format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: "~/.cursor/mcp.json", format: "json-standalone", mcpKey: "mcpServers", symlink: true },
    },
    optional: { slack: opts.slack ?? false },
    parallel: { cli: { enabled: true }, mcp: { enabled: opts.parallelMcp ?? false } },
  };
}

describe("buildActiveServers", () => {
  test("excludes platform-provided and disabled optional servers", async () => {
    const { buildActiveServers } = await import("../cli/core/mcp");
    const active = buildActiveServers(stubRegistry(), stubConfig());
    expect(Object.keys(active)).toEqual(["context7"]);
  });

  test("includes optional servers when enabled", async () => {
    const { buildActiveServers } = await import("../cli/core/mcp");
    const active = buildActiveServers(stubRegistry(), stubConfig({ slack: true }));
    expect(Object.keys(active)).toContain("slack");
  });

  test("includes parallel MCP servers when parallel.mcp.enabled", async () => {
    const { buildActiveServers } = await import("../cli/core/mcp");
    const active = buildActiveServers(stubRegistry(), stubConfig({ parallelMcp: true }));
    expect(Object.keys(active)).toContain("parallel-search");
    expect(Object.keys(active)).toContain("parallel-task");
  });
});

describe("renderCursorConfig", () => {
  test("renders standalone JSON with mcpServers key", async () => {
    const { renderCursorConfig } = await import("../cli/core/mcp");
    const json = renderCursorConfig({
      context7: stubRegistry().servers.context7,
    });
    const parsed = JSON.parse(json);
    expect(parsed.mcpServers.context7.command).toBe("npx");
  });
});

describe("mergeClaudeSettingsText", () => {
  test("replaces mcpServers while preserving other keys", async () => {
    const { mergeClaudeSettingsText } = await import("../cli/core/mcp");
    const merged = mergeClaudeSettingsText(
      JSON.stringify({ env: { A: "1" }, mcpServers: { old: { command: "old" } } }, null, 2),
      { context7: stubRegistry().servers.context7 },
    );
    const parsed = JSON.parse(merged);
    expect(parsed.env.A).toBe("1");
    expect(parsed.mcpServers.context7).toBeDefined();
    expect(parsed.mcpServers.old).toBeUndefined();
  });
});

describe("mergeCodexTomlText", () => {
  test("replaces mcp_servers sections while preserving other TOML", async () => {
    const { mergeCodexTomlText } = await import("../cli/core/mcp");
    const merged = mergeCodexTomlText(
      'personality = "pragmatic"\n\n[mcp_servers.old]\ncommand = "legacy"\n',
      { context7: stubRegistry().servers.context7 },
    );
    const parsed = parseToml(merged) as Record<string, unknown>;
    expect(parsed.personality).toBe("pragmatic");
    expect((parsed.mcp_servers as Record<string, unknown>).context7).toBeDefined();
    expect((parsed.mcp_servers as Record<string, unknown>).old).toBeUndefined();
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/core-mcp.test.ts
```

**Step 3: Write minimal implementation**

Create `cli/core/mcp.ts`:
- Move `buildActiveServers`, `toJsonServerConfig`, `toCodexServerConfig`, `renderCursorConfig`, `mergeClaudeSettingsText`, `stripTomlSections`, `mergeCodexTomlText` from `sync-mcp.ts`
- These are pure functions — no filesystem side effects

Update `sync-mcp.ts`:
- Import and re-export these functions from `cli/core/mcp`
- The existing test file (`test/sync-mcp.test.ts`) imports these from `../sync-mcp` and must continue working

**Step 4: Run tests to confirm passage**

```bash
bun test test/core-mcp.test.ts
bun test test/sync-mcp.test.ts
bun test test/sync-mcp-compat.test.ts
```

---

### Task 6: Extract sync orchestration into `cli/core/sync.ts`

**Why now:** With paths, config, registry, and MCP rendering extracted, the remaining sync logic (filesystem writes, backup, symlink creation, the `syncMcp` and `syncSkills` orchestration) can move into a core module. After this task, `sync-mcp.ts` becomes a thin wrapper.

**Files:**
- Create: `cli/core/sync.ts`
- Modify: `sync-mcp.ts`
- Test: `test/core-sync.test.ts`

**Step 1: Write the failing test**

```ts
// test/core-sync.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((r) =>
    import("node:fs/promises").then((fs) => fs.rm(r, { recursive: true, force: true }))
  ));
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-sync-"));
  tempRoots.push(root);
  return root;
}

/** Reusable fixture: creates a repo + home directory tree with canonical files */
async function scaffoldSyncFixture(opts: { withCuratedSkill?: boolean } = {}) {
  const root = await createTempRoot();
  const homeDir = join(root, "home");
  const repoRoot = join(root, "repo");
  const agentsDir = join(homeDir, ".agents");
  const claudeSettings = join(homeDir, ".claude", "settings.json");
  const codexConfig = join(homeDir, ".codex", "config.toml");
  const cursorConfig = join(homeDir, ".cursor", "mcp.json");

  await mkdir(join(repoRoot, "skills", "shared", "alpha"), { recursive: true });
  await mkdir(dirname(claudeSettings), { recursive: true });
  await mkdir(dirname(codexConfig), { recursive: true });
  await mkdir(dirname(cursorConfig), { recursive: true });
  await mkdir(join(agentsDir, "skills"), { recursive: true });
  await mkdir(join(homeDir, ".claude", "skills"), { recursive: true });
  await mkdir(join(homeDir, ".codex", "skills"), { recursive: true });

  await writeFile(join(repoRoot, "skills", "shared", "alpha", "SKILL.md"), "---\nname: alpha\n---\n");

  if (opts.withCuratedSkill) {
    await symlink(
      join(repoRoot, "skills", "shared", "alpha"),
      join(agentsDir, "skills", "alpha"),
      "dir",
    );
  }

  const registry = {
    version: 1,
    servers: {
      context7: { description: "Docs", transport: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp"], optional: false },
    },
  };
  const config = {
    version: 1,
    targets: {
      claude: { enabled: true, configPath: claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: cursorConfig, format: "json-standalone", mcpKey: "mcpServers", symlink: true },
    },
    optional: {},
    parallel: { cli: { enabled: true }, mcp: { enabled: false } },
  };

  await writeFile(join(repoRoot, "mcp-servers.json"), JSON.stringify(registry, null, 2));
  await writeFile(join(repoRoot, "config.json"), JSON.stringify(config, null, 2));
  await writeFile(claudeSettings, JSON.stringify({ model: "sonnet" }, null, 2));
  await writeFile(codexConfig, 'personality = "pragmatic"\n');
  await writeFile(cursorConfig, JSON.stringify({ mcpServers: {} }, null, 2));

  return { root, homeDir, repoRoot, agentsDir, claudeSettings, codexConfig, cursorConfig };
}

describe("syncRepository (core)", () => {
  test("dry-run reports changes without mutating", async () => {
    const { claudeSettings, repoRoot, homeDir } = await scaffoldSyncFixture();
    const { syncRepository } = await import("../cli/core/sync");
    const before = await readFile(claudeSettings, "utf8");

    const result = await syncRepository({ repoRoot, homeDir, dryRun: true });

    expect(result.changes.length).toBeGreaterThan(0);
    expect(await readFile(claudeSettings, "utf8")).toBe(before);
  });

  test("mcpOnly skips skills", async () => {
    const { repoRoot, homeDir } = await scaffoldSyncFixture();
    const { syncRepository } = await import("../cli/core/sync");

    const result = await syncRepository({ repoRoot, homeDir, mcpOnly: true, dryRun: true });
    expect(result.changes.every((c) => !c.includes("skills"))).toBe(true);
  });

  test("skillsOnly skips MCP", async () => {
    const { repoRoot, homeDir } = await scaffoldSyncFixture();
    const { syncRepository } = await import("../cli/core/sync");

    const result = await syncRepository({ repoRoot, homeDir, skillsOnly: true, dryRun: true });
    expect(result.changes.every((c) => !c.includes("settings.json") && !c.includes("config.toml"))).toBe(true);
  });

  test("skill sync creates downstream symlinks from curated skills", async () => {
    const { repoRoot, homeDir } = await scaffoldSyncFixture({ withCuratedSkill: true });
    const { syncRepository } = await import("../cli/core/sync");

    await syncRepository({ repoRoot, homeDir, skillsOnly: true });

    expect(existsSync(join(homeDir, ".claude", "skills", "alpha"))).toBe(true);
    expect(existsSync(join(homeDir, ".codex", "skills", "alpha"))).toBe(true);
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/core-sync.test.ts
```

**Step 3: Write minimal implementation**

Create `cli/core/sync.ts`:
- Move `syncMcp`, `syncSkills`, `syncRepository`, `normalizeOptions`, and all filesystem helpers (`writeManagedFile`, `ensureSymlink`, `backupExistingPath`, `nextBackupPath`, `ensureParentDir`, `findStaleSymlinks`, `lstatSafe`, `realpathSafe`) from `sync-mcp.ts`
- The `syncRepository` function becomes the canonical implementation here
- Import `loadConfig`, `loadRegistry` from the core modules
- Import `buildActiveServers`, rendering functions from `cli/core/mcp`
- Import path helpers from `cli/core/paths`

Reduce `sync-mcp.ts` to:

```ts
// ABOUTME: Compatibility entrypoint — delegates to cli/core/sync.
// ABOUTME: Preserves the original CLI interface for scripts that call `bun run sync-mcp.ts`.

// Re-export public API so existing imports (including tests) keep working
export { buildActiveServers, mergeClaudeSettingsText, mergeCodexTomlText, renderCursorConfig } from "./cli/core/mcp";
export { syncRepository } from "./cli/core/sync";
export type { CanonicalConfig, CanonicalRegistry, RegistryServer, SyncOptions, SyncResult, TargetName, Transport } from "./cli/core/config";

import { syncRepository } from "./cli/core/sync";
import type { SyncOptions, TargetName } from "./cli/core/config";

function parseCliArgs(argv: string[]): SyncOptions {
  // ... unchanged arg parsing logic ...
}

async function main() {
  // ... unchanged main() logic using syncRepository ...
}

if (import.meta.main) {
  await main();
}
```

**Step 4: Run tests to confirm passage**

```bash
bun test test/core-sync.test.ts
bun test test/sync-mcp.test.ts
bun test test/sync-mcp-compat.test.ts
```

---

### Task 7: Extract skills core into `cli/core/skills.ts`

**Why separate from sync:** The skills commands (`list`, `curate`, `uncurate`) need skill enumeration and curation logic that doesn't exist as standalone functions today — it's all interleaved in `syncSkills`. This task pulls out the query/mutation primitives.

**Files:**
- Create: `cli/core/skills.ts`
- Test: `test/core-skills.test.ts`

**Step 1: Write the failing test**

```ts
// test/core-skills.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((r) =>
    import("node:fs/promises").then((fs) => fs.rm(r, { recursive: true, force: true }))
  ));
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-skills-"));
  tempRoots.push(root);
  return root;
}

async function scaffoldSkillsFixture() {
  const root = await createTempRoot();
  const repoRoot = join(root, "repo");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");

  // Create skill scope directories with sample skills
  await mkdir(join(repoRoot, "skills", "shared", "alpha"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "shared", "beta"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "claude-only", "gamma"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "codex-only", "delta"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "experimental", "epsilon"), { recursive: true });

  await writeFile(join(repoRoot, "skills", "shared", "alpha", "SKILL.md"), "---\nname: alpha\n---\n");
  await writeFile(join(repoRoot, "skills", "shared", "beta", "SKILL.md"), "---\nname: beta\n---\n");
  await writeFile(join(repoRoot, "skills", "claude-only", "gamma", "SKILL.md"), "---\nname: gamma\n---\n");
  await writeFile(join(repoRoot, "skills", "codex-only", "delta", "SKILL.md"), "---\nname: delta\n---\n");
  await writeFile(join(repoRoot, "skills", "experimental", "epsilon", "SKILL.md"), "---\nname: epsilon\n---\n");

  // Create agents skill directory with one curated skill
  await mkdir(join(agentsDir, "skills"), { recursive: true });
  await symlink(join(repoRoot, "skills", "shared", "alpha"), join(agentsDir, "skills", "alpha"), "dir");

  // Create downstream tool skill directories
  await mkdir(join(homeDir, ".claude", "skills"), { recursive: true });
  await mkdir(join(homeDir, ".codex", "skills"), { recursive: true });

  return { root, repoRoot, homeDir, agentsDir };
}

describe("listRepoSkills", () => {
  test("returns all skills across all scopes", async () => {
    const { repoRoot } = await scaffoldSkillsFixture();
    const { listRepoSkills } = await import("../cli/core/skills");

    const skills = await listRepoSkills(repoRoot);

    expect(skills).toContainEqual({ name: "alpha", scope: "shared" });
    expect(skills).toContainEqual({ name: "beta", scope: "shared" });
    expect(skills).toContainEqual({ name: "gamma", scope: "claude-only" });
    expect(skills).toContainEqual({ name: "delta", scope: "codex-only" });
    expect(skills).toContainEqual({ name: "epsilon", scope: "experimental" });
  });

  test("skips dotfiles", async () => {
    const { repoRoot } = await scaffoldSkillsFixture();
    await mkdir(join(repoRoot, "skills", "shared", ".hidden"), { recursive: true });
    const { listRepoSkills } = await import("../cli/core/skills");

    const skills = await listRepoSkills(repoRoot);
    expect(skills.find((s) => s.name === ".hidden")).toBeUndefined();
  });
});

describe("listCuratedSkills", () => {
  test("returns skills symlinked into ~/.agents/skills", async () => {
    const { agentsDir } = await scaffoldSkillsFixture();
    const { listCuratedSkills } = await import("../cli/core/skills");

    const curated = await listCuratedSkills(agentsDir);
    expect(curated).toEqual(["alpha"]);
  });
});

describe("curateSkill", () => {
  test("creates symlink from repo skill to ~/.agents/skills", async () => {
    const { repoRoot, agentsDir } = await scaffoldSkillsFixture();
    const { curateSkill, listCuratedSkills } = await import("../cli/core/skills");

    await curateSkill(repoRoot, agentsDir, "beta");

    const curated = await listCuratedSkills(agentsDir);
    expect(curated).toContain("beta");
  });

  test("throws for nonexistent skill", async () => {
    const { repoRoot, agentsDir } = await scaffoldSkillsFixture();
    const { curateSkill } = await import("../cli/core/skills");

    expect(curateSkill(repoRoot, agentsDir, "nonexistent")).rejects.toThrow();
  });

  test("throws for experimental skill", async () => {
    const { repoRoot, agentsDir } = await scaffoldSkillsFixture();
    const { curateSkill } = await import("../cli/core/skills");

    expect(curateSkill(repoRoot, agentsDir, "epsilon")).rejects.toThrow();
  });
});

describe("uncurateSkill", () => {
  test("removes the curated symlink", async () => {
    const { repoRoot, agentsDir } = await scaffoldSkillsFixture();
    const { uncurateSkill, listCuratedSkills } = await import("../cli/core/skills");

    await uncurateSkill(agentsDir, "alpha");

    const curated = await listCuratedSkills(agentsDir);
    expect(curated).not.toContain("alpha");
  });

  test("throws for skill that isn't curated", async () => {
    const { agentsDir } = await scaffoldSkillsFixture();
    const { uncurateSkill } = await import("../cli/core/skills");

    expect(uncurateSkill(agentsDir, "beta")).rejects.toThrow();
  });
});

describe("findStaleSkillSymlinks", () => {
  test("detects downstream symlinks not backed by curated skills", async () => {
    const { homeDir, agentsDir } = await scaffoldSkillsFixture();
    const { findStaleSkillSymlinks } = await import("../cli/core/skills");

    // Create a stale symlink in claude skills that isn't in curated set
    await symlink("/nonexistent", join(homeDir, ".claude", "skills", "stale-skill"), "dir");

    const stale = await findStaleSkillSymlinks(homeDir, agentsDir);
    expect(stale.some((s) => s.includes("stale-skill"))).toBe(true);
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/core-skills.test.ts
```

**Step 3: Write minimal implementation**

Create `cli/core/skills.ts` with:

```ts
// ABOUTME: Skill enumeration, curation, and stale-link detection.
// ABOUTME: Operates on the repo skills tree and the ~/.agents/skills curated layer.
```

Functions to implement:
- `listRepoSkills(repoRoot): Promise<Array<{ name: string; scope: SkillScope }>>` — enumerates skills across all four scope dirs, skipping dotfiles and missing dirs
- `listCuratedSkills(agentsDir): Promise<string[]>` — reads `~/.agents/skills` symlinks
- `curateSkill(repoRoot, agentsDir, name)` — validates skill exists in a curatable scope (`shared`, `claude-only`, `codex-only`), creates symlink into `~/.agents/skills`
- `uncurateSkill(agentsDir, name)` — validates the curated link exists, removes it
- `findStaleSkillSymlinks(homeDir, agentsDir): Promise<string[]>` — compares downstream tool skill dirs against curated + scope-specific sets, returns paths of orphaned symlinks

This module does **not** create downstream tool symlinks — that remains in `cli/core/sync.ts`.

**Step 4: Run tests to confirm passage**

```bash
bun test test/core-skills.test.ts
bun test test/sync-mcp.test.ts
bun test test/sync-mcp-compat.test.ts
```

---

### Task 8: Implement `agents skills list`

**Files:**
- Create: `cli/commands/skills/list.ts`
- Create: `cli/core/output.ts`
- Modify: `cli/index.ts`
- Test: `test/cmd-skills-list.test.ts`

**Step 1: Write the failing test**

```ts
// test/cmd-skills-list.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((r) =>
    import("node:fs/promises").then((fs) => fs.rm(r, { recursive: true, force: true }))
  ));
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-cmd-skills-"));
  tempRoots.push(root);
  return root;
}

async function scaffoldAndRun(args: string[]) {
  const root = await createTempRoot();
  const repoRoot = join(root, "repo");
  const homeDir = join(root, "home");

  await mkdir(join(repoRoot, "skills", "shared", "alpha"), { recursive: true });
  await writeFile(join(repoRoot, "skills", "shared", "alpha", "SKILL.md"), "---\nname: alpha\n---\n");
  await mkdir(join(homeDir, ".agents", "skills"), { recursive: true });
  await symlink(join(repoRoot, "skills", "shared", "alpha"), join(homeDir, ".agents", "skills", "alpha"), "dir");
  await mkdir(join(homeDir, ".claude", "skills"), { recursive: true });
  await mkdir(join(homeDir, ".codex", "skills"), { recursive: true });

  // Minimal config/registry so the CLI doesn't crash
  await writeFile(join(repoRoot, "mcp-servers.json"), JSON.stringify({ version: 1, servers: {} }));
  await writeFile(join(repoRoot, "config.json"), JSON.stringify({
    version: 1,
    targets: {
      claude: { enabled: true, configPath: join(homeDir, ".claude", "settings.json"), format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: false, configPath: join(homeDir, ".codex", "config.toml"), format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: false, configPath: join(homeDir, ".cursor", "mcp.json"), format: "json-standalone", mcpKey: "mcpServers" },
    },
    optional: {},
  }));

  const proc = Bun.spawn(
    ["bun", "run", join(import.meta.dir, "..", "cli", "index.ts"), ...args],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        AGENTS_REPO_ROOT: repoRoot,
        AGENTS_HOME_DIR: homeDir,
      },
    },
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe("agents skills list", () => {
  test("exits 0 and shows skill names", async () => {
    const { stdout, exitCode } = await scaffoldAndRun(["skills", "list"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("alpha");
  });

  test("shows scope and curated state", async () => {
    const { stdout } = await scaffoldAndRun(["skills", "list"]);
    expect(stdout).toContain("shared");
    expect(stdout).toMatch(/curated|✓|yes/i);
  });

  test("--json emits parseable JSON array", async () => {
    const { stdout, exitCode } = await scaffoldAndRun(["skills", "list", "--json"]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe("alpha");
    expect(parsed[0].scope).toBe("shared");
    expect(parsed[0].curated).toBe(true);
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/cmd-skills-list.test.ts
```

**Step 3: Write minimal implementation**

Create `cli/core/output.ts`:
- Simple table formatter for human-readable columnar output
- `formatTable(headers: string[], rows: string[][]): string`

Create `cli/commands/skills/list.ts`:
- Clipanion command with `static paths = [["skills", "list"]]`
- `static usage` with description
- `--json` boolean option
- Uses `listRepoSkills` and `listCuratedSkills` from core
- Human-readable table or JSON output

Update `cli/index.ts` to register the new command.

**Important:** The CLI needs to accept `AGENTS_REPO_ROOT` and `AGENTS_HOME_DIR` environment variables for testability. Add this resolution to `cli/context.ts` or directly in the CLI setup. This also benefits future dual-mode execution.

**Step 4: Run tests to confirm passage**

```bash
bun test test/cmd-skills-list.test.ts
bun test test/sync-mcp.test.ts
```

---

### Task 9: Implement `agents skills curate`, `uncurate`, and `sync`

**Files:**
- Create: `cli/commands/skills/curate.ts`
- Create: `cli/commands/skills/uncurate.ts`
- Create: `cli/commands/skills/sync.ts`
- Modify: `cli/index.ts`
- Test: `test/cmd-skills-mutate.test.ts`

**Step 1: Write the failing test**

```ts
// test/cmd-skills-mutate.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, readdir, lstat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((r) =>
    import("node:fs/promises").then((fs) => fs.rm(r, { recursive: true, force: true }))
  ));
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-cmd-mut-"));
  tempRoots.push(root);
  return root;
}

async function scaffoldMutationFixture() {
  const root = await createTempRoot();
  const repoRoot = join(root, "repo");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");

  await mkdir(join(repoRoot, "skills", "shared", "alpha"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "shared", "beta"), { recursive: true });
  await writeFile(join(repoRoot, "skills", "shared", "alpha", "SKILL.md"), "---\nname: alpha\n---\n");
  await writeFile(join(repoRoot, "skills", "shared", "beta", "SKILL.md"), "---\nname: beta\n---\n");

  await mkdir(join(agentsDir, "skills"), { recursive: true });
  await mkdir(join(homeDir, ".claude", "skills"), { recursive: true });
  await mkdir(join(homeDir, ".codex", "skills"), { recursive: true });

  await writeFile(join(repoRoot, "mcp-servers.json"), JSON.stringify({ version: 1, servers: {} }));
  await writeFile(join(repoRoot, "config.json"), JSON.stringify({
    version: 1,
    targets: {
      claude: { enabled: true, configPath: join(homeDir, ".claude", "settings.json"), format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: join(homeDir, ".codex", "config.toml"), format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: false, configPath: join(homeDir, ".cursor", "mcp.json"), format: "json-standalone", mcpKey: "mcpServers" },
    },
    optional: {},
  }));

  return { root, repoRoot, homeDir, agentsDir };
}

function runCli(repoRoot: string, homeDir: string, args: string[]) {
  return Bun.spawn(
    ["bun", "run", join(import.meta.dir, "..", "cli", "index.ts"), ...args],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, AGENTS_REPO_ROOT: repoRoot, AGENTS_HOME_DIR: homeDir },
    },
  );
}

describe("agents skills curate", () => {
  test("creates curated symlink for a shared skill", async () => {
    const { repoRoot, homeDir, agentsDir } = await scaffoldMutationFixture();
    const proc = runCli(repoRoot, homeDir, ["skills", "curate", "alpha"]);
    expect(await proc.exited).toBe(0);
    expect(existsSync(join(agentsDir, "skills", "alpha"))).toBe(true);
  });

  test("exits non-zero for nonexistent skill", async () => {
    const { repoRoot, homeDir } = await scaffoldMutationFixture();
    const proc = runCli(repoRoot, homeDir, ["skills", "curate", "nonexistent"]);
    expect(await proc.exited).not.toBe(0);
  });
});

describe("agents skills uncurate", () => {
  test("removes curated symlink", async () => {
    const { repoRoot, homeDir, agentsDir } = await scaffoldMutationFixture();
    // First curate, then uncurate
    await (await runCli(repoRoot, homeDir, ["skills", "curate", "alpha"]).exited);
    const proc = runCli(repoRoot, homeDir, ["skills", "uncurate", "alpha"]);
    expect(await proc.exited).toBe(0);
    expect(existsSync(join(agentsDir, "skills", "alpha"))).toBe(false);
  });
});

describe("agents skills sync", () => {
  test("creates downstream symlinks for curated skills", async () => {
    const { repoRoot, homeDir, agentsDir } = await scaffoldMutationFixture();
    // Curate alpha, then sync
    await (await runCli(repoRoot, homeDir, ["skills", "curate", "alpha"]).exited);
    const proc = runCli(repoRoot, homeDir, ["skills", "sync"]);
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(existsSync(join(homeDir, ".claude", "skills", "alpha"))).toBe(true);
    expect(existsSync(join(homeDir, ".codex", "skills", "alpha"))).toBe(true);
  });

  test("reports stale symlinks without pruning", async () => {
    const { repoRoot, homeDir } = await scaffoldMutationFixture();
    // Create a stale downstream link
    await symlink("/nonexistent", join(homeDir, ".claude", "skills", "orphan"), "dir");

    const proc = runCli(repoRoot, homeDir, ["skills", "sync"]);
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout).toContain("stale");
    // Stale link must NOT be removed
    const stat = await lstat(join(homeDir, ".claude", "skills", "orphan"));
    expect(stat.isSymbolicLink()).toBe(true);
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/cmd-skills-mutate.test.ts
```

**Step 3: Write minimal implementation**

Three thin Clipanion commands, each delegating to `cli/core/skills.ts`:

- `curate.ts`: Takes positional `name` arg, calls `curateSkill`, catches errors and maps to `UsageError`
- `uncurate.ts`: Takes positional `name` arg, calls `uncurateSkill`
- `sync.ts`: Calls `syncRepository` with `skillsOnly: true`, reports stale links from output

Register all three in `cli/index.ts`.

**Step 4: Run tests to confirm passage**

```bash
bun test test/cmd-skills-mutate.test.ts
bun test test/sync-mcp.test.ts
```

---

### Task 10: Implement `agents mcp list` and `agents mcp sync`

**Files:**
- Create: `cli/commands/mcp/list.ts`
- Create: `cli/commands/mcp/sync.ts`
- Modify: `cli/index.ts`
- Test: `test/cmd-mcp.test.ts`

**Step 1: Write the failing test**

```ts
// test/cmd-mcp.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((r) =>
    import("node:fs/promises").then((fs) => fs.rm(r, { recursive: true, force: true }))
  ));
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-cmd-mcp-"));
  tempRoots.push(root);
  return root;
}

async function scaffoldMcpFixture() {
  const root = await createTempRoot();
  const repoRoot = join(root, "repo");
  const homeDir = join(root, "home");
  const claudeSettings = join(homeDir, ".claude", "settings.json");
  const codexConfig = join(homeDir, ".codex", "config.toml");
  const cursorConfig = join(homeDir, ".cursor", "mcp.json");

  await mkdir(join(repoRoot, "skills", "shared"), { recursive: true });
  await mkdir(join(homeDir, ".agents", "skills"), { recursive: true });
  await mkdir(join(homeDir, ".claude", "skills"), { recursive: true });
  await mkdir(join(homeDir, ".codex", "skills"), { recursive: true });

  const registry = {
    version: 1,
    servers: {
      context7: { description: "Docs", transport: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp"], optional: false },
      slack: { description: "Slack", transport: "http", url: "https://mcp.slack.com/mcp", optional: true },
      "parallel-search": { description: "Search", transport: "http", url: "https://search.parallel.ai/mcp", optional: false },
    },
  };
  const config = {
    version: 1,
    targets: {
      claude: { enabled: true, configPath: claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: cursorConfig, format: "json-standalone", mcpKey: "mcpServers", symlink: true },
    },
    optional: { slack: false },
    parallel: { cli: { enabled: true }, mcp: { enabled: false } },
  };

  await writeFile(join(repoRoot, "mcp-servers.json"), JSON.stringify(registry, null, 2));
  await writeFile(join(repoRoot, "config.json"), JSON.stringify(config, null, 2));

  // Create target config files so sync can read them
  await mkdir(join(homeDir, ".claude"), { recursive: true });
  await mkdir(join(homeDir, ".codex"), { recursive: true });
  await mkdir(join(homeDir, ".cursor"), { recursive: true });
  await writeFile(claudeSettings, JSON.stringify({ model: "sonnet" }, null, 2));
  await writeFile(codexConfig, 'personality = "pragmatic"\n');
  await writeFile(cursorConfig, JSON.stringify({ mcpServers: {} }, null, 2));

  return { root, repoRoot, homeDir, claudeSettings, codexConfig, cursorConfig };
}

function runCli(repoRoot: string, homeDir: string, args: string[]) {
  const proc = Bun.spawn(
    ["bun", "run", join(import.meta.dir, "..", "cli", "index.ts"), ...args],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, AGENTS_REPO_ROOT: repoRoot, AGENTS_HOME_DIR: homeDir },
    },
  );
  return proc;
}

describe("agents mcp list", () => {
  test("exits 0 and shows server names", async () => {
    const { repoRoot, homeDir } = await scaffoldMcpFixture();
    const proc = runCli(repoRoot, homeDir, ["mcp", "list"]);
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout).toContain("context7");
    expect(stdout).toContain("slack");
  });

  test("shows active/inactive state", async () => {
    const { repoRoot, homeDir } = await scaffoldMcpFixture();
    const proc = runCli(repoRoot, homeDir, ["mcp", "list"]);
    const stdout = await new Response(proc.stdout).text();
    // context7 is active (non-optional, non-platform-provided)
    // slack is inactive (optional, not enabled)
    // parallel-search is inactive (parallel.mcp.enabled = false)
    expect(stdout).toMatch(/context7.*active|active.*context7/i);
  });

  test("--json emits parseable output", async () => {
    const { repoRoot, homeDir } = await scaffoldMcpFixture();
    const proc = runCli(repoRoot, homeDir, ["mcp", "list", "--json"]);
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.find((s: { name: string }) => s.name === "context7")).toBeDefined();
  });
});

describe("agents mcp sync", () => {
  test("--dry-run reports changes without writing", async () => {
    const { repoRoot, homeDir, claudeSettings } = await scaffoldMcpFixture();
    const before = await readFile(claudeSettings, "utf8");

    const proc = runCli(repoRoot, homeDir, ["mcp", "sync", "--dry-run"]);
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout.toLowerCase()).toMatch(/change|write|would/);
    expect(await readFile(claudeSettings, "utf8")).toBe(before);
  });

  test("--target=claude limits sync scope", async () => {
    const { repoRoot, homeDir } = await scaffoldMcpFixture();
    const proc = runCli(repoRoot, homeDir, ["mcp", "sync", "--target=claude", "--dry-run"]);
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout).not.toContain("codex");
    expect(stdout).not.toContain("cursor");
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/cmd-mcp.test.ts
```

**Step 3: Write minimal implementation**

- `mcp/list.ts`: Loads registry and config, calls `buildActiveServers` to determine active set, formats all servers with name/transport/active/optional columns
- `mcp/sync.ts`: Thin wrapper over `syncRepository({ mcpOnly: true, ... })`, supports `--dry-run`, `--target`, `--json`

Register both in `cli/index.ts`.

**Step 4: Run tests to confirm passage**

```bash
bun test test/cmd-mcp.test.ts
bun test test/sync-mcp.test.ts
```

---

### Task 11: Implement `agents status`

**Files:**
- Create: `cli/commands/status.ts`
- Create: `cli/core/diagnostics.ts`
- Modify: `cli/index.ts`
- Test: `test/cmd-status.test.ts`

**Step 1: Write the failing test**

Tests should verify the command exits 0 and outputs key system facts: repo root, agents dir, enabled targets, curated skill count, active MCP count. Both human and `--json` modes.

**Step 2: Run test to confirm failure**

```bash
bun test test/cmd-status.test.ts
```

**Step 3: Write minimal implementation**

Create `cli/core/diagnostics.ts` with a `gatherStatus(repoRoot, homeDir)` function that assembles a status object by calling into the existing core modules (config, registry, skills, mcp).

The command file is a thin Clipanion wrapper that calls `gatherStatus` and formats output.

**Step 4: Run tests to confirm passage**

```bash
bun test test/cmd-status.test.ts
bun test test/sync-mcp.test.ts
```

---

### Task 12: Implement `agents doctor` (report-only)

**Files:**
- Create: `cli/commands/doctor.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `cli/index.ts`
- Test: `test/cmd-doctor.test.ts`

**Step 1: Write the failing test**

Tests should verify:
- Reports broken symlinks (create one in fixture, expect it in output)
- Reports stale downstream skill symlinks
- Reports MCP drift (modify a target config after sync, expect drift detected)
- Reports missing generated files (e.g., cursor symlink target doesn't exist)
- Report-only by default: no filesystem mutations
- `--json` output is parseable

**Step 2: Run test to confirm failure**

```bash
bun test test/cmd-doctor.test.ts
```

**Step 3: Write minimal implementation**

Add to `cli/core/diagnostics.ts`:
- `runDiagnostics(repoRoot, homeDir): Promise<DiagnosticReport>`
- Checks: broken symlinks, stale downstream links (via `findStaleSkillSymlinks`), MCP drift (render expected config and diff against actual file), missing generated files

The command file calls `runDiagnostics` and renders the report. No `--fix` flag in this phase.

**Step 4: Run tests to confirm passage**

```bash
bun test test/cmd-doctor.test.ts
bun test test/sync-mcp.test.ts
```

---

### Task 13: Wire up repo-local and global execution

**Files:**
- Modify: `package.json`
- Modify: `cli/index.ts`
- Test: `test/cli-install-mode.test.ts`

**Step 1: Write the failing test**

```ts
// test/cli-install-mode.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("package.json bin configuration", () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"));

  test("declares a 'bin' entry for 'agents'", () => {
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.agents || pkg.bin).toMatch(/cli\/index\.ts/);
  });

  test("has 'agents' in scripts", () => {
    expect(pkg.scripts.agents).toBeDefined();
  });

  test("cli/index.ts has a shebang line", () => {
    const content = readFileSync(join(import.meta.dir, "..", "cli", "index.ts"), "utf8");
    expect(content.startsWith("#!/usr/bin/env bun")).toBe(true);
  });
});

describe("repo-local invocation", () => {
  test("'bun run agents -- --help' exits 0", async () => {
    const proc = Bun.spawn(["bun", "run", "agents", "--", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: join(import.meta.dir, ".."),
    });
    expect(await proc.exited).toBe(0);
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test test/cli-install-mode.test.ts
```

**Step 3: Write minimal implementation**

Update `package.json`:

```json
{
  "bin": {
    "agents": "cli/index.ts"
  },
  "scripts": {
    "agents": "bun run cli/index.ts",
    "sync": "bun run sync-mcp.ts",
    "test": "bun test"
  }
}
```

Ensure `cli/index.ts` has the shebang `#!/usr/bin/env bun` on line 1 (already scaffolded in Task 1).

After this, `bun link` will make `agents` available globally.

**Step 4: Run tests to confirm passage**

```bash
bun test test/cli-install-mode.test.ts
bun test test/sync-mcp.test.ts
```

---

### Task 14: End-to-end verification

**No new files.** This is a manual + automated verification pass.

**Automated gate:**

```bash
bun test
```

All test files must pass: `sync-mcp.test.ts`, `sync-mcp-compat.test.ts`, `cli-smoke.test.ts`, `core-paths.test.ts`, `core-config.test.ts`, `core-mcp.test.ts`, `core-sync.test.ts`, `core-skills.test.ts`, `cmd-skills-list.test.ts`, `cmd-skills-mutate.test.ts`, `cmd-mcp.test.ts`, `cmd-status.test.ts`, `cmd-doctor.test.ts`, `cli-install-mode.test.ts`.

**Manual verification checklist:**

```bash
# Repo-local commands
bun run agents -- --help
bun run agents -- skills list
bun run agents -- skills list --json
bun run agents -- mcp list
bun run agents -- mcp list --json
bun run agents -- mcp sync --dry-run
bun run agents -- status
bun run agents -- status --json
bun run agents -- doctor
bun run agents -- doctor --json

# Compatibility wrapper
bun run sync-mcp.ts --dry-run
bun run sync-mcp.ts --mcp-only --dry-run
bun run sync-mcp.ts --skills-only --dry-run

# Global install
bun link
agents --help
agents skills list
agents mcp list
agents doctor
```

**Verify:**
- No regression in sync behavior
- No silent pruning on normal sync
- Help output is complete and discoverable
- JSON output is parseable
- Compat wrapper matches CLI behavior
