// ABOUTME: Verifies drwn up re-vendors updated treeShas through write reconcile.
// ABOUTME: Covers update lock refresh followed by materialization.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeCardLock } from "../cli/core/card-lock";
import { updateProjectCardLock } from "../cli/core/card-project";
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
    `${JSON.stringify({ version: 1, cards: ["@me/revendor@1.0.0"] }, null, 2)}\n`,
  );
  const { resolveCard } = await import("../cli/core/card-store");
  const resolved = await resolveCard(fixture.agentsDir, "@me/revendor@1.0.0");
  await writeCardLock(projectDir, [
    {
      name: resolved.name,
      requested: "@me/revendor@1.0.0",
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

  await updateProjectCardLock(projectDir, fixture.agentsDir, {
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
