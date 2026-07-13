// ABOUTME: Verifies write-record-backed cleanup removes only drwn-owned paths.
// ABOUTME: Protects user content from accidental deletion during materialization changes.

import { afterEach, expect, test } from "bun:test";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

test("removing an explicit skill removes its previously materialized downstream copy on next write", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  expect((await runAgentsCli(["library", "defaults", "add", "skill", "alpha"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["write", "--skills-only"], envFor(fixture))).exitCode).toBe(0);
  const linkPath = join(fixture.homeDir, ".claude", "skills", "alpha");
  expect(lstatSync(linkPath).isDirectory()).toBe(true);

  expect((await runAgentsCli(["library", "defaults", "remove", "skill", "alpha"], envFor(fixture))).exitCode).toBe(0);
  const result = await runAgentsCli(["write", "--skills-only", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).changes).toContain(`remove ${linkPath}`);
  expect(existsSync(linkPath)).toBe(false);
});

test("cleanup refuses to overwrite, then preserves, user content that replaced a managed copy", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["library", "defaults", "add", "skill", "alpha"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["write", "--skills-only"], envFor(fixture))).exitCode).toBe(0);
  const linkPath = join(fixture.homeDir, ".claude", "skills", "alpha");
  await rm(linkPath, { recursive: true, force: true });
  await mkdir(linkPath, { recursive: true });
  await writeFile(join(linkPath, "SKILL.md"), "user content\n");

  expect((await runAgentsCli(["library", "defaults", "remove", "skill", "alpha"], envFor(fixture))).exitCode).toBe(0);

  // Without --force, drift protection refuses and leaves the user content untouched.
  const refused = await runAgentsCli(["write", "--skills-only"], envFor(fixture));
  expect(refused.exitCode).not.toBe(0);
  expect(`${refused.stdout}${refused.stderr}`).toContain("drift");
  expect(existsSync(join(linkPath, "SKILL.md"))).toBe(true);

  // With --force, the write proceeds but cleanup still preserves the differing user content.
  const result = await runAgentsCli(["write", "--skills-only", "--force", "--json"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(existsSync(join(linkPath, "SKILL.md"))).toBe(true);
  expect(JSON.parse(result.stdout).warnings.some((warning: string) => warning.includes("preserved user-owned path"))).toBe(true);
});
