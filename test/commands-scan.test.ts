// ABOUTME: Verifies the placeholder scan command is discoverable and safely non-mutating.
// ABOUTME: Protects the future command slot while deeper scan/import behavior is designed separately.

import { afterEach, describe, expect, test } from "bun:test";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("drwn scan", () => {
  test("reports placeholder status without mutating", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["scan"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("not implemented yet");
    expect(result.stdout).toContain("No files changed");
  });

  test("supports json output", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["scan", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { implemented: boolean; changes: string[] };
    expect(parsed.implemented).toBe(false);
    expect(parsed.changes).toEqual([]);
  });
});
