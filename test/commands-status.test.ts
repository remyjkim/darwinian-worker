// ABOUTME: Verifies the public `drwn status` command in human and JSON modes.
// ABOUTME: Ensures the CLI can summarize repo, aggregation, target, and skill state consistently.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("drwn status", () => {
  test("project JSON reports the supported declared-state and diagnostic ambient contract", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, {
      name: "@me/worker",
      skills: ["worker-skill"],
      servers: {
        "worker-mcp": {
          description: "Worker MCP",
          transport: "stdio",
          command: "worker-mcp",
          optional: false,
        },
      },
    });
    const { saveMcpLibrary } = await import("../cli/core/mcp-library");
    await saveMcpLibrary(fixture.agentsDir, {
      version: 1,
      servers: {
        "machine-only": {
          description: "Machine only",
          transport: "stdio",
          command: "machine-only",
          optional: false,
        },
      },
    });
    await writeFile(fixture.codexConfig, '[mcp_servers.ambient-only]\ncommand = "ambient"\n');
    const projectDir = join(fixture.root, "project-contract");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["apply", "@me/worker@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

    const result = await runAgentsCli(["status", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode, result.stderr).toBe(0);
    const status = JSON.parse(result.stdout);
    expect(status).toMatchObject({
      schema: "drwn.project-status",
      schemaVersion: 1,
      activeWorker: "@me/worker",
      selectionSource: "project",
      ambientCapabilities: { enforcement: "diagnostic-only" },
    });
    expect(status.installedWorkers.map((entry: { id: string }) => entry.id)).toEqual(["@me/worker"]);
    expect(status.activeCards.map((entry: { id: string }) => entry.id)).toEqual(["@me/worker"]);
    expect(status.declaredCapabilities.skills.map((entry: { id: string }) => entry.id)).toContain("worker-skill");
    expect(status.declaredCapabilities.mcp.map((entry: { id: string }) => entry.id)).toContain("worker-mcp");
    expect(status.declaredCapabilities.mcp.map((entry: { id: string }) => entry.id)).not.toContain("machine-only");
    expect(status.ambientCapabilities.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ambient-only", target: "codex" }),
    ]));
  });

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
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(join(fixture.agentsDir, "drwn", "config.json"), JSON.stringify(config, null, 2));

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
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir, { skills: { include: ["beta"], exclude: ["alpha"] } });

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
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir, { extensions: { parallel: { enabled: true, skills: true, mcp: false } } });

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
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir, { targets: { codex: { enabled: false } } });

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
