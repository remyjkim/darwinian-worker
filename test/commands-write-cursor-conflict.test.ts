// ABOUTME: Characterizes Cursor Agent user/project MCP field inheritance and transport selection.
// ABOUTME: Pins Cursor Agent 2026.07.09-a3815c0 behavior as warning-only with redacted output.

import { afterEach, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function setupCursor(user: Record<string, unknown>, project: Record<string, unknown>) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeFile(fixture.cursorConfig, `${JSON.stringify({ mcpServers: { notion: user } }, null, 2)}\n`);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, { mcpServers: { notion: project as never } });
  return { fixture, projectDir, projectMcpPath: join(projectDir, ".cursor", "mcp.json") };
}

const projectStdio = {
  description: "Project Notion",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@notionhq/notion-mcp-server"],
  optional: false,
};

// Cursor documents the two surfaces but not duplicate-ID semantics:
// https://docs.cursor.com/context/model-context-protocol#configuration-locations
test("Cursor project fields inherit omitted user fields with a warning", async () => {
  const { fixture, projectDir, projectMcpPath } = await setupCursor(
    { command: "user-notion", env: { CURSOR_SECRET: "user-secret-sentinel" }, timeout: 90 },
    projectStdio,
  );

  const result = await runAgentsCli(["write", "--target=cursor", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);
  const output = JSON.parse(result.stdout) as {
    ambientCollisions: Array<{ disposition: string; reasonCode: string }>;
  };
  expect(output.ambientCollisions).toContainEqual(expect.objectContaining({
    disposition: "warning",
    reasonCode: "CURSOR_PROJECT_MERGES_USER",
  }));
  expect(result.stdout).not.toContain("user-secret-sentinel");
  expect((await readFile(projectMcpPath, "utf8"))).toContain('"command": "npx"');
});

test("Cursor project transport selection over user HTTP is warning-only", async () => {
  const { fixture, projectDir, projectMcpPath } = await setupCursor(
    { type: "http", url: "https://mcp.notion.com/mcp", headers: { Authorization: "Bearer user-secret" } },
    projectStdio,
  );

  const result = await runAgentsCli(["write", "--target=cursor", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("CURSOR_PROJECT_TRANSPORT_OVERRIDE");
  expect(result.stdout).not.toContain("Bearer user-secret");
  expect((await readFile(projectMcpPath, "utf8"))).toContain('"command": "npx"');
});

test("Cursor identical entries are informational", async () => {
  const rendered = { command: "npx", args: ["-y", "@notionhq/notion-mcp-server"] };
  const { fixture, projectDir } = await setupCursor(rendered, projectStdio);

  const result = await runAgentsCli(["write", "--target=cursor", "--json"], envFor(fixture), projectDir);
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
});
