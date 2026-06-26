// ABOUTME: Ensures drwn session discovery never archives hook signal sidecars as Claude logs.
// ABOUTME: Damage containment while signal transport (--include-signals) remains out of scope.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverClaudeSessions } from "../cli/core/export/session-discovery";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("discoverClaudeSessions", () => {
  test("excludes *.drwn-signals.jsonl sidecars but keeps real transcripts", async () => {
    const projectsDir = mkdtempSync(join(tmpdir(), "drwn-claude-"));
    dirs.push(projectsDir);
    const slug = "myproj";
    const sessionDir = join(projectsDir, slug);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "abc.jsonl"), '{"sessionId":"abc"}\n');
    writeFileSync(join(sessionDir, "abc.drwn-signals.jsonl"), '{"type":"card_usage"}\n');

    const files = await discoverClaudeSessions(projectsDir, slug);
    const archivePaths = files.map((f) => f.archivePath);

    expect(archivePaths).toContain("claude/abc.jsonl");
    expect(archivePaths.some((p) => p.endsWith(".drwn-signals.jsonl"))).toBe(false);
  });
});
