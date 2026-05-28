// ABOUTME: Verifies the public `bgng mcp list` and `bgng mcp write` command surfaces.
// ABOUTME: Protects harness MCP listing and write behavior while the CLI replaces ad hoc script usage.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("bgng mcp", () => {
  test("list shows harness servers and active state", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "list"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("context7");
    expect(result.stdout).toContain("parallel-search");
  });

  test("list supports --json output", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean }>;
    expect(parsed.some((server) => server.name === "parallel-search" && server.active)).toBe(true);
  });

  test("list applies project extension MCP state", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: false });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(
      projectConfigPath,
      JSON.stringify({ version: 1, extensions: { parallel: { enabled: true, skills: true, mcp: true } } }, null, 2),
    );

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean }>;
    expect(parsed.some((server) => server.name === "parallel-search" && server.active)).toBe(true);
  });

  test("write --dry-run reports changes without mutating target files", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    const before = await readFile(fixture.claudeSettings, "utf8");

    const result = await runAgentsCli(["mcp", "write", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Changes:");
    expect(await readFile(fixture.claudeSettings, "utf8")).toBe(before);
  });

  test("write --dry-run reports MCP changes without mutating target files", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);
    const before = await readFile(fixture.claudeSettings, "utf8");

    const result = await runAgentsCli(["mcp", "write", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Changes:");
    expect(await readFile(fixture.claudeSettings, "utf8")).toBe(before);
  });

  test("write supports --json output", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "write", "--dry-run", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  test("write uses project extension MCP state", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: false });
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(
      projectConfigPath,
      JSON.stringify({ version: 1, extensions: { parallel: { enabled: true, skills: true, mcp: true } } }, null, 2),
    );

    const result = await runAgentsCli(["mcp", "write"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const claudeSettings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(claudeSettings.mcpServers["parallel-search"]).toBeDefined();
  });

  test("write --target=claude limits output scope", async () => {
    const fixture = await scaffoldCliFixture({ parallelMcpEnabled: true });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "write", "--dry-run", "--target=claude"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("settings.json");
    expect(result.stdout).not.toContain("config.toml");
    expect(result.stdout).not.toContain("cursor");
  });

  test("inactive servers show empty targets", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean; targets: string }>;
    const inactive = parsed.find((server) => !server.active);
    expect(inactive).toBeDefined();
    expect(inactive!.targets).toBe("");
  });

  test("list uses user global defaults and MCP library entries", async () => {
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
    config.defaults = { mcpServers: ["github"] };
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(config, null, 2));

    const result = await runAgentsCli(["mcp", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ name: string; active: boolean }>;
    expect(parsed.some((item) => item.name === "github" && item.active)).toBe(true);
  });
});
