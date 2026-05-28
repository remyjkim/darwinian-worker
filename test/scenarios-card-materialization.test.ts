// ABOUTME: Verifies cards contribute effective skills and MCP servers during project writes.
// ABOUTME: Protects the end-to-end card consumption path beyond lockfile mutation.

import { afterEach, expect, test } from "bun:test";
import { existsSync, readlinkSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

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
  const configPath = join(projectDir, ".agents", "bgng", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2));

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
  expect(readlinkSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(join(versionDir, "skills", "alpha"));
  const settings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));
  expect(settings.mcpServers["card-server"].command).toBe("card-run");
});
