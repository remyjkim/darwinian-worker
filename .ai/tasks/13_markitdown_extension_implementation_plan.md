# MarkItDown Extension Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every behavior change. Do not commit unless explicitly instructed.

**Goal:** Add a first-class `markitdown` bgng extension that can be enabled per project, derives a repo-native document conversion skill, reports runtime health, and can install the global `markitdown` CLI through `uv` after explicit user consent.

**Architecture:** Treat MarkItDown as a CLI-first extension with no MCP server. Add it to the existing typed extension registry, translate `extensions.markitdown` project config into a derived skill include/exclude, and add a setup adapter that plans and optionally executes `uv tool install --python 3.12 'markitdown[all]'`. Runtime availability depends on `markitdown`; `uv` is installer support and should not make an already-working runtime look unavailable.

**Tech Stack:** Bun, TypeScript, Clipanion, Bun test runner, filesystem-backed project config, existing bgng extension command helpers, fake executable fixtures.

---

## Evidence Base

Read these before implementing:

- Design doc: `.ai/analyses/24_markitdown_extension_design.md`
- Mentor guide: `.ai/analyses/23_markitdown_global_install_guide.md`
- Existing extension plan: `.ai/tasks/07_extensions-beads-parallel-implementation-plan.md`
- Extension registry: `cli/core/extensions/registry.ts`
- Extension status: `cli/core/extensions/status.ts`
- Extension doctor: `cli/core/extensions/doctor.ts`
- Extension setup command: `cli/commands/extensions/setup.ts`
- Project config derivation: `cli/core/extensions/project-config.ts`
- Add extension command: `cli/commands/add/extension.ts`
- Command helper tests: `test/core-extension-commands.test.ts`
- Extension command tests: `test/commands-extensions.test.ts`

Useful facts:

- The install command should be spawned as `["uv", "tool", "install", "--python", "3.12", "markitdown[all]"]`.
- Do not shell-quote `markitdown[all]` inside argv arrays.
- `uv tool list` has no `--json` flag in the locally installed uv 0.9.12.
- `markitdown --version` and `printf '# Smoke\n\nhello\n' | markitdown -x md` are lightweight runtime checks.

## Task 1: Lock In Extension Registry Expectations

**Files:**

- Modify: `test/core-extensions.test.ts`
- Modify: `cli/core/extensions/types.ts`
- Modify: `cli/core/extensions/registry.ts`

**Step 1: Write failing tests**

Extend `test/core-extensions.test.ts`.

Change the list expectation:

```ts
expect(listExtensions().map((extension) => extension.id)).toEqual(["beads", "parallel", "markitdown"]);
```

Add a MarkItDown definition test:

```ts
test("defines markitdown as a CLI-first document conversion extension", () => {
  const markitdown = getExtension("markitdown");
  expect(markitdown?.displayName).toBe("MarkItDown");
  expect(markitdown?.scopes).toEqual(["global", "project"]);
  expect(markitdown?.defaultModes).toEqual(["cli", "skills"]);
  expect(markitdown?.commands.some((command) => command.name === "markitdown" && command.required)).toBe(true);
  expect(markitdown?.commands.some((command) => command.name === "uv" && !command.required)).toBe(true);
  expect(markitdown?.skills.map((skill) => skill.name)).toEqual(["markitdown-document-conversion"]);
  expect(markitdown?.mcpServers).toEqual([]);
});
```

If adding `purpose` to command requirements, add:

```ts
expect(markitdown?.commands.find((command) => command.name === "markitdown")?.purpose).toBe("runtime");
expect(markitdown?.commands.find((command) => command.name === "uv")?.purpose).toBe("installer");
```

**Step 2: Verify RED**

Run:

```bash
bun test test/core-extensions.test.ts
```

Expected: FAIL because the registry does not include MarkItDown yet.

**Step 3: Extend command requirement types**

In `cli/core/extensions/types.ts`, add:

```ts
export type ExtensionCommandPurpose = "runtime" | "installer";
```

Update `ExtensionCommandRequirement`:

```ts
export interface ExtensionCommandRequirement {
  name: string;
  required: boolean;
  installHints: string[];
  purpose?: ExtensionCommandPurpose;
}
```

Existing extensions can omit `purpose`; code should treat omitted as `"runtime"`.

**Step 4: Add registry metadata**

In `cli/core/extensions/registry.ts`, append the MarkItDown definition after Parallel:

