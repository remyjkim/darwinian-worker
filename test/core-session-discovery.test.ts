import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectRoot, deriveProjectSlug, discoverClaudeSessions, discoverCodexSessions, gitWorktreeRoots } from "../cli/core/export/session-discovery";

const repoRoot = join(import.meta.dir, "..");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot(prefix = "sd-test-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

describe("deriveProjectSlug", () => {
  test("replaces every slash with a dash", async () => {
    expect(deriveProjectSlug("/Users/jgbae/Projects/foo")).toBe("-Users-jgbae-Projects-foo");
  });

  test("handles a single-segment path", async () => {
    expect(deriveProjectSlug("/foo")).toBe("-foo");
  });

  test("handles path with no leading slash", async () => {
    expect(deriveProjectSlug("foo/bar")).toBe("foo-bar");
  });
});

describe("discoverClaudeSessions", () => {
  test("prefix filter: includes dirs matching slug and excludes others", async () => {
    const projectsDir = await createTempRoot("claude-projects-");
    const slug = "-Users-foo-myproject";

    const matchingDirs = ["-Users-foo-myproject", "-Users-foo-myproject--claude-worktrees-abc123"];
    const nonMatchingDir = "-Users-bar-otherproject";

    for (const dir of [...matchingDirs, nonMatchingDir]) {
      await mkdir(join(projectsDir, dir));
    }

    for (const dir of matchingDirs) {
      await writeFile(join(projectsDir, dir, "session-001.jsonl"), '{"type":"message"}\n');
    }
    await writeFile(join(projectsDir, nonMatchingDir, "session-999.jsonl"), '{"type":"message"}\n');

    const results = await discoverClaudeSessions(projectsDir, slug);

    const absolutePaths = results.map((r) => r.absolutePath);
    expect(absolutePaths.some((p) => p.includes("-Users-foo-myproject"))).toBe(true);
    expect(absolutePaths.some((p) => p.includes("-Users-foo-myproject--claude-worktrees-abc123"))).toBe(true);
    expect(absolutePaths.some((p) => p.includes("-Users-bar-otherproject"))).toBe(false);
  });

  test("returns correct source and archivePath structure", async () => {
    const projectsDir = await createTempRoot("claude-projects-");
    const slug = "-Users-foo-myproject";
    const slugDir = "-Users-foo-myproject";

    await mkdir(join(projectsDir, slugDir));
    await writeFile(join(projectsDir, slugDir, "abc.jsonl"), '{"type":"message"}\n');

    const results = await discoverClaudeSessions(projectsDir, slug);

    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe("claude");
    expect(results[0]!.archivePath).toBe(`claude/abc.jsonl`);
    expect(results[0]!.absolutePath).toBe(join(projectsDir, slugDir, "abc.jsonl"));
  });

  test("empty-file filter: excludes 0-byte jsonl files", async () => {
    const projectsDir = await createTempRoot("claude-projects-");
    const slug = "-Users-foo-myproject";
    const slugDir = "-Users-foo-myproject";

    await mkdir(join(projectsDir, slugDir));
    await writeFile(join(projectsDir, slugDir, "nonempty.jsonl"), '{"type":"message"}\n');
    await writeFile(join(projectsDir, slugDir, "empty.jsonl"), "");

    const results = await discoverClaudeSessions(projectsDir, slug);

    expect(results).toHaveLength(1);
    expect(results[0]!.absolutePath).toContain("nonempty.jsonl");
  });

  test("recursively discovers subagent .jsonl files nested under session dirs", async () => {
    const projectsDir = await createTempRoot("claude-projects-");
    const slug = "-Users-foo-myproject";
    const slugDir = "-Users-foo-myproject";
    const sessionId = "abc123";

    // top-level session file
    await mkdir(join(projectsDir, slugDir));
    await writeFile(join(projectsDir, slugDir, `${sessionId}.jsonl`), '{"type":"message"}\n');

    // subagent files nested under <session-id>/subagents/
    await mkdir(join(projectsDir, slugDir, sessionId, "subagents"), { recursive: true });
    await writeFile(join(projectsDir, slugDir, sessionId, "subagents", "agent-001.jsonl"), '{"type":"message"}\n');
    await writeFile(join(projectsDir, slugDir, sessionId, "subagents", "agent-002.jsonl"), '{"type":"message"}\n');

    const results = await discoverClaudeSessions(projectsDir, slug);

    expect(results).toHaveLength(3);
    const archivePaths = results.map((r) => r.archivePath).sort();
    expect(archivePaths).toContain(`claude/${sessionId}.jsonl`);
    expect(archivePaths).toContain(`claude/agents/agent-001.jsonl`);
    expect(archivePaths).toContain(`claude/agents/agent-002.jsonl`);
  });

  test("returns empty array when claudeProjectsDir does not exist", async () => {
    const results = await discoverClaudeSessions("/nonexistent-path-abc123/projects", "-Users-foo-bar");

    expect(results).toEqual([]);
  });

  test("ignores non-jsonl files inside matching slug directories", async () => {
    const projectsDir = await createTempRoot("claude-projects-");
    const slug = "-Users-foo-myproject";
    const slugDir = "-Users-foo-myproject";

    await mkdir(join(projectsDir, slugDir));
    await writeFile(join(projectsDir, slugDir, "session.jsonl"), '{"type":"message"}\n');
    await writeFile(join(projectsDir, slugDir, "metadata.json"), '{"info":"stuff"}\n');
    await writeFile(join(projectsDir, slugDir, "notes.txt"), "some notes\n");

    const results = await discoverClaudeSessions(projectsDir, slug);

    expect(results).toHaveLength(1);
    expect(results[0]!.absolutePath).toContain("session.jsonl");
  });
});

describe("discoverCodexSessions", () => {
  test("includes file when first-line type is session_meta and cwd matches exactly", async () => {
    const codexDir = await createTempRoot("codex-sessions-");
    const sessionDir = join(codexDir, "2024", "03", "15");
    await mkdir(sessionDir, { recursive: true });

    const firstLine = JSON.stringify({ type: "session_meta", payload: { cwd: "/my/project" } });
    await writeFile(join(sessionDir, "session-abc.jsonl"), firstLine + "\n");

    const results = await discoverCodexSessions(codexDir, ["/my/project"]);

    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe("codex");
    expect(results[0]!.absolutePath).toBe(join(sessionDir, "session-abc.jsonl"));
    expect(results[0]!.archivePath).toBe("codex/session-abc.jsonl");
  });

  test("includes file when cwd starts with projectRoot + /", async () => {
    const codexDir = await createTempRoot("codex-sessions-");
    const sessionDir = join(codexDir, "2024", "03", "15");
    await mkdir(sessionDir, { recursive: true });

    const firstLine = JSON.stringify({ type: "session_meta", payload: { cwd: "/my/project/subdir" } });
    await writeFile(join(sessionDir, "session-sub.jsonl"), firstLine + "\n");

    const results = await discoverCodexSessions(codexDir, ["/my/project"]);

    expect(results).toHaveLength(1);
    expect(results[0]!.absolutePath).toContain("session-sub.jsonl");
  });

  test("excludes file when projectRoots does not match cwd", async () => {
    const codexDir = await createTempRoot("codex-sessions-");
    const sessionDir = join(codexDir, "2024", "03", "15");
    await mkdir(sessionDir, { recursive: true });

    const firstLine = JSON.stringify({ type: "session_meta", payload: { cwd: "/my/project" } });
    await writeFile(join(sessionDir, "session-abc.jsonl"), firstLine + "\n");

    const results = await discoverCodexSessions(codexDir, ["/other"]);

    expect(results).toHaveLength(0);
  });

  test("excludes file when type is not session_meta", async () => {
    const codexDir = await createTempRoot("codex-sessions-");
    const sessionDir = join(codexDir, "2024", "03", "15");
    await mkdir(sessionDir, { recursive: true });

    const firstLine = JSON.stringify({ type: "message", payload: { cwd: "/my/project" } });
    await writeFile(join(sessionDir, "session-abc.jsonl"), firstLine + "\n");

    const results = await discoverCodexSessions(codexDir, ["/my/project"]);

    expect(results).toHaveLength(0);
  });

  test("malformed JSON on first line is skipped silently", async () => {
    const codexDir = await createTempRoot("codex-sessions-");
    const sessionDir = join(codexDir, "2024", "03", "15");
    await mkdir(sessionDir, { recursive: true });

    await writeFile(join(sessionDir, "bad.jsonl"), "not-valid-json\n");

    const results = await discoverCodexSessions(codexDir, ["/my/project"]);

    expect(results).toHaveLength(0);
  });

  test("empty file is skipped silently", async () => {
    const codexDir = await createTempRoot("codex-sessions-");
    const sessionDir = join(codexDir, "2024", "03", "15");
    await mkdir(sessionDir, { recursive: true });

    await writeFile(join(sessionDir, "empty.jsonl"), "");

    const results = await discoverCodexSessions(codexDir, ["/my/project"]);

    expect(results).toHaveLength(0);
  });

  test("returns empty array when codexSessionsDir does not exist", async () => {
    const results = await discoverCodexSessions("/nonexistent-codex-path-xyz", ["/my/project"]);

    expect(results).toHaveLength(0);
  });
});

describe("resolveProjectRoot", () => {
  test("in a real git repo returns a non-empty string that does not end with /", async () => {
    const result = await resolveProjectRoot(join(import.meta.dir, ".."));

    expect(result.length).toBeGreaterThan(0);
    expect(result.endsWith("/")).toBe(false);
  });

  test("in a non-git directory returns the realpath of cwd", async () => {
    const result = await resolveProjectRoot(tmpdir());
    const expected = await realpath(tmpdir());

    expect(result).toBe(expected);
  });
});

describe("gitWorktreeRoots", () => {
  test("fallback: returns [projectRoot] when not in a git repo", async () => {
    const nonGitDir = await createTempRoot("non-git-");

    const result = await gitWorktreeRoots(nonGitDir);

    expect(result).toEqual([nonGitDir]);
  });

  test("fallback: returns [projectRoot] when directory does not exist", async () => {
    const result = await gitWorktreeRoots("/nonexistent-dir-that-surely-does-not-exist-abc987");

    expect(result).toEqual(["/nonexistent-dir-that-surely-does-not-exist-abc987"]);
  });

  test("returns at least the projectRoot itself when in a git repo", async () => {
    const result = await gitWorktreeRoots(repoRoot);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toBe(repoRoot);
  });
});
