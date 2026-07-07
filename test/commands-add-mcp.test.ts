// ABOUTME: Verifies project-first MCP activation through `drwn add mcp`.
// ABOUTME: Protects project-local server toggles and dry-run safety.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

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
      servers?: Record<string, { enabled?: boolean }>;
    };
    expect(config.servers?.context7).toEqual({ enabled: true });
  });

  test("preserves existing project fields", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
    await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));

    await runAgentsCli(["add", "mcp", "context7"], envFor(fixture), projectDir);

    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      skills?: { include?: string[] };
      servers?: Record<string, { enabled?: boolean }>;
    };
    expect(config.skills?.include).toEqual(["alpha"]);
    expect(config.servers?.context7).toEqual({ enabled: true });
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
      servers?: Record<string, { command?: string; env?: Record<string, string> }>;
    };
    expect(projectConfig.servers?.github?.command).toBe("npx");
    expect(projectConfig.servers?.github?.env?.GITHUB_TOKEN).toBe("${GITHUB_TOKEN}");
  });

  test("does not write a project override for an already global default MCP", async () => {
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
    expect(parsed.action).toBe("already-active");
    expect(parsed.projectChanges).toEqual([]);
    expect(existsSync(join(projectDir, ".agents", "drwn", "config.json"))).toBe(false);
  });

  test("adds a user library MCP server toggle to project config", async () => {
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
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "mcp", "github"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as {
      servers?: Record<string, { enabled?: boolean }>;
    };
    expect(config.servers?.github).toEqual({ enabled: true });
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
    await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
    await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/base@1.0.0"], activeWorkers: ["@me/base"] }, null, 2));

    const result = await runAgentsCli(["add", "mcp", "card-local", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { id: string; action: string; requiredEnv: string[] };
    expect(parsed.id).toBe("card-local");
    expect(parsed.action).toBe("enabled");
    expect(parsed.requiredEnv).toEqual(["CARD_LOCAL_TOKEN"]);
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      servers?: Record<string, { enabled?: boolean; command?: string }>;
    };
    expect(config.servers?.["card-local"]).toEqual({ enabled: true });
  });
});
