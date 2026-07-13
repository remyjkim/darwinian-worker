// ABOUTME: Verifies project-first MCP activation through `drwn add mcp`.
// ABOUTME: Protects project-local server toggles and dry-run safety.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, installProjectWorkers, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

describe("drwn add mcp", () => {
  test("adds a harness MCP server toggle to project config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "mcp", "context7"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added context7");
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as {
      mcpServers?: Record<string, { enabled?: boolean }>;
    };
    expect(config.mcpServers?.context7).toEqual({ enabled: true });
  });

  test("preserves existing project fields", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir, { skills: { include: ["alpha"] } });

    await runAgentsCli(["add", "mcp", "context7"], envFor(fixture), projectDir);

    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      skills?: { include?: string[] };
      mcpServers?: Record<string, { enabled?: boolean }>;
    };
    expect(config.skills?.include).toEqual(["alpha"]);
    expect(config.mcpServers?.context7).toEqual({ enabled: true });
  });

  test("dry-run json does not write project config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "mcp", "context7", "--dry-run", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { kind: string; id: string };
    expect(parsed.kind).toBe("mcp");
    expect(parsed.id).toBe("context7");
    expect(existsSync(join(projectDir, ".agents", "drwn", "config.json"))).toBe(false);
  });

  test("library-only missing MCP server fails without writing config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "mcp", "missing", "--library"], envFor(fixture), projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("No local MCP server found");
    expect(existsSync(join(projectDir, ".agents", "drwn", "config.json"))).toBe(false);
  });

  test("argumentless add mcp fails clearly in non-TTY mode", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["add", "mcp"], envFor(fixture), fixture.root);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Guided add requires a TTY");
  });

  test("adds a trusted catalog MCP server as a project-local definition", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const catalogPath = join(fixture.root, "mcp-catalog.json");
    await writeFile(
      catalogPath,
      JSON.stringify({
        servers: {
          github: {
            description: "GitHub",
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
            optional: false,
          },
        },
      }),
    );
    const config = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    config.catalogs = { mcp: { enabled: true, sources: [{ type: "file", path: catalogPath }] } };
    await writeFile(join(fixture.repoRoot, "registry", "config.json"), JSON.stringify(config, null, 2));
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "mcp", "github", "--yes"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("GITHUB_TOKEN");
    const projectConfig = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as {
      mcpServers?: Record<string, { command?: string; env?: Record<string, string> }>;
    };
    expect(projectConfig.mcpServers?.github?.command).toBe("npx");
    expect(projectConfig.mcpServers?.github?.env?.GITHUB_TOKEN).toBe("${GITHUB_TOKEN}");
  });

  test("writes explicit project intent even when the MCP is a machine default", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    repoConfig.defaults = { mcpServers: ["context7"] };
    await writeFile(join(fixture.agentsDir, "drwn", "config.json"), JSON.stringify(repoConfig, null, 2));
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "mcp", "context7", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { action: string; projectChanges: unknown[] };
    expect(parsed.action).toBe("enabled");
    expect(parsed.projectChanges).toHaveLength(1);
    const project = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8"));
    expect(project.mcpServers.context7).toEqual({ enabled: true });
  });

  test("adds a user library MCP server as an explicit project definition", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { seedMcpInventory } = await import("./mcp-inventory-fixture");
    await seedMcpInventory(fixture.agentsDir, {
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
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "mcp", "github"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as {
      mcpServers?: Record<string, { enabled?: boolean; command?: string; optional?: boolean }>;
    };
    expect(config.mcpServers?.github).toEqual(expect.objectContaining({ command: "npx", optional: false }));
  });

  test("adds a card-local optional MCP server toggle to project config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, {
      name: "@me/base",
      skills: [],
      servers: {
        "card-local": {
          description: "Card-local optional server",
          transport: "stdio",
          command: "card-local-server",
          env: { CARD_LOCAL_TOKEN: "${CARD_LOCAL_TOKEN}" },
          optional: true,
        },
      },
    });
    const projectDir = join(fixture.root, "project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base");

    const result = await runAgentsCli(["add", "mcp", "card-local", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { id: string; action: string; requiredEnv: string[] };
    expect(parsed.id).toBe("card-local");
    expect(parsed.action).toBe("enabled");
    expect(parsed.requiredEnv).toEqual(["CARD_LOCAL_TOKEN"]);
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      mcpServers?: Record<string, { enabled?: boolean; command?: string }>;
    };
    expect(config.mcpServers?.["card-local"]).toEqual({ enabled: true });
  });

  test("refuses an MCP definition that exists only on an inactive Worker root", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/active", skills: [] });
    await publishCardWithSkills(fixture, {
      name: "@me/inactive",
      skills: [],
      servers: {
        "inactive-mcp": {
          description: "Inactive MCP",
          transport: "stdio",
          command: "inactive-mcp",
          optional: true,
        },
      },
    });
    const projectDir = join(fixture.root, "inactive-root-project");
    await installProjectWorkers(
      projectDir,
      fixture.agentsDir,
      ["@me/active@1.0.0", "@me/inactive@1.0.0"],
      "@me/active",
    );
    const configBefore = await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8");

    const result = await runAgentsCli(["add", "mcp", "inactive-mcp"], envFor(fixture), projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("MCP_DEFINITION_NOT_EFFECTIVE");
    expect(`${result.stdout}\n${result.stderr}`).toContain("@me/inactive");
    expect(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")).toBe(configBefore);
  });
});
