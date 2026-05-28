// ABOUTME: Verifies bgng write refuses managed-region drift unless forced.
// ABOUTME: Protects user hand-edits and the explicit recovery path.

import { afterEach, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
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

test("write refuses when Claude mcpServers has been hand-edited", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["write"], envFor(fixture))).exitCode).toBe(0);
  const settings = JSON.parse(await readFile(fixture.claudeSettings, "utf8"));
  settings.mcpServers.rogue = { url: "https://example.invalid" };
  await writeFile(fixture.claudeSettings, `${JSON.stringify(settings, null, 2)}\n`);

  const result = await runAgentsCli(["write"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("Drift detected");
});

test("write --force overwrites Claude drift", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["write"], envFor(fixture))).exitCode).toBe(0);
  const settings = JSON.parse(await readFile(fixture.claudeSettings, "utf8"));
  settings.mcpServers.rogue = { url: "https://example.invalid" };
  await writeFile(fixture.claudeSettings, `${JSON.stringify(settings, null, 2)}\n`);

  const result = await runAgentsCli(["write", "--force"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(await readFile(fixture.claudeSettings, "utf8")).not.toContain("rogue");
});
