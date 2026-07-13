// ABOUTME: Verifies drwn up reports nothing-to-update and update flows.
// ABOUTME: Covers porcelain orchestration over outdated detection and write.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig, writeTestCardLock } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("up reports nothing to update for current lock", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/up", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, {
    workers: ["@me/up@1.0.0"],
    activeWorker: "@me/up",
  });
  const { resolveCard } = await import("../cli/core/card-store");
  const resolved = await resolveCard(fixture.agentsDir, "@me/up@1.0.0");
  await writeTestCardLock(projectDir, [
    {
      name: resolved.name,
      requested: "@me/up@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha: resolved.treeSha!,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: resolved.origin,
      ...(resolved.git ? { git: resolved.git } : {}),
    },
  ]);

  const result = await runAgentsCli(["up", "--no-fetch"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(/Nothing to update/);
});
