// ABOUTME: Characterizes Claude user, project, and local MCP scope precedence for project writes.
// ABOUTME: Verifies whole-entry shadowing remains non-fatal and reports redacted provenance.

import { afterEach, expect, test } from "bun:test";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

const projectStdio = {
  description: "Project Notion",
  transport: "stdio" as const,
  command: "npx",
  args: ["-y", "@notionhq/notion-mcp-server"],
  env: { NOTION_TOKEN: "${NOTION_TOKEN}" },
  optional: false,
};

async function setupClaude(options: {
  user?: Record<string, unknown>;
  local?: Record<string, unknown>;
  project?: Record<string, unknown>;
}) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, {
    mcpServers: { notion: (options.project ?? projectStdio) as never },
  });
  await writeFile(
    fixture.claudeUserMcp,
    `${JSON.stringify({
      mcpServers: options.user ? { notion: options.user } : {},
      projects: options.local ? { [projectDir]: { mcpServers: { notion: options.local } } } : {},
    }, null, 2)}\n`,
  );
  return { fixture, projectDir, projectMcpPath: join(projectDir, ".mcp.json") };
}

// Evidence: https://code.claude.com/docs/en/mcp#scope-hierarchy-and-precedence
test("Claude reports identical user and project entries without a warning", async () => {
  const rendered = {
    command: projectStdio.command,
    args: projectStdio.args,
    env: projectStdio.env,
  };
  const { fixture, projectDir, projectMcpPath } = await setupClaude({ user: rendered });

  const result = await runAgentsCli(["write", "--target=claude", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);
  const output = JSON.parse(result.stdout) as {
    warnings: string[];
    ambientCollisions: Array<{ disposition: string; reasonCode: string }>;
  };
  expect(output.ambientCollisions).toContainEqual(expect.objectContaining({
    disposition: "identical",
    reasonCode: "AMBIENT_IDENTICAL",
  }));
  expect(output.warnings.some((warning) => warning.includes("AMBIENT_IDENTICAL"))).toBe(false);
  expect(JSON.parse(await readFile(projectMcpPath, "utf8")).mcpServers.notion).toEqual(rendered);
});

test("Claude same-transport differences shadow the user entry without blocking", async () => {
  const { fixture, projectDir, projectMcpPath } = await setupClaude({
    user: { command: "user-notion", env: { SECRET: "user-secret-sentinel" } },
  });

  const result = await runAgentsCli(["write", "--target=claude", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);
  const output = JSON.parse(result.stdout) as {
    ambientCollisions: Array<{ disposition: string; reasonCode: string }>;
  };
  expect(output.ambientCollisions).toContainEqual(expect.objectContaining({
    disposition: "warning",
    reasonCode: "CLAUDE_SCOPE_SHADOW",
  }));
  expect(result.stdout).not.toContain("user-secret-sentinel");
  expect((await readFile(projectMcpPath, "utf8"))).toContain('"command": "npx"');
});

test("Claude cross-transport replacement is warning-only", async () => {
  const { fixture, projectDir, projectMcpPath } = await setupClaude({
    user: { type: "http", url: "https://mcp.notion.com/mcp", headers: { Authorization: "Bearer user-secret" } },
  });

  const result = await runAgentsCli(["write", "--target=claude", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("CLAUDE_SCOPE_SHADOW");
  expect(result.stdout).not.toContain("Bearer user-secret");
  expect((await readFile(projectMcpPath, "utf8"))).toContain('"command": "npx"');
});

test("Claude local scope precedence reports local and user provenance", async () => {
  const { fixture, projectDir } = await setupClaude({
    user: { command: "user-notion" },
    local: { type: "http", url: "https://local.example.test/mcp" },
  });

  const result = await runAgentsCli(["write", "--target=claude", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);
  const output = JSON.parse(result.stdout) as {
    ambientCollisions: Array<{
      reasonCode: string;
      ambient: { source: string; path: string };
      declared: { source: string; path: string };
    }>;
  };
  const collisions = output.ambientCollisions.filter((entry) => entry.reasonCode === "CLAUDE_SCOPE_SHADOW");
  const canonicalProjectMcp = join(await realpath(projectDir), ".mcp.json");
  expect(collisions.map((entry) => entry.ambient.source)).toEqual(["local", "user"]);
  expect(collisions.every((entry) => entry.ambient.path === fixture.claudeUserMcp)).toBe(true);
  expect(collisions.every((entry) => entry.declared.path === canonicalProjectMcp)).toBe(true);
});
