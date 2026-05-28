// ABOUTME: Tests for the archiver module — timestamp generation and tar archive creation.
// ABOUTME: Covers output dir creation, tar content correctness, empty-input error, and source prefixes.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionFile } from "../cli/core/export/session-discovery";
import { makeTimestamp, archiveSessions, validateArchiveMembers } from "../cli/core/export/archiver";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function tarListEntries(archivePath: string): Promise<string[]> {
  const proc = Bun.spawn(["tar", "tf", archivePath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errText = await new Response(proc.stderr).text();
    throw new Error(`tar tf failed (exit ${exitCode}): ${errText}`);
  }
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

describe("makeTimestamp", () => {
  test("returns a string matching YYYYMMDDTHHmmss format", async () => {
    const ts = makeTimestamp();
    expect(ts).toMatch(/^\d{8}T\d{6}$/);
  });

  test("reflects a plausible current UTC date", async () => {
    const before = new Date();
    const ts = makeTimestamp();
    const after = new Date();

    // Parse the timestamp back into a Date for range check
    const year = Number(ts.slice(0, 4));
    const month = Number(ts.slice(4, 6)) - 1;
    const day = Number(ts.slice(6, 8));
    const hour = Number(ts.slice(9, 11));
    const min = Number(ts.slice(11, 13));
    const sec = Number(ts.slice(13, 15));
    const parsed = new Date(Date.UTC(year, month, day, hour, min, sec));

    expect(parsed.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(parsed.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });
});

describe("validateArchiveMembers", () => {
  test("accepts members under claude/ and codex/ namespaces", () => {
    expect(() =>
      validateArchiveMembers([
        "./claude/session.jsonl",
        "./claude/agents/agent-1.jsonl",
        "./codex/rollout.jsonl",
      ]),
    ).not.toThrow();
  });

  test("ignores directory entries", () => {
    expect(() =>
      validateArchiveMembers([
        "./",
        "./claude/",
        "./claude/agents/",
        "./codex/",
        "./claude/session.jsonl",
      ]),
    ).not.toThrow();
  });

  test("rejects AppleDouble ._ entries", () => {
    expect(() => validateArchiveMembers(["./claude/._session.jsonl"])).toThrow(/AppleDouble/);
  });

  test("rejects entries under __MACOSX/", () => {
    expect(() => validateArchiveMembers(["./__MACOSX/claude/session.jsonl"])).toThrow(/__MACOSX/);
  });

  test("rejects .DS_Store entries", () => {
    expect(() => validateArchiveMembers(["./claude/.DS_Store"])).toThrow(/DS_Store/);
  });

  test("rejects hidden dotfile entries", () => {
    expect(() => validateArchiveMembers(["./claude/.hidden.jsonl"])).toThrow(/hidden/i);
  });

  test("rejects entries outside the claude/ or codex/ namespace", () => {
    expect(() => validateArchiveMembers(["./elsewhere/session.jsonl"])).toThrow(/namespace|disallowed|forbidden/i);
  });

  test("throws when file member count does not match expectedCount", () => {
    expect(() =>
      validateArchiveMembers(["./claude/a.jsonl", "./claude/b.jsonl"], 5),
    ).toThrow(/count|expected/i);
  });

  test("passes when file member count matches expectedCount (excluding dir entries)", () => {
    expect(() =>
      validateArchiveMembers(
        ["./", "./claude/", "./claude/a.jsonl", "./claude/b.jsonl"],
        2,
      ),
    ).not.toThrow();
  });
});

describe("archiveSessions", () => {
  test("creates the parent output directory when it does not exist", async () => {
    const root = await createTempRoot("archiver-mkdir-");

    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    const srcFile = join(srcDir, "session.jsonl");
    await writeFile(srcFile, '{"type":"message"}\n');

    const files: SessionFile[] = [
      {
        source: "claude",
        absolutePath: srcFile,
        archivePath: "claude/proj/session.jsonl",
      },
    ];

    // The parent dir .agents/bgng/ does not exist yet
    const outputPath = join(root, ".agents", "bgng", "sessions.tar");
    await archiveSessions(files, outputPath);

    expect(existsSync(outputPath)).toBe(true);
  });

  test("writes a valid tar containing the archivePath, not the absolutePath", async () => {
    const root = await createTempRoot("archiver-tar-");

    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    const srcFile = join(srcDir, "session.jsonl");
    await writeFile(srcFile, '{"type":"message","content":"hello"}\n');

    const archivePath = "claude/myproject/session.jsonl";
    const files: SessionFile[] = [
      {
        source: "claude",
        absolutePath: srcFile,
        archivePath,
      },
    ];

    const outputPath = join(root, "out", "sessions.tar");
    await archiveSessions(files, outputPath);

    const entries = await tarListEntries(outputPath);

    // The archive must contain the archivePath (with or without leading ./)
    const normalised = entries.map((e) => e.replace(/^\.\//, ""));
    expect(normalised).toContain(archivePath);

    // The absolutePath (raw source path) must NOT appear
    expect(entries.some((e) => e.includes(srcDir))).toBe(false);
  });

  test("throws 'no session files to archive' when files array is empty", async () => {
    const root = await createTempRoot("archiver-empty-");
    const outputPath = join(root, "out", "sessions.tar");

    await expect(archiveSessions([], outputPath)).rejects.toThrow(
      "no session files to archive",
    );
  });

  test("archives both claude and codex files with correct source-prefixed paths", async () => {
    const root = await createTempRoot("archiver-multi-");

    const claudeDir = join(root, "claude-src");
    const codexDir = join(root, "codex-src");
    await mkdir(claudeDir, { recursive: true });
    await mkdir(codexDir, { recursive: true });

    const claudeFile = join(claudeDir, "claude-session.jsonl");
    const codexFile = join(codexDir, "codex-session.jsonl");
    await writeFile(claudeFile, '{"type":"message","agent":"claude"}\n');
    await writeFile(codexFile, '{"type":"session_meta","agent":"codex"}\n');

    const files: SessionFile[] = [
      {
        source: "claude",
        absolutePath: claudeFile,
        archivePath: "claude/myproject-slug/claude-session.jsonl",
      },
      {
        source: "codex",
        absolutePath: codexFile,
        archivePath: "codex/sub/codex-session.jsonl",
      },
    ];

    const outputPath = join(root, "out", "sessions.tar");
    await archiveSessions(files, outputPath);

    const entries = await tarListEntries(outputPath);
    const normalised = entries.map((e) => e.replace(/^\.\//, ""));

    expect(normalised).toContain("claude/myproject-slug/claude-session.jsonl");
    expect(normalised).toContain("codex/sub/codex-session.jsonl");
  });

  test("rejects archive members outside the claude/ or codex/ namespace", async () => {
    const root = await createTempRoot("archiver-namespace-");
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    const srcFile = join(srcDir, "session.jsonl");
    await writeFile(srcFile, '{"type":"message"}\n');

    const files: SessionFile[] = [
      {
        source: "claude",
        absolutePath: srcFile,
        archivePath: "elsewhere/session.jsonl",
      },
    ];

    const outputPath = join(root, "out", "sessions.tar");
    await expect(archiveSessions(files, outputPath)).rejects.toThrow(/namespace|disallowed|forbidden/i);
    expect(existsSync(outputPath)).toBe(false);
  });

  test("with gzip:true writes a gzipped tar readable by 'tar -tzf'", async () => {
    const root = await createTempRoot("archiver-gzip-");
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    const srcFile = join(srcDir, "session.jsonl");
    await writeFile(srcFile, '{"type":"message"}\n');

    const files: SessionFile[] = [
      {
        source: "claude",
        absolutePath: srcFile,
        archivePath: "claude/session.jsonl",
      },
    ];

    const outputPath = join(root, "out", "sessions.tar.gz");
    await archiveSessions(files, outputPath, { gzip: true });

    expect(existsSync(outputPath)).toBe(true);

    // Gzip magic number 0x1f 0x8b
    const buf = await readFile(outputPath);
    expect(buf[0]).toBe(0x1f);
    expect(buf[1]).toBe(0x8b);

    // And `tar -tzf` should list the member
    const proc = Bun.spawn(["tar", "-tzf", outputPath], { stdout: "pipe", stderr: "pipe" });
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout).toContain("claude/session.jsonl");
  });

  test("staging directory is cleaned up after successful archive", async () => {
    const root = await createTempRoot("archiver-cleanup-");

    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    const srcFile = join(srcDir, "session.jsonl");
    await writeFile(srcFile, '{"type":"message"}\n');

    const files: SessionFile[] = [
      {
        source: "claude",
        absolutePath: srcFile,
        archivePath: "claude/proj/session.jsonl",
      },
    ];

    // Capture bgng-archive-* entries in tmpdir before calling archiveSessions
    const before = new Set(
      (await readdir(tmpdir())).filter((e) => e.startsWith("bgng-archive-")),
    );

    const outputPath = join(root, "out", "sessions.tar");
    await archiveSessions(files, outputPath);

    // Verify output archive was created
    expect(existsSync(outputPath)).toBe(true);

    // Verify no new bgng-archive-* entries exist in tmpdir after archiveSessions
    const after = (await readdir(tmpdir())).filter((e) =>
      e.startsWith("bgng-archive-"),
    );
    const newEntries = after.filter((e) => !before.has(e));
    expect(newEntries).toHaveLength(0);
  });
});