```ts
{
  id: "markitdown",
  displayName: "MarkItDown",
  description: "Document-to-Markdown conversion through Microsoft's markitdown CLI.",
  scopes: ["global", "project"],
  defaultModes: ["cli", "skills"],
  commands: [
    {
      name: "markitdown",
      required: true,
      purpose: "runtime",
      installHints: ["uv tool install --python 3.12 'markitdown[all]'"],
    },
    {
      name: "uv",
      required: false,
      purpose: "installer",
      installHints: ["brew install uv", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
    },
  ],
  skills: [{ name: "markitdown-document-conversion", source: "repo", defaultIncluded: true }],
  mcpServers: [],
  docs: [
    { label: "MarkItDown README", url: "https://github.com/microsoft/markitdown" },
    { label: "MarkItDown PyPI", url: "https://pypi.org/project/markitdown/" },
    { label: "uv tools", url: "https://docs.astral.sh/uv/concepts/tools/" },
  ],
}
```

**Step 5: Verify GREEN**

Run:

```bash
bun test test/core-extensions.test.ts
```

Expected: PASS, except the future skill existence test will still fail until Task 7 if you add it now.

## Task 2: Add Project Config Derivation

**Files:**

- Modify: `test/core-project.test.ts`
- Modify: `cli/core/extensions/project-config.ts`

**Step 1: Write failing tests**

Add a test to `test/core-project.test.ts`:

```ts
test("mergeProjectConfig derives MarkItDown extension skill", async () => {
  const config = createFixtureConfig({
    claudeSettings: "/tmp/.claude/settings.json",
    codexConfig: "/tmp/.codex/config.toml",
    cursorConfig: "/tmp/.cursor/mcp.json",
  });
  const registry = createFixtureRegistry();

  const { mergeProjectConfig } = await import("../cli/core/project");
  const merged = mergeProjectConfig(config, registry, {
    version: 1,
    extensions: {
      markitdown: { enabled: true, skills: true },
    },
  });

  expect(merged.skills?.include).toContain("markitdown-document-conversion");
});
```

Add an explicit exclude-wins test:

```ts
test("mergeProjectConfig lets explicit excludes override MarkItDown skill", async () => {
  const config = createFixtureConfig({
    claudeSettings: "/tmp/.claude/settings.json",
    codexConfig: "/tmp/.codex/config.toml",
    cursorConfig: "/tmp/.cursor/mcp.json",
  });
  const registry = createFixtureRegistry();

  const { mergeProjectConfig } = await import("../cli/core/project");
  const merged = mergeProjectConfig(config, registry, {
    version: 1,
    extensions: {
      markitdown: { enabled: true, skills: true },
    },
    skills: {
      exclude: ["markitdown-document-conversion"],
    },
  });

  expect(merged.skills?.include ?? []).not.toContain("markitdown-document-conversion");
  expect(merged.skills?.exclude).toContain("markitdown-document-conversion");
});
```

**Step 2: Verify RED**

Run:

```bash
bun test test/core-project.test.ts
```

Expected: FAIL because `extensions.markitdown` is ignored.

**Step 3: Implement derivation**

In `cli/core/extensions/project-config.ts`, add:

```ts
const markitdown = options.extensions?.markitdown;
if (markitdown) {
  const skills = extensionSkillNames("markitdown");
  if (markitdown.enabled === false) {
    addAll(options.exclude, skills);
  } else {
    addAll(markitdown.skills === false ? options.exclude : options.include, skills);
  }
}
```

Keep this separate from Parallel and Beads. MarkItDown should not mutate MCP config.

**Step 4: Verify GREEN**

Run:

```bash
bun test test/core-project.test.ts
```

Expected: PASS.

## Task 3: Add MarkItDown Core Adapter

**Files:**

- Create: `cli/core/extensions/markitdown.ts`
- Create: `test/core-markitdown-extension.test.ts`

**Step 1: Write failing tests**

Create `test/core-markitdown-extension.test.ts`.

Test project config builder:

```ts
import { describe, expect, test } from "bun:test";

describe("markitdown extension setup planner", () => {
  test("builds default project config with skills enabled", async () => {
    const { buildMarkitdownProjectConfig } = await import("../cli/core/extensions/markitdown");

    expect(buildMarkitdownProjectConfig({})).toEqual({ enabled: true, skills: true });
    expect(buildMarkitdownProjectConfig({ skills: false })).toEqual({ enabled: true, skills: false });
  });
});
```

Test setup planning:

```ts
test("plans uv install only when runtime is missing and install is approved", async () => {
  const { planMarkitdownSetup } = await import("../cli/core/extensions/markitdown");

  const plan = planMarkitdownSetup({
    projectDir: "/tmp/project",
    markitdownAvailable: false,
    uvAvailable: true,
    installApproved: true,
    skills: true,
  });

  expect(plan.commands.map((command) => command.cmd)).toEqual([
    ["uv", "tool", "install", "--python", "3.12", "markitdown[all]"],
  ]);
  expect(plan.projectConfigChange.config).toEqual({ enabled: true, skills: true });
});
```

Test no install when runtime exists:

```ts
test("does not plan install when markitdown already exists", async () => {
  const { planMarkitdownSetup } = await import("../cli/core/extensions/markitdown");

  const plan = planMarkitdownSetup({
    projectDir: "/tmp/project",
    markitdownAvailable: true,
    uvAvailable: false,
    installApproved: false,
    skills: true,
  });

  expect(plan.commands).toEqual([]);
  expect(plan.warnings).toEqual([]);
});
```

