// ABOUTME: Discovers Claude and Codex session files relative to a project root.
// ABOUTME: Provides git-worktree-aware path resolution for the export pipeline.

import { readdir, stat, realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { Dirent } from "node:fs";
import { join, relative, basename, sep } from "node:path";

export interface SessionFile {
  source: "claude" | "codex";
  absolutePath: string;
  archivePath: string;
}

export async function resolveProjectRoot(cwd: string): Promise<string> {
  let root = cwd;
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      root = stdout.trim();
    }
  } catch {
    // fall through to cwd fallback
  }
  // macOS resolves /var → /private/var; Claude records realpaths so the slug must match.
  try {
    return await realpath(root);
  } catch {
    return root;
  }
}

// Leading dash is intentional: Claude encodes "/" as "-", so "/Users/..." → "-Users-..."
export function deriveProjectSlug(projectRoot: string): string {
  return projectRoot.replaceAll("/", "-");
}

export async function gitWorktreeRoots(projectRoot: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return [projectRoot];
    }

    const paths: string[] = [];
    for (const line of stdout.split("\n")) {
      if (line.startsWith("worktree ")) {
        paths.push(line.slice("worktree ".length).trim());
      }
    }

    return paths.length > 0 ? paths : [projectRoot];
  } catch {
    return [projectRoot];
  }
}

export async function discoverClaudeSessions(
  claudeProjectsDir: string,
  projectSlug: string,
): Promise<SessionFile[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(claudeProjectsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const matchingDirs = entries.filter(
    (e) => e.isDirectory() && e.name.startsWith(projectSlug),
  );

  const results: SessionFile[] = [];

  for (const dir of matchingDirs) {
    const dirPath = join(claudeProjectsDir, dir.name);
    const allFiles = await walkJsonlFiles(dirPath);

    for (const absolutePath of allFiles) {
      let size: number;
      try {
        size = (await stat(absolutePath)).size;
      } catch {
        continue;
      }

      if (size === 0) continue;

      const rel = relative(dirPath, absolutePath);
      const isSubagent = rel.split(sep).includes("subagents");
      const archivePath = isSubagent
        ? `claude/agents/${basename(absolutePath)}`
        : `claude/${basename(absolutePath)}`;
      results.push({
        source: "claude",
        absolutePath,
        archivePath,
      });
    }
  }

  return results;
}

interface SessionMetaPayload {
  cwd?: string;
}

interface SessionMetaLine {
  type: string;
  payload?: SessionMetaPayload;
}

// Codex session_meta lines can exceed 20 KB; readline streams until the first \n
// rather than reading a fixed-size buffer that would truncate and fail to parse.
function readFirstLine(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let settled = false;
    const settle = (value: string | null) => {
      if (settled) return;
      settled = true;
      rl.close();
      stream.destroy();
      resolve(value);
    };
    rl.once("line", (line) => settle(line));
    rl.once("close", () => settle(null));
    stream.once("error", () => settle(null));
  });
}

async function walkJsonlFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkJsonlFiles(fullPath);
      results.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(fullPath);
    }
  }

  return results;
}

function cwdMatchesRoot(cwd: string, root: string): boolean {
  return cwd === root || cwd.startsWith(root + "/");
}

export async function discoverCodexSessions(
  codexSessionsDir: string,
  projectRoots: string[],
): Promise<SessionFile[]> {
  const allFiles = await walkJsonlFiles(codexSessionsDir);
  const results: SessionFile[] = [];

  for (const absolutePath of allFiles) {
    const firstLine = await readFirstLine(absolutePath);
    if (firstLine === null) continue;

    let parsed: SessionMetaLine;
    try {
      parsed = JSON.parse(firstLine) as SessionMetaLine;
    } catch {
      continue;
    }

    if (parsed.type !== "session_meta") continue;

    const cwd = parsed.payload?.cwd;
    if (typeof cwd !== "string") continue;

    const matched = projectRoots.some((root) => cwdMatchesRoot(cwd, root));
    if (!matched) continue;

    const archivePath = `codex/${basename(absolutePath)}`;

    results.push({
      source: "codex",
      absolutePath,
      archivePath,
    });
  }

  return results;
}
