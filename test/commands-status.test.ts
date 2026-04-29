// ABOUTME: Verifies the public `bgng status` command in human and JSON modes.
// ABOUTME: Ensures the CLI can summarize repo, aggregation, target, and skill state consistently.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("bgng status", () => {
  test("reports repo root, agents dir, and counts", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["status"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(fixture.repoRoot);
    expect(result.stdout).toContain(fixture.agentsDir);
    expect(result.stdout).toContain("curatedSkillCount");
  });

  test("supports --json output", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["status", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { repoRoot: string; curatedSkillCount: number };
    expect(parsed.repoRoot).toBe(fixture.repoRoot);
    expect(parsed.curatedSkillCount).toBe(1);
  });

  test("json output includes global default and user MCP library counts", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { saveMcpLibrary } = await import("../cli/core/mcp-library");
    await saveMcpLibrary(fixture.agentsDir, {
      version: 1,
      servers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "npx",
          optional: true,
        },
      },
    });
    const config = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    config.defaults = { skills: ["alpha"], mcpServers: ["context7"] };
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(config, null, 2));

    const result = await runAgentsCli(["status", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      globalDefaultSkillCount?: number;
      globalDefaultMcpServerCount?: number;
      userLibraryMcpServerCount?: number;
    };
    expect(parsed.globalDefaultSkillCount).toBe(1);
    expect(parsed.globalDefaultMcpServerCount).toBe(1);
    expect(parsed.userLibraryMcpServerCount).toBe(1);
  });

  test("shows project section when project config exists", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(projectConfigPath, JSON.stringify({ version: 1, skills: { include: ["beta"], exclude: ["alpha"] } }, null, 2));

    const result = await runAgentsCli(["status"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Project");
    expect(result.stdout).toContain(projectConfigPath);
  });

  test("shows project extension overrides", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(
      projectConfigPath,
      JSON.stringify({ version: 1, extensions: { parallel: { enabled: true, skills: true, mcp: false } } }, null, 2),
    );

    const result = await runAgentsCli(["status"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Extension overrides");
    expect(result.stdout).toContain("parallel enabled");
  });

  test("json output includes project info when config exists", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(projectConfigPath, JSON.stringify({ version: 1, targets: { codex: { enabled: false } } }, null, 2));

    const result = await runAgentsCli(["status", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    const parsed = JSON.parse(result.stdout) as { project?: { configPath: string } };
    expect(result.exitCode).toBe(0);
    expect(await realpath(parsed.project?.configPath ?? projectConfigPath)).toBe(await realpath(projectConfigPath));
  });
});
