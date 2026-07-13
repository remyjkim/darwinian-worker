// ABOUTME: Verifies drwn write warns (and with --strict fails) when a project's card.lock floor exceeds the running drwn.
// ABOUTME: Guards the version-floor enforcement so an under-version drwn cannot silently materialize a newer lock.

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
  test("--strict fails when the lock requires a newer drwn", async () => {
    const { env, projectDir } = await projectWithLockFloor("9.9.9");

    const result = await runAgentsCli(["write", "--strict", "--dry-run"], env, projectDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("9.9.9");
    expect(result.stderr.toLowerCase()).toContain("upgrade");
  });

  test("without --strict it warns but still proceeds", async () => {
    const { env, projectDir } = await projectWithLockFloor("9.9.9");

    const result = await runAgentsCli(["write", "--dry-run"], env, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("9.9.9");
  });

  test("a satisfiable floor neither warns nor fails", async () => {
    const { env, projectDir } = await projectWithLockFloor("0.1.0");

    const result = await runAgentsCli(["write", "--dry-run"], env, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Upgrade drwn");
  });
});
