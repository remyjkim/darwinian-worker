// ABOUTME: Verifies the target `bgng write` command surface over the materialization engine.
// ABOUTME: Protects the supported one-way write vocabulary for downstream tool updates.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("bgng write", () => {
  test("dry-run reports planned materialization changes", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    const write = await runAgentsCli(["write", "--dry-run"], env);

    expect(write.exitCode).toBe(0);
    expect(write.stdout).toContain("Changes:");
  });

  test("supports json, target, and mode flags", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    const json = await runAgentsCli(["write", "--dry-run", "--json"], env);
    expect(json.exitCode).toBe(0);
    expect(() => JSON.parse(json.stdout)).not.toThrow();

    const target = await runAgentsCli(["write", "--dry-run", "--target=claude"], env);
    expect(target.exitCode).toBe(0);
    expect(target.stdout).toContain("settings.json");
    expect(target.stdout).not.toContain("config.toml");

    const mcpOnly = await runAgentsCli(["write", "--dry-run", "--mcp-only"], env);
    expect(mcpOnly.exitCode).toBe(0);
    expect(mcpOnly.stdout).not.toContain(".claude/skills");
  });

  test("rejects mutually exclusive mode flags", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["write", "--mcp-only", "--skills-only"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Use either --mcp-only or --skills-only");
  });

  test("global default skills write without curated symlinks", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    repoConfig.defaults = { skills: ["alpha"], mcpServers: ["context7"] };
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(repoConfig, null, 2));

    const result = await runAgentsCli(["write", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".claude/skills/alpha");
    expect(result.stdout).toContain(".codex/skills/alpha");
    expect(existsSync(join(fixture.agentsDir, "skills", "alpha"))).toBe(false);
  });

  test("project excludes remove global default skills", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    repoConfig.defaults = { skills: ["alpha"], mcpServers: ["context7"] };
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(repoConfig, null, 2));
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
    await writeFile(
      join(projectDir, ".agents", "bgng", "config.json"),
      JSON.stringify({ version: 1, skills: { exclude: ["alpha"] } }, null, 2),
    );

    const result = await runAgentsCli(["write", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(".claude/skills/alpha");
    expect(result.stdout).not.toContain(".codex/skills/alpha");
  });

  test("project server disable overrides explicit global MCP defaults", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    repoConfig.defaults = { mcpServers: ["context7"] };
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(repoConfig, null, 2));
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
    await writeFile(
      join(projectDir, ".agents", "bgng", "config.json"),
      JSON.stringify({ version: 1, servers: { context7: { enabled: false } } }, null, 2),
    );

    const result = await runAgentsCli(["write", "--dry-run", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("@upstash/context7-mcp");
  });

  test("global default user library MCP servers render during write", async () => {
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
          args: ["-y", "@modelcontextprotocol/server-github"],
          optional: true,
        },
      },
    });
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    const repoConfig = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    repoConfig.defaults = { mcpServers: ["github"] };
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(repoConfig, null, 2));

    const result = await runAgentsCli(["write", "--dry-run"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("settings.json");
  });

  test("project-enabled user library MCP servers render during write", async () => {
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
          args: ["-y", "@modelcontextprotocol/server-github"],
          optional: true,
        },
      },
    });
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
    await writeFile(
      join(projectDir, ".agents", "bgng", "config.json"),
      JSON.stringify({ version: 1, servers: { github: { enabled: true } } }, null, 2),
    );

    const result = await runAgentsCli(["write"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const settings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8")) as { mcpServers?: Record<string, { command?: string }> };
    expect(settings.mcpServers?.github?.command).toBe("npx");
  });

  test("write --dry-run annotates symlink intents with their winning layer", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
    await writeFile(
      join(projectDir, ".agents", "bgng", "config.json"),
      JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2),
    );

    const dryRun = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture), projectDir);

    expect(dryRun.exitCode).toBe(0);
    const parsed = JSON.parse(dryRun.stdout) as { changes: string[] };
    const symlinkLines = parsed.changes.filter((change) => change.startsWith("symlink ") && change.includes("alpha"));
    expect(symlinkLines).toHaveLength(2);
    for (const line of symlinkLines) {
      expect(line).toContain("← card @me/backend@1.0.0");
    }
  });

  test("write --dry-run dedupes when both user-default and card supply the same name", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
    await writeFile(
      join(projectDir, ".agents", "bgng", "config.json"),
      JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2),
    );

    const dryRun = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture), projectDir);

    expect(dryRun.exitCode).toBe(0);
    const parsed = JSON.parse(dryRun.stdout) as { changes: string[] };
    const lines = parsed.changes.filter((change) => change.includes(".claude/skills/alpha"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("← card @me/backend@1.0.0");
    expect(lines[0]).toContain("(also available: user-default)");
  });
});
