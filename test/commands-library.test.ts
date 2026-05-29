// ABOUTME: Verifies the user-facing `drwn library` command group.
// ABOUTME: Protects the local reusable inventory mental model over lower-level package commands.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  createInstalledSkillBundle,
  createSkillBundleFixture,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

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

describe("drwn library", () => {
  test("lists local skills and MCP servers", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["library", "list"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toContain("context7");
  });

  test("lists skills as json", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await createInstalledSkillBundle(fixture.agentsDir, { skillName: "hello-skill" });

    const result = await runAgentsCli(["library", "list", "skills", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ id: string; kind: string; source: string }>;
    expect(parsed.some((item) => item.id === "hello-skill" && item.kind === "skill" && item.source === "npm")).toBe(true);
  });

  test("lists MCP servers as json", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["library", "list", "mcp", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ id: string; kind: string }>;
    expect(parsed.some((item) => item.id === "context7" && item.kind === "mcp")).toBe(true);
  });

  test("shows a skill or MCP server by id", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const skill = await runAgentsCli(["library", "show", "alpha", "--json"], envFor(fixture));
    const mcp = await runAgentsCli(["library", "show", "context7", "--json"], envFor(fixture));

    expect(skill.exitCode).toBe(0);
    expect((JSON.parse(skill.stdout) as { kind: string; id: string }).kind).toBe("skill");
    expect(mcp.exitCode).toBe(0);
    expect((JSON.parse(mcp.stdout) as { kind: string; id: string }).kind).toBe("mcp");
  });

  test("adds a skill bundle to the local library without project activation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { bundleRoot } = await createSkillBundleFixture(fixture.root);

    const result = await runAgentsCli(["library", "add", "skill", bundleRoot], envFor(fixture), fixture.root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("@acme/skills-sample@1.0.0");
    expect(existsSync(join(fixture.agentsDir, "packages", "skills", "@acme", "skills-sample", "current"))).toBe(true);
    expect(existsSync(join(fixture.root, ".agents", "bgng", "config.json"))).toBe(false);
  });

  test("adds an MCP server file to the local library without activation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const serverFile = join(fixture.root, "github-mcp.json");
    await writeFile(
      serverFile,
      JSON.stringify({
        description: "GitHub",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
        optional: true,
      }),
    );

    const result = await runAgentsCli(["library", "add", "mcp", serverFile, "--as", "github"], envFor(fixture), fixture.root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added github");
    const library = JSON.parse(await readFile(join(fixture.agentsDir, "library", "mcp-servers.json"), "utf8")) as {
      servers?: Record<string, { command?: string }>;
    };
    expect(library.servers?.github?.command).toBe("npx");
    expect(existsSync(join(fixture.root, ".agents", "bgng", "config.json"))).toBe(false);
  });

  test("lists user MCP library entries", async () => {
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

    const result = await runAgentsCli(["library", "list", "mcp", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ id: string; source: string }>;
    expect(parsed.some((item) => item.id === "github" && item.source === "library")).toBe(true);
  });
});
