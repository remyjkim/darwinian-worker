// ABOUTME: Creates .tar archives of session log files using source-prefixed paths.
// ABOUTME: Provides timestamp generation and the core archiving function for bgng export.

import { mkdir, mkdtemp, rm, link, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { SessionFile } from "./session-discovery";

export function makeTimestamp(): string {
  const now = new Date();
  const year = now.getUTCFullYear().toString().padStart(4, "0");
  const month = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = now.getUTCDate().toString().padStart(2, "0");
  const hour = now.getUTCHours().toString().padStart(2, "0");
  const min = now.getUTCMinutes().toString().padStart(2, "0");
  const sec = now.getUTCSeconds().toString().padStart(2, "0");
  return `${year}${month}${day}T${hour}${min}${sec}`;
}

export async function archiveSessions(
  files: SessionFile[],
  outputPath: string,
): Promise<void> {
  if (files.length === 0) {
    throw new Error("no session files to archive");
  }

  // Ensure the parent directory of the output archive exists
  await mkdir(dirname(outputPath), { recursive: true });

  // Create a temporary staging directory to mirror archive paths via hardlinks
  const stagingDir = await mkdtemp(join(tmpdir(), "bgng-archive-"));

  try {
    for (const file of files) {
      const stagedPath = join(stagingDir, file.archivePath);
      // Create the directory tree inside staging before linking
      await mkdir(dirname(stagedPath), { recursive: true });
      // Hardlink avoids copying file data; fall back to copyFile on cross-device
      try {
        await link(file.absolutePath, stagedPath);
      } catch (err) {
        const code = err instanceof Error ? (err as Record<string, unknown>)['code'] : undefined;
        if (code === 'EXDEV') {
          await copyFile(file.absolutePath, stagedPath);
        } else {
          throw err;
        }
      }
    }

    // Build the tar archive from the staging directory so paths inside are relative
    const proc = Bun.spawn(["tar", "cf", outputPath, "-C", stagingDir, "."], {
      stdout: "ignore",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`tar exited with code ${exitCode}: ${stderr.trim()}`);
    }
  } finally {
    // Always clean up the staging directory
    await rm(stagingDir, { recursive: true, force: true });
  }
}
