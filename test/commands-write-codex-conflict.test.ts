// ABOUTME: Characterizes Codex user/project MCP table merging and transport validation.
// ABOUTME: Pins Codex CLI 0.144.1 behavior with isolated project and user-home fixtures.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function setupProject(
  projectServer: Record<string, unknown>,
  userEntry: string[],
) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeFile(
    fixture.codexConfig,
    ['personality = "pragmatic"', "", "[mcp_servers.notion]", ...userEntry, ""].join("\n"),
  );
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, {
    mcpServers: { notion: projectServer as never },
  });
  return { fixture, projectDir, projectCodexPath: join(projectDir, ".codex", "config.toml") };
}

const projectStdio = {
  description: "Project Notion",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@notionhq/notion-mcp-server"],
  env: { NOTION_TOKEN: "${NOTION_TOKEN}" },
  optional: false,
};

const projectHttp = {
  description: "Project Notion",
  transport: "http",
  url: "https://project.example.test/mcp",
  headers: { Authorization: "Bearer ${NOTION_TOKEN}" },
  optional: false,
};

// Evidence: https://learn.chatgpt.com/docs/config-file/config-basic#configuration-precedence
test("Codex same-transport project fields augment the user table with a warning", async () => {
  const { fixture, projectDir, projectCodexPath } = await setupProject(
    projectStdio,
    ['command = "npx"', "tool_timeout_sec = 75"],
  );

  const result = await runAgentsCli(["write", "--target=codex", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);

  const output = JSON.parse(result.stdout) as {
    ambientCollisions: Array<{ disposition: string; reasonCode: string }>;
  };
  expect(output.ambientCollisions).toContainEqual(expect.objectContaining({
    disposition: "warning",
    reasonCode: "CODEX_PROJECT_AUGMENTS_USER",
  }));

  const projectConfig = parseToml(await readFile(projectCodexPath, "utf8")) as {
    mcp_servers: Record<string, Record<string, unknown>>;
  };
  expect(projectConfig.mcp_servers.notion?.command).toBe("npx");
  expect(projectConfig.mcp_servers.notion?.tool_timeout_sec).toBeUndefined();
});

test("Codex user HTTP plus project stdio is fatal before project output mutates", async () => {
  const { fixture, projectDir, projectCodexPath } = await setupProject(
    projectStdio,
    [
      'url = "https://mcp.notion.com/mcp"',
      'bearer_token_env_var = "USER_NOTION_TOKEN"',
      "enabled = true",
    ],
  );

  const result = await runAgentsCli(["write", "--target=codex", "--json"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("CODEX_INCOMPATIBLE_TRANSPORTS");
  expect(result.stderr).not.toContain("USER_NOTION_TOKEN");
  expect(result.stderr).not.toContain("NOTION_TOKEN");
  expect(existsSync(projectCodexPath)).toBe(false);
});

test("Codex user stdio plus project HTTP is fatal in the opposite merge direction", async () => {
  const { fixture, projectDir, projectCodexPath } = await setupProject(
    projectHttp,
    ['command = "user-notion"', 'env = { SECRET = "user-secret-sentinel" }'],
  );

  const result = await runAgentsCli(["write", "--target=codex", "--json"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("CODEX_INCOMPATIBLE_TRANSPORTS");
  expect(result.stderr).not.toContain("user-secret-sentinel");
  expect(existsSync(projectCodexPath)).toBe(false);
});

test("Codex fatal transport collisions cannot be bypassed with force", async () => {
  const { fixture, projectDir, projectCodexPath } = await setupProject(
    projectStdio,
    ['url = "https://mcp.notion.com/mcp"', "enabled = true"],
  );

  const result = await runAgentsCli(["write", "--target=codex", "--force", "--json"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("CODEX_INCOMPATIBLE_TRANSPORTS");
  expect(existsSync(projectCodexPath)).toBe(false);
});
