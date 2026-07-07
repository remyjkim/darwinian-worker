// ABOUTME: Verifies drwn up reports nothing-to-update and update flows.
// ABOUTME: Covers porcelain orchestration over outdated detection and write.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeCardLock } from "../cli/core/card-lock";
import { cleanupTempRoots, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("up reports nothing to update for current lock", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/up", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    `${JSON.stringify({ version: 1, cards: ["@me/up@1.0.0"] }, null, 2)}\n`,
  );
  const { resolveCard } = await import("../cli/core/card-store");
  const resolved = await resolveCard(fixture.agentsDir, "@me/up@1.0.0");
  await writeCardLock(projectDir, [
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
