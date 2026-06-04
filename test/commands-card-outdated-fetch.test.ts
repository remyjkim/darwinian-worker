// ABOUTME: Verifies remote-aware card outdated checks.
// ABOUTME: Ensures --fetch refreshes Git-origin card tags before comparison.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCardLock } from "../cli/core/card-lock";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createLocalCardRepo, tagAdditionalVersion } from "./fixtures/git-helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card outdated --fetch sees newer remote tags", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
  tempRoots.push(remote.tempDir);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));
  expect((await runAgentsCli(["card", "apply", `git+${remote.url}#v1.0.0`], envFor(fixture), projectDir)).exitCode).toBe(0);
  await tagAdditionalVersion(remote, { name: "@team/backend", version: "1.1.0" });

  const result = await runAgentsCli(["card", "outdated", "--fetch", "--check"], envFor(fixture), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).toContain("1.1.0");
});

test("card outdated --fetch reports range updates without rewriting card.lock", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
  tempRoots.push(remote.tempDir);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));
  expect((await runAgentsCli(["card", "apply", `git+${remote.url}@^1.0.0`], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await loadCardLock(projectDir))?.cards[0]?.version).toBe("1.0.0");
  await tagAdditionalVersion(remote, { name: "@team/backend", version: "1.1.0" });

  const result = await runAgentsCli(["card", "outdated", "--fetch", "--json"], envFor(fixture), projectDir);

  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).outdated).toEqual([
    { name: "@team/backend", current: "1.0.0", latest: "1.1.0" },
  ]);
  expect((await loadCardLock(projectDir))?.cards[0]?.version).toBe("1.0.0");

  const update = await runAgentsCli(["card", "update"], envFor(fixture), projectDir);
  expect(update.exitCode, update.stderr).toBe(0);
  expect((await loadCardLock(projectDir))?.cards[0]?.version).toBe("1.1.0");
});
