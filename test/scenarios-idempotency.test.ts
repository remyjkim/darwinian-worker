// ABOUTME: Verifies write materialization is idempotent across repeated invocations.
// ABOUTME: Protects the write-record contract that second writes do no work.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
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

test("write twice in machine scope produces zero changes on second write", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);

  const first = await runAgentsCli(["write", "--json"], envFor(fixture));
  expect(first.exitCode).toBe(0);
  expect(JSON.parse(first.stdout).changes.length).toBeGreaterThan(0);

  const second = await runAgentsCli(["write", "--json"], envFor(fixture));
  expect(second.exitCode).toBe(0);
  expect(JSON.parse(second.stdout).changes).toEqual([]);
});

test("write twice for overlay-only project produces zero changes on second write", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "bgng", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));

  const first = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);
  expect(first.exitCode).toBe(0);
  expect(JSON.parse(first.stdout).changes.length).toBeGreaterThan(0);

  const second = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);
  expect(second.exitCode).toBe(0);
  expect(JSON.parse(second.stdout).changes).toEqual([]);
});
