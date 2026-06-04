// ABOUTME: Verifies inline export wiring used by analyze sessions.
// ABOUTME: Keeps export helper reuse testable without shelling out to the CLI.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInlineExport } from "../cli/core/analyze/inline-export";
import type { AgentsContext } from "../cli/context";
import type { SessionFile } from "../cli/core/export/session-discovery";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

function context(cwd: string): AgentsContext {
  return {
    repoRoot: cwd,
    agentsDir: join(cwd, ".agents-global"),
    homeDir: join(cwd, "home"),
    cwd,
    projectConfigPath: null,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    env: {},
    colorDepth: 1,
  };
}

const file: SessionFile = {
  source: "claude",
  absolutePath: "/src/session.jsonl",
  archivePath: "claude/session.jsonl",
};

describe("runInlineExport", () => {
  test("throws when no session files are discovered", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-inline-"));
    await expect(runInlineExport(context(tmp), {
      resolveProjectRoot: async (cwd) => cwd,
      deriveProjectSlug: () => "slug",
      gitWorktreeRoots: async (root) => [root],
      discoverClaudeSessions: async () => [],
      discoverCodexSessions: async () => [],
      archiveSessions: async () => {},
      makeTimestamp: () => "20260603T000000",
    })).rejects.toThrow("No session files found");
  });

  test("archives discovered files as gzip to the default exports dir", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-inline-"));
    const archived: Array<{ files: SessionFile[]; outputPath: string; gzip?: boolean }> = [];

    const output = await runInlineExport(context(tmp), {
      resolveProjectRoot: async (cwd) => cwd,
      deriveProjectSlug: () => "slug",
      gitWorktreeRoots: async (root) => [root],
      discoverClaudeSessions: async () => [file],
      discoverCodexSessions: async () => [],
      archiveSessions: async (files, outputPath, options) => {
        archived.push({ files, outputPath, gzip: options.gzip });
      },
      makeTimestamp: () => "20260603T000000",
    });

    expect(output).toBe(join(tmp, ".agents", "drwn", "session-log-exports", "20260603T000000.tar.gz"));
    expect(archived).toEqual([{ files: [file], outputPath: output, gzip: true }]);
  });
});