Test missing uv:

```ts
test("reports missing uv when install is approved but uv is unavailable", async () => {
  const { planMarkitdownSetup } = await import("../cli/core/extensions/markitdown");

  const plan = planMarkitdownSetup({
    projectDir: "/tmp/project",
    markitdownAvailable: false,
    uvAvailable: false,
    installApproved: true,
    skills: true,
  });

  expect(plan.commands).toEqual([]);
  expect(plan.warnings).toContain("uv command is required to install MarkItDown.");
});
```

**Step 2: Verify RED**

Run:

```bash
bun test test/core-markitdown-extension.test.ts
```

Expected: FAIL because the adapter does not exist.

**Step 3: Implement adapter**

Create `cli/core/extensions/markitdown.ts`:

```ts
import { ensureProjectExtensionConfig, projectConfigPath } from "./project-config";

export interface MarkitdownSetupOptions {
  projectDir: string;
  markitdownAvailable: boolean;
  uvAvailable: boolean;
  installApproved: boolean;
  skills?: boolean;
}

export interface MarkitdownSetupPlan {
  projectDir: string;
  commands: Array<{ cmd: string[]; reason: string; mutates: boolean }>;
  projectConfigChange: {
    extensionName: "markitdown";
    config: { enabled: true; skills: boolean };
    path: string;
  };
  warnings: string[];
}

export const markitdownInstallCommand = ["uv", "tool", "install", "--python", "3.12", "markitdown[all]"];

export function buildMarkitdownProjectConfig(options: { skills?: boolean }) {
  return {
    enabled: true,
    skills: options.skills !== false,
  };
}

export function planMarkitdownSetup(options: MarkitdownSetupOptions): MarkitdownSetupPlan {
  const config = buildMarkitdownProjectConfig({ skills: options.skills });
  const warnings: string[] = [];
  const commands: MarkitdownSetupPlan["commands"] = [];

  if (!options.markitdownAvailable && options.installApproved) {
    if (options.uvAvailable) {
      commands.push({
        cmd: markitdownInstallCommand,
        reason: "install MarkItDown globally through uv",
        mutates: true,
      });
    } else {
      warnings.push("uv command is required to install MarkItDown.");
    }
  }

  return {
    projectDir: options.projectDir,
    commands,
    projectConfigChange: {
      extensionName: "markitdown",
      config,
      path: projectConfigPath(options.projectDir),
    },
    warnings,
  };
}

export function ensureMarkitdownProjectExtensionConfig(options: {
  projectDir: string;
  skills?: boolean;
}) {
  return ensureProjectExtensionConfig(
    options.projectDir,
    "markitdown",
    buildMarkitdownProjectConfig({ skills: options.skills }),
  );
}
```

**Step 4: Verify GREEN**

Run:

```bash
bun test test/core-markitdown-extension.test.ts
```

Expected: PASS.

## Task 4: Add Install Decision Resolution

**Files:**

- Modify: `cli/core/interactivity.ts`
- Modify: `test/core-interactivity.test.ts`

**Step 1: Write failing tests**

Add a pure resolver for setup install mode. Suggested type:

```ts
export type InstallDecisionMode = "prompt" | "install" | "skip" | "error";
```

Tests:

```ts
test("resolves install decision mode for explicit MarkItDown setup flags", async () => {
  const { resolveInstallDecisionMode } = await import("../cli/core/interactivity");

  expect(resolveInstallDecisionMode({ install: true, noInstall: false, stdinIsTTY: false, stdoutIsTTY: false }).mode).toBe("install");
  expect(resolveInstallDecisionMode({ install: false, noInstall: true, stdinIsTTY: false, stdoutIsTTY: false }).mode).toBe("skip");
});
```

Conflict test:

```ts
test("rejects conflicting install flags", async () => {
  const { resolveInstallDecisionMode } = await import("../cli/core/interactivity");

  const result = resolveInstallDecisionMode({ install: true, noInstall: true, stdinIsTTY: true, stdoutIsTTY: true });
  expect(result.mode).toBe("error");
  expect(result.message).toContain("Use either --install or --no-install");
});
```

TTY test:

```ts
test("prompts only when install decision needs a TTY", async () => {
  const { resolveInstallDecisionMode } = await import("../cli/core/interactivity");

  expect(resolveInstallDecisionMode({ install: false, noInstall: false, stdinIsTTY: true, stdoutIsTTY: true }).mode).toBe("prompt");
  const result = resolveInstallDecisionMode({ install: false, noInstall: false, stdinIsTTY: false, stdoutIsTTY: false });
  expect(result.mode).toBe("error");
  expect(result.message).toContain("--install or --no-install");
});
```

**Step 2: Verify RED**

