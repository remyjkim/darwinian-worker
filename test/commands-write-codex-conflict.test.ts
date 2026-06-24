// ABOUTME: Verifies drwn write avoids Codex global/project transport collisions.
// ABOUTME: A project stdio server is skipped (with a warning) when the global codex layer defines it as http.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

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
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        version: 1,
        servers: {
          notion: {
            description: "Notion via token",
            transport: "stdio",
            command: "npx",
            args: ["-y", "@notionhq/notion-mcp-server"],
            env: { NOTION_TOKEN: "${NOTION_TOKEN}" },
            optional: false,
          },
        },
      },
      null,
      2,
    ),
  );

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

test("write --force emits the project stdio server despite the global collision", async () => {
  const { fixture, projectDir } = await setupConflictFixture();

  const result = await runAgentsCli(["write", "--force", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);

  const projectCodex = await readFile(join(projectDir, ".codex", "config.toml"), "utf8");
  expect(projectCodex).toContain("[mcp_servers.notion]");
  expect(projectCodex).toContain('env_vars = [ "NOTION_TOKEN" ]');
});
