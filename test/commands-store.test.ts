// ABOUTME: Verifies bgng store commands for migration and store inspection.
// ABOUTME: Protects JSON cleanliness and legacy warning behavior during the layout transition.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldPreCardsCliFixture() {
  const fixture = await scaffoldCliFixture();
  await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
  await mkdir(join(fixture.agentsDir, "library"), { recursive: true });
  await mkdir(join(fixture.agentsDir, "packages", "skills"), { recursive: true });
  await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify({ version: 1, optional: {}, targets: {}, catalogs: {} }, null, 2));
  await writeFile(join(fixture.agentsDir, "library", "mcp-servers.json"), JSON.stringify({ version: 1, servers: {} }, null, 2));
  return fixture;
}

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

test("store status reports initialized store metadata as json", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
  await writeFile(join(fixture.agentsDir, "bgng", "store.json"), JSON.stringify({ schemaVersion: 1, initAt: "2026-05-20T00:00:00.000Z" }, null, 2));

  const result = await runAgentsCli(["store", "status", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { initialized: boolean; schemaVersion: number };
  expect(parsed.initialized).toBe(true);
  expect(parsed.schemaVersion).toBe(1);
});

test("store migrate upgrades legacy layout and keeps warning on stderr", async () => {
  const fixture = await scaffoldPreCardsCliFixture();
  tempRoots.push(fixture.root);

  const before = await runAgentsCli(["status", "--json"], envFor(fixture));
  expect(before.stderr).toContain("pre-cards layout detected");
  expect(() => JSON.parse(before.stdout)).not.toThrow();

  const result = await runAgentsCli(["store", "migrate", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { archivedTo: string };
  expect(existsSync(parsed.archivedTo)).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "store.json"))).toBe(true);

  const after = await runAgentsCli(["store", "status", "--json"], envFor(fixture));
  expect(after.stderr).not.toContain("pre-cards layout detected");
  expect(JSON.parse(after.stdout).initialized).toBe(true);
});

test("store migrate reports no-op when no legacy layout exists", async () => {
  const root = await createTempRoot("store-noop-");
  tempRoots.push(root);
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["store", "migrate"], envFor(fixture), root);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("No legacy layout detected");
});

test("store migrate cleanup removes only bgng-owned legacy symlinks", async () => {
  const fixture = await scaffoldPreCardsCliFixture();
  tempRoots.push(fixture.root);
  const legacySkill = join(fixture.agentsDir, "packages", "skills", "sample", "1.0.0", "skills", "shared", "legacy");
  await mkdir(legacySkill, { recursive: true });
  const skillsDir = join(fixture.homeDir, ".claude", "skills");
  await mkdir(skillsDir, { recursive: true });
  await symlink(legacySkill, join(skillsDir, "legacy"), "dir");
  await writeFile(join(skillsDir, "regular"), "keep\n");
  const unrelatedTarget = join(fixture.root, "unrelated");
  await mkdir(unrelatedTarget, { recursive: true });
  await symlink(unrelatedTarget, join(skillsDir, "unrelated"), "dir");

  const result = await runAgentsCli(["store", "migrate", "--cleanup-legacy-orphans", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { steps: string[] };
  expect(parsed.steps.some((step) => step.includes("removed"))).toBe(true);
  await expect(lstat(join(skillsDir, "legacy"))).rejects.toThrow();
  expect((await lstat(join(skillsDir, "regular"))).isFile()).toBe(true);
  expect((await lstat(join(skillsDir, "unrelated"))).isSymbolicLink()).toBe(true);
});