Run:

```bash
bun test test/core-interactivity.test.ts
```

Expected: FAIL because the resolver does not exist.

**Step 3: Implement resolver**

Add to `cli/core/interactivity.ts`:

```ts
export type InstallDecisionMode = "prompt" | "install" | "skip" | "error";

export function resolveInstallDecisionMode(options: {
  install: boolean;
  noInstall: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
}): { mode: InstallDecisionMode; message?: string } {
  if (options.install && options.noInstall) {
    return { mode: "error", message: "Use either --install or --no-install, not both." };
  }
  if (options.install) {
    return { mode: "install" };
  }
  if (options.noInstall) {
    return { mode: "skip" };
  }
  if (options.stdinIsTTY && options.stdoutIsTTY) {
    return { mode: "prompt" };
  }
  return { mode: "error", message: "MarkItDown setup needs an install decision. Use --install or --no-install for scripts." };
}
```

**Step 4: Verify GREEN**

Run:

```bash
bun test test/core-interactivity.test.ts
```

Expected: PASS.

## Task 5: Add MarkItDown To `bgng add extension`

**Files:**

- Modify: `test/commands-add-extension.test.ts`
- Modify: `cli/commands/add/extension.ts`

**Step 1: Write failing tests**

Add:

```ts
test("adds MarkItDown semantic config without installing external tools", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(projectDir, { recursive: true });

  const result = await runAgentsCli(["add", "extension", "markitdown"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Added MarkItDown extension");
  const config = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8")) as {
    extensions?: { markitdown?: unknown };
  };
  expect(config.extensions?.markitdown).toEqual({ enabled: true, skills: true });
});
```

Add skip skills test:

```ts
test("adds MarkItDown extension with skills disabled", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(projectDir, { recursive: true });

  const result = await runAgentsCli(["add", "extension", "markitdown", "--skip-skills"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  const config = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8")) as {
    extensions?: { markitdown?: unknown };
  };
  expect(config.extensions?.markitdown).toEqual({ enabled: true, skills: false });
});
```

**Step 2: Verify RED**

Run:

```bash
bun test test/commands-add-extension.test.ts
```

Expected: FAIL because adding MarkItDown is not implemented.

**Step 3: Implement add support**

In `cli/commands/add/extension.ts`:

- import `buildMarkitdownProjectConfig`
- add branch:

```ts
} else if (this.extensionName === "markitdown") {
  extensionConfig = buildMarkitdownProjectConfig({ skills: !this.skipSkills });
  next.unshift("bgng extensions setup markitdown");
}
```

Do not run uv from `add extension`.

**Step 4: Verify GREEN**

Run:

```bash
bun test test/commands-add-extension.test.ts
```

Expected: PASS.

## Task 6: Add MarkItDown Setup Command Behavior

**Files:**

- Modify: `test/commands-extensions.test.ts`
- Modify: `cli/commands/extensions/setup.ts`

**Step 1: Add helper in tests**

`test/commands-extensions.test.ts` already has local fake executable helpers. Reuse them.

Add tests for dry-run:

```ts
test("setup markitdown dry-run previews uv install without mutation", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(projectDir, { recursive: true });
  const binDir = join(fixture.root, "bin");
  const logPath = join(fixture.root, "uv.log");
  await mkdir(binDir, { recursive: true });
  await createExecutable(binDir, "uv", `echo "$@" >> "${logPath}"`);

  const result = await runAgentsCli(
    ["extensions", "setup", "markitdown", "--dry-run", "--install"],
    cliEnv(fixture, { PATH: binDir }),
    projectDir,
  );

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("uv tool install --python 3.12 markitdown[all]");
  expect(existsSync(logPath)).toBe(false);
  expect(existsSync(join(projectDir, ".agents", "bgng", "config.json"))).toBe(false);
});
```

Add runtime already installed test:

```ts
test("setup markitdown skips install when runtime already exists", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(projectDir, { recursive: true });
  const binDir = join(fixture.root, "bin");
  const logPath = join(fixture.root, "uv.log");
  await mkdir(binDir, { recursive: true });
  await createExecutable(binDir, "markitdown", 'if [ "$1" = "--version" ]; then echo "markitdown 0.1.5"; else cat; fi');
  await createExecutable(binDir, "uv", `echo "$@" >> "${logPath}"`);

  const result = await runAgentsCli(
    ["extensions", "setup", "markitdown", "--install"],
    cliEnv(fixture, { PATH: binDir }),
    projectDir,
  );

  expect(result.exitCode).toBe(0);
  expect(existsSync(logPath)).toBe(false);
  const config = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8")) as {
    extensions?: { markitdown?: unknown };
  };
  expect(config.extensions?.markitdown).toEqual({ enabled: true, skills: true });
});
```

Add install execution test:

