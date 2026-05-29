// ABOUTME: Verifies repo-local and globally linked `drwn` invocations behave the same for representative commands.
// ABOUTME: Protects the supported dual execution modes for future users and release workflows.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cleanupTempRoots, createTempRoot, runAgentsCli, runGlobalAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

beforeAll(async () => {
  const link = Bun.spawn(["bun", "link"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  await link.exited;
});

afterAll(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("cli parity", () => {
  test("repo-local and global invocations match for representative commands", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    const commands = [
      ["status", "--json"],
      ["skills", "list", "--json"],
      ["mcp", "list", "--json"],
      ["doctor", "--json"],
    ];

    for (const args of commands) {
      const local = await runAgentsCli(args, env);
      const global = await runGlobalAgentsCli(args, env);

      expect(local.exitCode).toBe(0);
      expect(global.exitCode).toBe(0);
      expect(JSON.parse(local.stdout)).toEqual(JSON.parse(global.stdout));
    }
  });
});
