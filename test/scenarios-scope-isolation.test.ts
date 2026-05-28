// ABOUTME: Verifies project writes materialize into the project, not the user's home.
// ABOUTME: Protects Harness Card scope isolation for downstream agent tool files.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

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

test("project write targets project-local agent files and leaves home files unchanged", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "bgng", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));
  const beforeHomeClaude = await readFile(fixture.claudeSettings, "utf8");

  const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(await readFile(fixture.claudeSettings, "utf8")).toBe(beforeHomeClaude);
  expect(JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8")).mcpServers.context7).toBeDefined();
  expect(await readFile(join(projectDir, ".codex", "config.toml"), "utf8")).toContain("[mcp_servers.context7]");
  expect((await lstat(join(projectDir, ".cursor", "mcp.json"))).isSymbolicLink()).toBe(true);
  expect(existsSync(join(projectDir, ".agents", "bgng", "generated", "cursor-mcp.json"))).toBe(true);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
  expect(existsSync(join(fixture.homeDir, ".claude", "skills", "alpha"))).toBe(false);
  expect(existsSync(join(projectDir, ".agents", "bgng", "write-record.json"))).toBe(true);
});
