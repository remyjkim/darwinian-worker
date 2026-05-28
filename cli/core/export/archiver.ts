// ABOUTME: Creates .tar archives of session log files using source-prefixed paths.
// ABOUTME: Provides timestamp generation and the core archiving function for bgng export.

import { mkdir, mkdtemp, rm, link, copyFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { SessionFile } from "./session-discovery";

const ALLOWED_PREFIXES = ["claude/", "codex/"] as const;

export interface ArchiveOptions {
  gzip?: boolean;
}

async function listArchiveMembers(archivePath: string, gzip: boolean): Promise<string[]> {
  const proc = Bun.spawn(["tar", gzip ? "tzf" : "tf", archivePath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`tar tf exited with code ${exitCode}: ${stderr.trim()}`);
  }
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function validateArchiveMembers(members: string[], expectedCount?: number): void {
  let fileCount = 0;
  for (const raw of members) {
    const member = raw.replace(/^\.\//, "");
    if (member === "" || member.endsWith("/")) continue;
    fileCount++;
    const segments = member.split("/");
    const basename = segments[segments.length - 1]!;
    if (basename.startsWith("._")) {
      throw new Error(`archive contains AppleDouble metadata entry: ${member}`);
    }
    if (segments.includes("__MACOSX")) {
      throw new Error(`archive contains __MACOSX macOS metadata entry: ${member}`);
    }
    if (basename === ".DS_Store") {
      throw new Error(`archive contains .DS_Store entry: ${member}`);
    }
    if (basename.startsWith(".")) {
      throw new Error(`archive contains hidden dotfile entry: ${member}`);
    }
    const inAllowedNamespace = ALLOWED_PREFIXES.some((prefix) => member.startsWith(prefix));
    if (!inAllowedNamespace) {
      throw new Error(`archive contains disallowed member outside claude/codex namespace: ${member}`);
    }
  }
  if (expectedCount !== undefined && fileCount !== expectedCount) {
    throw new Error(`archive member count (${fileCount}) does not match expected input count (${expectedCount})`);
  }
}

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

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export async function archiveSessions(
  files: SessionFile[],
  outputPath: string,
  options: ArchiveOptions = {},
): Promise<void> {
  if (files.length === 0) {
    throw new Error("no session files to archive");
  }

  const gzip = options.gzip === true;

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
        if (errorCode(err) === "EXDEV") {
          await copyFile(file.absolutePath, stagedPath);
        } else {
          throw err;
        }
      }
    }

    // COPYFILE_DISABLE=1 tells BSD tar not to emit AppleDouble (._*) companions even if the
    // source has macOS xattrs. --no-mac-metadata is a belt-and-suspenders flag for BSD tar on
    // macOS 12+ that also suppresses extended attribute archiving. The mode flag must come
    // before --no-mac-metadata or BSD tar refuses to parse.
    const tarArgs = ["tar", gzip ? "czf" : "cf", outputPath];
    if (process.platform === "darwin") {
      tarArgs.push("--no-mac-metadata");
    }
    tarArgs.push("-C", stagingDir, ".");
    const proc = Bun.spawn(tarArgs, {
      stdout: "ignore",
      stderr: "pipe",
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`tar exited with code ${exitCode}: ${stderr.trim()}`);
    }

    try {
      const members = await listArchiveMembers(outputPath, gzip);
      validateArchiveMembers(members, files.length);
    } catch (err) {
      await unlink(outputPath).catch(() => {});
      throw err;
    }
  } finally {
    // Always clean up the staging directory
    await rm(stagingDir, { recursive: true, force: true });
  }
}