```ts
test("setup markitdown installs through uv when approved", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(projectDir, { recursive: true });
  const binDir = join(fixture.root, "bin");
  const logPath = join(fixture.root, "uv.log");
  await mkdir(binDir, { recursive: true });
  await createExecutable(binDir, "uv", `echo "$@" >> "${logPath}"; cat > "${binDir}/markitdown" <<'EOF'\n#!/bin/sh\nif [ "$1" = "--version" ]; then echo "markitdown 0.1.5"; else cat; fi\nEOF\nchmod +x "${binDir}/markitdown"`);

  const result = await runAgentsCli(
    ["extensions", "setup", "markitdown", "--install"],
    cliEnv(fixture, { PATH: binDir }),
    projectDir,
  );

  expect(result.exitCode).toBe(0);
  expect(await readFile(logPath, "utf8")).toContain("tool install --python 3.12 markitdown[all]");
});
```

Add non-TTY missing decision test:

```ts
test("setup markitdown requires explicit install decision without a TTY", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(projectDir, { recursive: true });

  const result = await runAgentsCli(["extensions", "setup", "markitdown"], cliEnv(fixture, { PATH: fixture.root }), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("--install or --no-install");
});
```

Add missing uv test:

```ts
test("setup markitdown reports missing uv when install is approved", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(projectDir, { recursive: true });

  const result = await runAgentsCli(["extensions", "setup", "markitdown", "--install"], cliEnv(fixture, { PATH: fixture.root }), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("uv command is required");
});
```

Add no-install test:

```ts
test("setup markitdown can configure project while skipping install", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(projectDir, { recursive: true });

  const result = await runAgentsCli(["extensions", "setup", "markitdown", "--no-install"], cliEnv(fixture, { PATH: fixture.root }), projectDir);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("MarkItDown runtime is not available");
  const config = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8")) as {
    extensions?: { markitdown?: unknown };
  };
  expect(config.extensions?.markitdown).toEqual({ enabled: true, skills: true });
});
```

**Step 2: Verify RED**

Run:

```bash
bun test test/commands-extensions.test.ts
```

Expected: FAIL because setup does not support MarkItDown.

**Step 3: Add command options**

In `cli/commands/extensions/setup.ts`, add:

```ts
install = Option.Boolean("--install", false, {
  description: "Install the extension CLI prerequisite when supported.",
});

