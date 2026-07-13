// ABOUTME: Verifies repo-local and globally linked `drwn` invocations behave the same for representative commands.
// ABOUTME: Protects the supported dual execution modes for future users and release workflows.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { cleanupTempRoots, createTempRoot, runAgentsCli, runGlobalAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

function normalizeForParity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForParity);
  if (typeof value !== "object" || value === null) return value;
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "versionFloor") continue;
    normalized[key] = normalizeForParity(entry);
  }
  return normalized;
}

beforeAll(async () => {
  const link = Bun.spawn(["bun", "link"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
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
      ["machine", "skill", "list", "--json"],
      ["mcp", "list", "--json"],
    ];

    for (const args of commands) {
      const local = await runAgentsCli(args, env);
      const global = await runGlobalAgentsCli(args, env);

      expect(local.exitCode).toBe(0);
      expect(global.exitCode).toBe(0);
      expect(normalizeForParity(JSON.parse(local.stdout))).toEqual(normalizeForParity(JSON.parse(global.stdout)));
    }
  });
});
