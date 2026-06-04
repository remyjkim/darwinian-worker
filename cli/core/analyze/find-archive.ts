// ABOUTME: Finds the newest local session archive for `drwn analyze sessions`.
// ABOUTME: Supports the default hybrid input flow without command-layer filesystem logic.

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

function isArchiveName(name: string) {
  return name.endsWith(".tar") || name.endsWith(".tar.gz") || name.endsWith(".tgz");
}

export async function findNewestArchive(exportsDir: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(exportsDir);
  } catch {
    return null;
  }

  const candidates = entries.filter(isArchiveName);
  if (candidates.length === 0) return null;

  const stats = await Promise.all(
    candidates.map(async (entry) => {
      const path = join(exportsDir, entry);
      return { path, mtimeMs: (await stat(path)).mtimeMs };
    }),
  );
  stats.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return stats[0]?.path ?? null;
}