noInstall = Option.Boolean("--no-install", false, {
  description: "Do not install missing extension CLI prerequisites.",
});
```

Reuse existing `skipSkills`.

**Step 4: Route MarkItDown setup**

In `execute()`:

```ts
if (this.extensionName === "markitdown") {
  return this.executeMarkitdownSetup();
}
```

Import:

```ts
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ensureMarkitdownProjectExtensionConfig, planMarkitdownSetup } from "../../core/extensions/markitdown";
import { resolveInstallDecisionMode } from "../../core/interactivity";
import { runExternalCommand } from "../../core/extensions/commands";
```

**Step 5: Implement `executeMarkitdownSetup`**

Implementation outline:

```ts
private async executeMarkitdownSetup() {
  const markitdown = await findCommand("markitdown", process.env);
  const uv = await findCommand("uv", process.env);
  let installApproved = false;

  if (!markitdown.available) {
    const mode = resolveInstallDecisionMode({
      install: this.install,
      noInstall: this.noInstall,
      stdinIsTTY: process.stdin.isTTY === true,
      stdoutIsTTY: process.stdout.isTTY === true,
    });
    if (mode.mode === "error") {
      throw new UsageError(mode.message ?? "Invalid install decision.");
    }
    installApproved = mode.mode === "install";
    if (mode.mode === "prompt") {
      installApproved = await this.promptMarkitdownInstall();
    }
  }

  const plan = planMarkitdownSetup({
    projectDir: this.context.cwd,
    markitdownAvailable: markitdown.available,
    uvAvailable: uv.available,
    installApproved,
    skills: !this.skipSkills,
  });

  if (installApproved && !uv.available && !markitdown.available) {
    throw new UsageError("uv command is required to install MarkItDown. Install uv with: brew install uv OR curl -LsSf https://astral.sh/uv/install.sh | sh");
  }

  if (this.dryRun) {
    // render plan; do not write project config
  }

  for (const command of plan.commands) {
    const result = await runExternalCommand({ cmd: command.cmd, cwd: this.context.cwd, env: process.env });
    if (result.exitCode !== 0) {
      throw new UsageError(`MarkItDown setup command failed: ${command.cmd.join(" ")}`);
    }
  }

  const configPath = ensureMarkitdownProjectExtensionConfig({
    projectDir: this.context.cwd,
    skills: !this.skipSkills,
  });

  const refreshed = await findCommand("markitdown", process.env);
  // Render success plus warning if refreshed.available is false.
}
```

Add:

```ts
private async promptMarkitdownInstall() {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question("Install MarkItDown with uv now? [y/N] ")).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
```

**Step 6: Render JSON and human output**

For dry-run JSON, write:

```ts
this.context.stdout.write(renderJson(plan));
```

For dry-run human output:

```text
Planned MarkItDown setup:
- uv tool install --python 3.12 markitdown[all] (install MarkItDown globally through uv)
- configure markitdown extension in <path>
- skills: enabled
```

For non-dry-run JSON, include:

```ts
{
  plan,
  results,
  projectConfigPath: configPath,
  runtimeAvailable: refreshed.available,
  runtimePath: refreshed.path
}
```

For human output, include:

```text
MarkItDown setup complete.
- Updated <project>/.agents/bgng/config.json
- markitdown: <path or missing>
```

If runtime remains missing, include:

```text
Warning: MarkItDown runtime is not available on PATH. Run uv tool update-shell and restart your shell.
```

**Step 7: Verify GREEN**

Run:

```bash
bun test test/commands-extensions.test.ts
```

Expected: PASS.

## Task 7: Add Status And Doctor Behavior

**Files:**

- Modify: `test/commands-extensions.test.ts`
- Modify: `cli/core/extensions/status.ts`
- Modify: `cli/core/extensions/doctor.ts`
- Modify: `cli/commands/extensions/status.ts` if human notes need MarkItDown-specific text

**Step 1: Write status tests**

Add to `test/commands-extensions.test.ts`:

```ts
test("status reports markitdown runtime and installer commands", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const binDir = join(fixture.root, "bin");
  await mkdir(binDir, { recursive: true });
  await createExecutable(binDir, "markitdown", 'if [ "$1" = "--version" ]; then echo "markitdown 0.1.5"; else cat; fi');
  await createExecutable(binDir, "uv", "echo uv");

  const result = await runAgentsCli(["extensions", "status", "markitdown", "--json"], cliEnv(fixture, { PATH: binDir }));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as {
    id: string;
    available: boolean;
    commands: Array<{ name: string; available: boolean }>;
  };
  expect(parsed.id).toBe("markitdown");
  expect(parsed.available).toBe(true);
  expect(parsed.commands.find((command) => command.name === "markitdown")?.available).toBe(true);
  expect(parsed.commands.find((command) => command.name === "uv")?.available).toBe(true);
});
```

Missing runtime test:

```ts
test("status marks markitdown unavailable when runtime is missing", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["extensions", "status", "markitdown", "--json"], cliEnv(fixture, { PATH: fixture.root }));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { available: boolean; warnings: string[] };
  expect(parsed.available).toBe(false);
  expect(parsed.warnings).toContain("missing required command: markitdown");
});
```

**Step 2: Write doctor tests**

Missing runtime:

```ts
test("doctor reports missing MarkItDown runtime", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["extensions", "doctor", "markitdown", "--json"], cliEnv(fixture, { PATH: fixture.root }));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { issues: string[] };
  expect(parsed.issues.some((issue) => issue.includes("markitdown command is not available"))).toBe(true);
});
```

Smoke success:

```ts
test("doctor smoke-checks MarkItDown runtime", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const binDir = join(fixture.root, "bin");
  await mkdir(binDir, { recursive: true });
  await createExecutable(binDir, "markitdown", 'if [ "$1" = "--version" ]; then echo "markitdown 0.1.5"; else cat; fi');

  const result = await runAgentsCli(["extensions", "doctor", "markitdown", "--json"], cliEnv(fixture, { PATH: binDir }));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { issues: string[] };
  expect(parsed.issues).toEqual([]);
});
```

Smoke failure:

```ts
test("doctor reports MarkItDown smoke-check failures", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const binDir = join(fixture.root, "bin");
  await mkdir(binDir, { recursive: true });
  await createExecutable(binDir, "markitdown", "exit 9");

  const result = await runAgentsCli(["extensions", "doctor", "markitdown", "--json"], cliEnv(fixture, { PATH: binDir }));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { issues: string[] };
  expect(parsed.issues.some((issue) => issue.includes("markitdown --version failed"))).toBe(true);
});
```

**Step 3: Verify RED**

Run:

```bash
bun test test/commands-extensions.test.ts
```

Expected: FAIL on MarkItDown-specific expectations.

**Step 4: Update status availability semantics**

In `cli/core/extensions/status.ts`, change availability to consider required runtime commands only:

```ts
function commandPurpose(command: { purpose?: string }) {
  return command.purpose ?? "runtime";
}
```

Then:

```ts
available: commands
  .filter((command) => command.required && commandPurpose(command) === "runtime")
  .every((command) => command.available),
```

Keep warnings for required runtime commands:

```ts
...commands
  .filter((command) => command.required && commandPurpose(command) === "runtime" && !command.available)
  .map((command) => `missing required command: ${command.name}`)
