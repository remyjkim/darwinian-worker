// ABOUTME: Verifies repo-local and globally linked `drwn` invocations behave the same for representative commands.
// ABOUTME: Protects the supported dual execution modes for future users and release workflows.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, lstat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupTempRoots, createTempRoot, runAgentsCli, runGlobalAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
let linkOverrides: { BUN_INSTALL_GLOBAL_DIR: string; BUN_INSTALL_BIN: string; PATH: string };

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
  const linkRoot = await createTempRoot("drwn-cli-parity-");
  tempRoots.push(linkRoot);
  const globalDir = join(linkRoot, "global");
  const binDir = join(linkRoot, "bin");
  await mkdir(globalDir);
  await mkdir(binDir);
  linkOverrides = {
    BUN_INSTALL_GLOBAL_DIR: globalDir,
    BUN_INSTALL_BIN: binDir,
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
  };
  const link = Bun.spawn(["bun", "link"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...linkOverrides },
  });
  const [exitCode, , stderr] = await Promise.all([
    link.exited,
    new Response(link.stdout).text(),
    new Response(link.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`bun link failed in isolated root: ${stderr.trim()}`);
  const [binLink, globalLink] = await Promise.all([
    lstat(join(binDir, "drwn")),
    lstat(join(globalDir, "node_modules", "darwinian")),
  ]);
  if (!binLink.isSymbolicLink() || !globalLink.isSymbolicLink()) {
    throw new Error("bun link did not create both isolated symlinks");
  }
});

afterAll(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("cli parity", () => {
  test("repo-local and global invocations match for representative commands", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const env = {
      ...linkOverrides,
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
