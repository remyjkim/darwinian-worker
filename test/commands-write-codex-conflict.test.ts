// ABOUTME: Verifies drwn write avoids Codex global/project transport collisions.
// ABOUTME: A project stdio server is skipped (with a warning) when the global codex layer defines it as http.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function setupConflictFixture() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  // Global codex layer defines notion as a hosted HTTP server.
  await writeFile(
    fixture.codexConfig,
    ['personality = "pragmatic"', "", "[mcp_servers.notion]", 'url = "https://mcp.notion.com/mcp"', "enabled = true", ""].join("\n"),
  );

  // Project overlay defines notion as a token-authenticated stdio server.
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, {
    mcpServers: {
      context7: { enabled: true },
      notion: {
        description: "Notion via token",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@notionhq/notion-mcp-server"],
        env: { NOTION_TOKEN: "${NOTION_TOKEN}" },
        optional: false,
      },
    },
  });

  return { fixture, projectDir };
}

test("write skips a project stdio server that collides with a global http codex entry", async () => {
  const { fixture, projectDir } = await setupConflictFixture();

  const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);

  const projectCodex = await readFile(join(projectDir, ".codex", "config.toml"), "utf8");
  expect(projectCodex).toContain("[mcp_servers.context7]");
  expect(projectCodex).not.toContain("[mcp_servers.notion]");

  const warnings = (JSON.parse(result.stdout) as { warnings: string[] }).warnings;
  expect(warnings.some((w) => w.includes("notion") && w.toLowerCase().includes("transport"))).toBe(true);

  // Global codex config is untouched by a project-scope write.
  expect(await readFile(fixture.codexConfig, "utf8")).toContain('url = "https://mcp.notion.com/mcp"');
});

test("write heals a stale project notion block left by a pre-guard write", async () => {
  const { fixture, projectDir } = await setupConflictFixture();

  // Simulate a project codex config written before the collision guard existed:
  // the colliding stdio notion block is already on disk, untracked by any write-record.
  const projectCodexPath = join(projectDir, ".codex", "config.toml");
  await mkdir(dirname(projectCodexPath), { recursive: true });
  await writeFile(
    projectCodexPath,
    [
      "[mcp_servers.notion]",
      'command = "npx"',
      'args = [ "-y", "@notionhq/notion-mcp-server" ]',
      "startup_timeout_sec = 30",
      "",
      "[mcp_servers.context7]",
      'command = "npx"',
      'args = [ "-y", "@upstash/context7-mcp" ]',
      "",
    ].join("\n"),
  );

  const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);

  const projectCodex = await readFile(projectCodexPath, "utf8");
  expect(projectCodex).toContain("[mcp_servers.context7]");
  expect(projectCodex).not.toContain("[mcp_servers.notion]");

  const warnings = (JSON.parse(result.stdout) as { warnings: string[] }).warnings;
  expect(warnings.some((w) => w.includes("notion") && w.toLowerCase().includes("transport"))).toBe(true);
});

test("write --force emits the project stdio server despite the global collision", async () => {
  const { fixture, projectDir } = await setupConflictFixture();

  const result = await runAgentsCli(["write", "--force", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);

  const projectCodex = await readFile(join(projectDir, ".codex", "config.toml"), "utf8");
  expect(projectCodex).toContain("[mcp_servers.notion]");
  expect(projectCodex).toContain('env_vars = [ "NOTION_TOKEN" ]');
});