```

Do not warn when optional installer `uv` is absent and `markitdown` is present.

**Step 5: Update doctor**

In `cli/core/extensions/doctor.ts`, add:

```ts
if (status.id === "markitdown") {
  const markitdown = status.commands.find((command) => command.name === "markitdown");
  const uv = status.commands.find((command) => command.name === "uv");

  if (!markitdown?.available) {
    issues.push("markitdown command is not available. Install with: uv tool install --python 3.12 'markitdown[all]'");
    if (!uv?.available) {
      issues.push("uv command is not available, so bgng cannot install MarkItDown. Install uv with: brew install uv OR curl -LsSf https://astral.sh/uv/install.sh | sh");
    }
  } else {
    const version = await runExternalCommand({ cmd: ["markitdown", "--version"], cwd: options.cwd, env: options.env });
    if (version.exitCode !== 0) {
      issues.push(`markitdown --version failed with exit code ${version.exitCode}`);
    }

    const smoke = await runExternalCommand({
      cmd: ["sh", "-c", "printf '# Smoke\\n\\nhello\\n' | markitdown -x md"],
      cwd: options.cwd,
      env: options.env,
    });
    if (smoke.exitCode !== 0) {
      issues.push(`markitdown stdin smoke conversion failed with exit code ${smoke.exitCode}`);
    }
  }
}
```

Prefer a shell-free smoke helper if you extend `runExternalCommand` to support stdin. If you keep the `sh -c` version, tests are still portable enough for the existing macOS/Linux Bun environment.

**Step 6: Verify GREEN**

Run:

```bash
bun test test/commands-extensions.test.ts
```

Expected: PASS.

## Task 8: Add Repo-Native Skill

**Files:**

- Create: `skills/shared/markitdown-document-conversion/SKILL.md`
- Create: `test/markitdown-skill.test.ts`
- Modify: `test/core-extensions.test.ts` if adding a file existence assertion there

**Step 1: Write failing test**

Create `test/markitdown-skill.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("markitdown document conversion skill", () => {
  test("documents safe non-interactive MarkItDown usage", async () => {
    const content = await readFile(new URL("../skills/shared/markitdown-document-conversion/SKILL.md", import.meta.url), "utf8");

    expect(content).toContain("markitdown input.pdf -o output.md");
    expect(content).toContain("command -v markitdown");
    expect(content).toContain("bgng extensions setup markitdown --install");
    expect(content).toContain("--list-plugins");
    expect(content).toContain("Do not run with sudo");
  });
});
```

**Step 2: Verify RED**

Run:

```bash
bun test test/markitdown-skill.test.ts
```

Expected: FAIL because the skill file does not exist.

**Step 3: Create skill**

Create `skills/shared/markitdown-document-conversion/SKILL.md`:

````markdown
---
name: markitdown-document-conversion
description: Use when converting local documents or supported media files to Markdown with Microsoft's markitdown CLI.
---

# MarkItDown Document Conversion

Use `markitdown` for local file-to-Markdown conversion when the user asks to extract Markdown or text-oriented structure from PDFs, Office documents, spreadsheets, HTML, CSV/JSON/XML, ZIP archives, EPUBs, images, audio, or YouTube URLs.

## Workflow

1. Check availability:

   ```bash
   command -v markitdown
   markitdown --version
   ```

2. If missing, surface this setup command:

   ```bash
   bgng extensions setup markitdown --install
   ```

3. Convert files non-interactively:

   ```bash
   markitdown input.pdf -o output.md
   markitdown input.docx -o output.md
   markitdown input.pptx -o output.md
   markitdown input.xlsx -o output.md
   ```

4. For stdin, provide an extension hint:

   ```bash
   cat input.pdf | markitdown -x pdf > output.md
   ```

## Safety

- Do not run with sudo.
- Treat untrusted files, paths, and URLs as unsafe input.
- Work in a controlled directory when converting files from downloads or external sources.
- Do not use `--use-plugins` unless the user explicitly asks for plugins.
- Check plugins with `markitdown --list-plugins` before plugin-based conversion.
````

**Step 4: Verify GREEN**

Run:

```bash
bun test test/markitdown-skill.test.ts test/core-extensions.test.ts
```

Expected: PASS.

## Task 9: Update User-Facing Docs

**Files:**

- Modify: `README.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `docs-astro/src/content/docs/03-cli-reference.md`
- Modify: `docs-astro/src/content/docs/06-extensions.md`
- Modify: `docs-astro/src/content/docs/07-per-project-config.md`
- Modify: `docs-astro/src/content/docs/08-diagnostics.md`
- Modify: `test/docs-readiness.test.ts`

**Step 1: Write failing docs readiness expectations**

In `test/docs-readiness.test.ts`, add assertions for README and usage guide:

```ts
expect(doc).toContain("markitdown");
expect(doc).toContain("bgng extensions setup markitdown");
expect(doc).toContain("uv tool install --python 3.12 'markitdown[all]'");
```

Add project guide expectations:

