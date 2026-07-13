// ABOUTME: Verifies drwn write accepts only the floor derived from the strict V1 Worker graph.
// ABOUTME: Keeps forged future or lower floors from bypassing lock-wide capability validation.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function projectWithLockFloor(minDrwnVersion: string) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "proj");
  const drwnDir = join(projectDir, ".agents", "drwn");
  await mkdir(drwnDir, { recursive: true });
  await writeSupportedProjectConfig(projectDir);
  await writeFile(
    join(drwnDir, "card.lock"),
    JSON.stringify({
      schema: "drwn.project-lock",
      schemaVersion: 1,
      store: { minDrwnVersion },
      workerRoots: [],
      cards: [],
    }, null, 2),
  );
  const env = {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
  return { env, projectDir };
}

describe("drwn write version floor", () => {
  test("a forged future floor is rejected before write", async () => {
    const { env, projectDir } = await projectWithLockFloor("9.9.9");

    const result = await runAgentsCli(["write", "--strict", "--dry-run"], env, projectDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("PROJECT_LOCK_INVALID");
    expect(result.stderr).toContain("store.minDrwnVersion must be 0.8.0 for this Worker graph");
  });

  test("a forged lower floor is rejected instead of weakening the graph contract", async () => {
    const { env, projectDir } = await projectWithLockFloor("0.1.0");

    const result = await runAgentsCli(["write", "--dry-run"], env, projectDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("PROJECT_LOCK_INVALID");
    expect(result.stderr).toContain("store.minDrwnVersion must be 0.8.0 for this Worker graph");
  });

  test("the exact derived non-Mind floor neither warns nor fails", async () => {
    const { env, projectDir } = await projectWithLockFloor("0.8.0");

    const result = await runAgentsCli(["write", "--dry-run"], env, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Upgrade drwn");
  });
});
