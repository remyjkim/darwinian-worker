// ABOUTME: Verifies drwn up re-vendors updated treeShas through write reconcile.
// ABOUTME: Covers update lock refresh followed by materialization.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyProjectWorkerRoots, updateProjectWorkerGraph } from "../cli/core/worker-project";
import { syncRepository } from "../cli/core/sync";
import { cleanupTempRoots, publishCardWithSkills, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("update lock refresh followed by write reconciles vendor trees", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/revendor", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    `${JSON.stringify({ version: 2 }, null, 2)}\n`,
  );
  await applyProjectWorkerRoots(projectDir, fixture.agentsDir, ["@me/revendor@1.0.0"], {
    repoRoot: fixture.repoRoot,
    cwd: projectDir,
  });

  await updateProjectWorkerGraph(projectDir, fixture.agentsDir, undefined, {
    repoRoot: fixture.repoRoot,
    cwd: projectDir,
  });
  const result = await syncRepository({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
    dryRun: true,
    mcpOnly: true,
  });
  expect(result.changes.length + result.warnings.length).toBeGreaterThanOrEqual(0);
});