```ts
expect(projectGuide).toContain("extensions.markitdown");
expect(projectGuide).toContain("markitdown-document-conversion");
```

If docs-astro readiness is extended, assert its extension page contains `MarkItDown`.

**Step 2: Verify RED**

Run:

```bash
bun test test/docs-readiness.test.ts
```

Expected: FAIL until docs are updated.

**Step 3: Update README**

In command reference, add:

```text
bgng extensions setup markitdown
```

In Current Extensions:

```markdown
- `markitdown`: document-to-Markdown conversion through Microsoft's MarkItDown CLI, with guarded uv installation
```

Add section:

````markdown
### MarkItDown

MarkItDown support is CLI+skills-first. Selecting the extension for one project writes semantic config under `<project>/.agents/bgng/config.json`; `bgng write` then derives the `markitdown-document-conversion` skill for that project.

Preview setup:

```bash
bgng extensions setup markitdown --dry-run
```

Run setup and choose interactively whether to install the missing CLI:

```bash
bgng extensions setup markitdown
```

For scripts:

```bash
bgng extensions setup markitdown --install
bgng extensions setup markitdown --no-install
```

The install path is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

If the command is installed but not on PATH, run `uv tool update-shell` and restart the shell.
````

Keep the existing Markdownify section and clarify:

```markdown
`markdownify` remains the optional local MCP dependency. It is separate from the `markitdown` CLI extension.
```

**Step 4: Update knowledge docs**

In `.ai/knowledges/01_agents-cli-usage-guide.md`, add `markitdown` to optional extensions and add usage examples.

In `.ai/knowledges/02_per-project-config-guide.md`, extend the example:

```json
"markitdown": {
  "enabled": true,
  "skills": true
}
```

**Step 5: Update docs-astro**

In `docs-astro/src/content/docs/06-extensions.md`, add a MarkItDown section.

Also fix stale `bgng apply` references in docs-astro touched by this task:

- `bgng apply` -> `bgng write`
- `bgng mcp apply` -> `bgng mcp write`
- `config.json` packaged registry references -> `registry/config.json`
- `mcp-servers.json` packaged registry references -> `registry/mcp-servers.json`

Do not mass-edit historical `.ai/analyses` files unless they describe current command behavior.

**Step 6: Verify GREEN**

Run:

```bash
bun test test/docs-readiness.test.ts
```

Expected: PASS.

## Task 10: Verify CLI Output Contracts

**Files:**

- Modify: `test/commands-output-contracts.test.ts` if it has explicit extension lists
- Modify: `test/cli-smoke.test.ts` if help expectations need setup command references

**Step 1: Inspect current tests**

Run:

```bash
rg -n "extensions list|extensions setup|beads|parallel|markitdown" test/commands-output-contracts.test.ts test/cli-smoke.test.ts
```

**Step 2: Add focused assertions only if needed**

Do not overfit human table spacing. Prefer JSON command assertions already in `test/commands-extensions.test.ts`.

If adding a smoke assertion, use:

```ts
expect(stdout).toContain("bgng extensions setup");
```

**Step 3: Verify**

Run:

```bash
bun test test/commands-output-contracts.test.ts test/cli-smoke.test.ts
```

Expected: PASS.

## Task 11: Run Focused Extension Suite

**Files:**

- No edits unless failures identify real gaps.

**Step 1: Run focused tests**

Run:

```bash
bun test test/core-extensions.test.ts test/core-markitdown-extension.test.ts test/core-project.test.ts test/core-interactivity.test.ts test/commands-add-extension.test.ts test/commands-extensions.test.ts test/markitdown-skill.test.ts
```

Expected: PASS.

**Step 2: Fix failures with the smallest scoped change**

If there are failures:

- read the failure
- identify whether test or implementation is wrong
- patch only the relevant file
- rerun the focused command

## Task 12: Full Verification

**Files:**

- No edits unless verification finds issues.

**Step 1: Run full tests**

Run:

```bash
bun test
```

Expected: all tests pass.

**Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: exit 0.

**Step 3: Run release readiness**

Run:

```bash
bun run verify:release --json
```

Expected: exit 0 and JSON report has no blocking failures.

**Step 4: Run manual local smoke checks**

Run from the checkout:

```bash
bun run bgng -- extensions list
bun run bgng -- extensions show markitdown
bun run bgng -- extensions status markitdown --json
bun run bgng -- extensions doctor markitdown --json
bun run bgng -- extensions setup markitdown --dry-run
bun run bgng -- add extension markitdown --dry-run
```

Expected:

- list includes `markitdown`
- show displays commands, skill, and docs
- status reports local `markitdown` availability if installed
- doctor has no MarkItDown issues on machines where the command works
- dry-run setup does not mutate project config
- add dry-run does not mutate project config

**Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected changed files are limited to:

- extension code
- tests
- MarkItDown skill
- docs
- these plan files

Do not revert unrelated existing changes.
