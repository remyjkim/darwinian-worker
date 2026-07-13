// ABOUTME: Verifies project writes materialize into the project, not the user's home.
// ABOUTME: Protects Card scope isolation for downstream agent tool files.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

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
  await writeSupportedProjectConfig(projectDir, {
    skills: { include: ["alpha"] },
    mcpServers: { context7: { enabled: true } },
  });
  const beforeHomeClaude = await readFile(fixture.claudeSettings, "utf8");
  const beforeHomeUserMcp = await readFile(fixture.claudeUserMcp, "utf8");

  const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(await readFile(fixture.claudeSettings, "utf8")).toBe(beforeHomeClaude);
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeHomeUserMcp);
  expect(JSON.parse(await readFile(join(projectDir, ".mcp.json"), "utf8")).mcpServers.context7).toBeDefined();
  expect(await readFile(join(projectDir, ".codex", "config.toml"), "utf8")).toContain("[mcp_servers.context7]");
  expect((await lstat(join(projectDir, ".cursor", "mcp.json"))).isFile()).toBe(true);
  expect(JSON.parse(await readFile(join(projectDir, ".cursor", "mcp.json"), "utf8")).mcpServers.context7).toBeDefined();
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
  expect(existsSync(join(fixture.homeDir, ".claude", "skills", "alpha"))).toBe(false);
  expect(existsSync(join(projectDir, ".agents", "drwn", "write-record.json"))).toBe(true);
});
