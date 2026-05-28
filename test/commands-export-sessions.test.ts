// ABOUTME: Integration tests for `bgng export sessions` command.
// ABOUTME: Verifies dry-run listing, archive writing, and no-files-found paths.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldExportFixture(options?: { withSessionFile?: boolean }) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  // Resolve symlinks so the slug matches the realpath the CLI's process.cwd() returns
  const realRepoRoot = await realpath(fixture.repoRoot);
  const slug = realRepoRoot.replaceAll("/", "-");

  const claudeProjectsDir = join(fixture.homeDir, ".claude", "projects");
  const sessionDir = join(claudeProjectsDir, slug);
  await mkdir(sessionDir, { recursive: true });

  if (options?.withSessionFile !== false) {
    // Write a non-empty .jsonl file so discoverClaudeSessions picks it up
    await writeFile(
      join(sessionDir, "session.jsonl"),
      JSON.stringify({ type: "session_meta", payload: { cwd: fixture.repoRoot } }) + "\n",
    );
  }

  const env = {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };

  return { fixture, slug, env };
}

describe("bgng export sessions", () => {
  test("--dry-run with real session files lists files and exits 0", async () => {
    const { fixture, slug, env } = await scaffoldExportFixture();

    const result = await runAgentsCli(["export", "sessions", "--dry-run"], env, fixture.repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Found 1 session file(s)");
    expect(result.stdout).toContain("dry run, no archive written");
    expect(result.stdout).toContain(`claude/session.jsonl`);
  });

  test("--dry-run with no matching files reports no files found and exits 0", async () => {
    const { fixture, env } = await scaffoldExportFixture({ withSessionFile: false });

    const result = await runAgentsCli(["export", "sessions", "--dry-run"], env, fixture.repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No session files found for this project.");
  });

  test("--out writes a tar archive containing the session file", async () => {
    const { fixture, env } = await scaffoldExportFixture();
    const outPath = join(fixture.root, "out.tar");

    const result = await runAgentsCli(["export", "sessions", "--out", outPath], env, fixture.repoRoot);

    expect(result.exitCode).toBe(0);
    expect(existsSync(outPath)).toBe(true);

    // Verify the archive contains the flat claude/ path
    const tarProc = Bun.spawn(["tar", "tf", outPath], { stdout: "pipe", stderr: "pipe" });
    const tarExit = await tarProc.exited;
    expect(tarExit).toBe(0);
    const tarOut = await new Response(tarProc.stdout).text();
    expect(tarOut).toContain(`claude/session.jsonl`);
  });

  test("successful archive prints upload-ready guidance that warns against manual recompression", async () => {
    const { fixture, env } = await scaffoldExportFixture();
    const outPath = join(fixture.root, "out.tar");

    const result = await runAgentsCli(["export", "sessions", "--out", outPath], env, fixture.repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/upload[- ]ready/i);
    expect(result.stdout).toMatch(/do not.*(recompress|repackage|finder)/i);
  });

  test("--gzip writes a gzipped archive at a .tar.gz default path", async () => {
    const { fixture, env } = await scaffoldExportFixture();

    const result = await runAgentsCli(["export", "sessions", "--gzip"], env, fixture.repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Archived");

    const match = result.stdout.match(/to: (.+\.tar\.gz)/);
    expect(match).not.toBeNull();
    const archivePath = match?.[1];
    expect(archivePath).toBeDefined();
    if (!archivePath) throw new Error("expected .tar.gz path capture");
    expect(existsSync(archivePath)).toBe(true);

    // tar -tzf must succeed and list the member
    const tarProc = Bun.spawn(["tar", "-tzf", archivePath], { stdout: "pipe", stderr: "pipe" });
    const tarOut = await new Response(tarProc.stdout).text();
    expect(await tarProc.exited).toBe(0);
    expect(tarOut).toContain("claude/session.jsonl");
  });

  test("default output path writes archive and stdout reports path ending in .tar", async () => {
    const { fixture, env } = await scaffoldExportFixture();

    const result = await runAgentsCli(["export", "sessions"], env, fixture.repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Archived");
    expect(result.stdout).toContain(".tar");
    expect(result.stdout).toContain("1 file(s)");

    // extract path from "Archived N file(s) to: <path>"
    const match = result.stdout.match(/to: (.+\.tar)/);
    expect(match).not.toBeNull();
    const tarPath = match?.[1];
    expect(tarPath).toBeDefined();
    if (!tarPath) {
      throw new Error("expected archive path capture");
    }
    expect(existsSync(tarPath)).toBe(true);
  });
});
