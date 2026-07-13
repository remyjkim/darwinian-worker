// ABOUTME: Verifies cards contribute effective skills and MCP servers during project writes.
// ABOUTME: Protects the end-to-end card consumption path beyond lockfile mutation.

import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, installProjectWorkers, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("project write materializes skills and servers introduced by cards", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const versionDir = await publishCardWithSkills(fixture, {
    name: "@me/backend",
    skills: ["alpha"],
    servers: {
      "card-server": {
        description: "From card",
        transport: "stdio",
        command: "card-run",
        optional: false,
      },
    },
  });

  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/backend@^1.0.0"], "@me/backend");

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
  expect(readFileSync(join(projectDir, ".claude", "skills", "alpha", "SKILL.md"), "utf8")).toBe(readFileSync(join(versionDir, "skills", "alpha", "SKILL.md"), "utf8"));
  const claudeMcp = JSON.parse(await readFile(join(projectDir, ".mcp.json"), "utf8"));
  expect(claudeMcp.mcpServers["card-server"].command).toBe("card-run");
});
