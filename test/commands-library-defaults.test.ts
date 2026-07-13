// ABOUTME: Verifies `drwn library defaults` commands for machine-wide activation.
// ABOUTME: Protects the distinction between reusable inventory, global defaults, and project adds.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createInstalledSkillBundle, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createEmptyMachineConfig } from "../cli/core/machine-config";

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

async function readUserConfig(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return JSON.parse(await readFile(join(fixture.agentsDir, "drwn", "machine.json"), "utf8")) as {
    capabilities: { skills: string[]; mcpServers: string[] };
  };
}

async function writeMachineConfig(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  config: ReturnType<typeof createEmptyMachineConfig>,
) {
  const storeDir = join(fixture.agentsDir, "drwn");
  await mkdir(storeDir, { recursive: true });
  await writeFile(join(storeDir, "store.json"), JSON.stringify({ schemaVersion: 1, initAt: "2026-06-11T00:00:00.000Z" }, null, 2));
  await writeFile(join(storeDir, "machine.json"), `${JSON.stringify(config, null, 2)}\n`);
}

async function readMachineConfig(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return JSON.parse(await readFile(join(fixture.agentsDir, "drwn", "machine.json"), "utf8")) as {
    capabilities: { skills: string[]; mcpServers: string[] };
  };
}

describe("drwn library defaults", () => {
  test("lists default skills and MCP servers as json", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["library", "defaults", "list", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { skills: unknown[]; mcpServers: Array<{ id: string }> };
    expect(parsed.skills).toBeArray();
    expect(parsed.skills).toEqual([]);
    expect(parsed.mcpServers).toEqual([]);
    expect(existsSync(join(fixture.agentsDir, "drwn", "machine.json"))).toBe(false);
  });

  test("adds a repo-native skill as an explicit machine selection without curation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["library", "defaults", "add", "skill", "alpha"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("global default");
    expect((await readUserConfig(fixture)).capabilities.skills).toEqual(["alpha"]);
    expect(existsSync(join(fixture.agentsDir, "skills", "alpha"))).toBe(false);
  });

  test("adds a package-backed skill as a global default", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await createInstalledSkillBundle(fixture.agentsDir, { skillName: "hello-skill" });

    const result = await runAgentsCli(["library", "defaults", "add", "skill", "hello-skill", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { action: string; id: string };
    expect(parsed.action).toBe("added");
    expect(parsed.id).toBe("hello-skill");
    expect((await readUserConfig(fixture)).capabilities.skills).toContain("hello-skill");
  });

  test("removes a skill global default without deleting source", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await runAgentsCli(["library", "defaults", "add", "skill", "alpha"], envFor(fixture));

    const result = await runAgentsCli(["library", "defaults", "remove", "skill", "alpha", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.stdout) as { action: string }).action).toBe("removed");
    expect((await readUserConfig(fixture)).capabilities.skills).not.toContain("alpha");
    expect(existsSync(join(fixture.repoRoot, "skills", "shared", "alpha"))).toBe(true);
  });

  test("adds and removes a built-in MCP global default", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const add = await runAgentsCli(["library", "defaults", "add", "mcp", "context7", "--json"], envFor(fixture));
    expect(add.exitCode).toBe(0);
    expect((JSON.parse(add.stdout) as { action: string }).action).toBe("added");
    expect((await readUserConfig(fixture)).capabilities.mcpServers).toContain("context7");

    const remove = await runAgentsCli(["library", "defaults", "remove", "mcp", "context7", "--json"], envFor(fixture));
    expect(remove.exitCode).toBe(0);
    expect((JSON.parse(remove.stdout) as { action: string }).action).toBe("removed");
    expect((await readUserConfig(fixture)).capabilities.mcpServers).not.toContain("context7");
  });

  test("adds a user library MCP as a global default", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { ensureStoreInitialized } = await import("../cli/core/card-store");
    const { saveMcpLibrary } = await import("../cli/core/mcp-library");
    await ensureStoreInitialized(fixture.agentsDir);
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

    const result = await runAgentsCli(["library", "defaults", "add", "mcp", "github", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.stdout) as { action: string }).action).toBe("added");
    expect((await readUserConfig(fixture)).capabilities.mcpServers).toContain("github");

    const list = await runAgentsCli(["library", "defaults", "list", "--json"], envFor(fixture));
    const parsed = JSON.parse(list.stdout) as { mcpServers: Array<{ id: string; source: string; status: string }> };
    expect(parsed.mcpServers).toContainEqual({ id: "github", status: "resolved", source: "library" });
  });

  test("adds an MCP to explicit empty machine intent without seeding packaged defaults", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await writeMachineConfig(fixture, createEmptyMachineConfig());

    const result = await runAgentsCli(["library", "defaults", "add", "mcp", "parallel-search", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.stdout) as { action: string }).action).toBe("added");
    expect((await readMachineConfig(fixture)).capabilities.mcpServers).toEqual(["parallel-search"]);
  });

  test("does not seed explicit skill selections from curated ambient directories", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    await writeMachineConfig(fixture, createEmptyMachineConfig());

    const result = await runAgentsCli(["library", "defaults", "add", "skill", "beta", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.stdout) as { action: string }).action).toBe("added");
    expect((await readMachineConfig(fixture)).capabilities.skills).toEqual(["beta"]);
    expect(existsSync(join(fixture.agentsDir, "skills", "beta"))).toBe(false);
  });

  test("dry-run does not initialize machine state or curate a skill", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["library", "defaults", "add", "skill", "beta", "--dry-run", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(fixture.agentsDir, "drwn", "machine.json"))).toBe(false);
    expect(existsSync(join(fixture.agentsDir, "skills", "beta"))).toBe(false);
  });
});
