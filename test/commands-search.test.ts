// ABOUTME: Verifies user-facing search commands for local library and configured catalogs.
// ABOUTME: Protects source labeling and JSON contracts for discovery workflows.

import { afterEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createExecutable, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, extra?: Record<string, string>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
    ...extra,
  };
}

describe("bgng search", () => {
  test("search skill returns local and catalog results as json", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const binDir = join(fixture.root, "bin");
    await createExecutable(binDir, "npm", 'printf "%s" \'[{"name":"@acme/alpha-skills","version":"1.0.0"}]\'');

    const result = await runAgentsCli(["search", "skill", "alpha", "--json"], envFor(fixture, { PATH: binDir }));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { results: Array<{ id: string; sourceGroup: string }> };
    expect(parsed.results.some((item) => item.id === "alpha" && item.sourceGroup === "library")).toBe(true);
    expect(parsed.results.some((item) => item.id === "@acme/alpha-skills" && item.sourceGroup === "catalog")).toBe(true);
  });

  test("search skill --library suppresses npm catalog", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const binDir = join(fixture.root, "bin");
    const logPath = join(fixture.root, "npm.log");
    await createExecutable(binDir, "npm", `echo called > "${logPath}"\nprintf "%s" '[]'`);

    const result = await runAgentsCli(["search", "skill", "alpha", "--library", "--json"], envFor(fixture, { PATH: binDir }));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { results: Array<{ sourceGroup: string }> };
    expect(parsed.results.every((item) => item.sourceGroup === "library")).toBe(true);
    await expect(readFile(logPath, "utf8")).rejects.toThrow();
  });

  test("human skill search labels local library and online catalogs", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const binDir = join(fixture.root, "bin");
    await createExecutable(binDir, "npm", 'printf "%s" \'[{"name":"@acme/alpha-skills","version":"1.0.0"}]\'');

    const result = await runAgentsCli(["search", "skill", "alpha"], envFor(fixture, { PATH: binDir }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Local library");
    expect(result.stdout).toContain("Online catalogs");
  });

  test("search mcp returns local MCP and trusted catalog results", async () => {
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
            optional: false,
          },
        },
      }),
    );
    const config = JSON.parse(await readFile(join(fixture.repoRoot, "registry", "config.json"), "utf8"));
    config.catalogs = { mcp: { enabled: true, sources: [{ type: "file", path: catalogPath }] } };
    await writeFile(join(fixture.repoRoot, "registry", "config.json"), JSON.stringify(config, null, 2));

    const result = await runAgentsCli(["search", "mcp", "git", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { results: Array<{ id: string; sourceGroup: string }> };
    expect(parsed.results.some((item) => item.id === "github" && item.sourceGroup === "catalog")).toBe(true);
  });

  test("search mcp --library includes user MCP library entries", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { saveMcpLibrary } = await import("../cli/core/mcp-library");
    await saveMcpLibrary(fixture.agentsDir, {
      version: 1,
      servers: {
        github: {
          description: "GitHub repository access",
          transport: "stdio",
          command: "npx",
          optional: true,
        },
      },
    });

    const result = await runAgentsCli(["search", "mcp", "github", "--library", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { results: Array<{ id: string; sourceGroup: string }> };
    expect(parsed.results.some((item) => item.id === "github" && item.sourceGroup === "library")).toBe(true);
  });

  test("search mcp rejects the removed --project flag", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["search", "mcp", "alpha", "--project", "--json"], envFor(fixture));

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/unsupported|unknown|not allowed/i);
  });

  test("search skill rejects the removed --project flag", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["search", "skill", "alpha", "--project", "--json"], envFor(fixture));

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/unsupported|unknown|not allowed/i);
  });
});
