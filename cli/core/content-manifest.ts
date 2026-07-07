// ABOUTME: Normalization-tolerant content manifests for vendored card integrity verification.
// ABOUTME: Computes per-file hashes (CRLF-normalized text, raw binary) and integrity digests compatible with card.lock.

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type ContentManifestFile = {
  path: string;
  exec: boolean;
  hash: string;
};

export type ContentManifest = {
  files: ContentManifestFile[];
};

export type ManifestVerification = {
  ok: boolean;
  mismatches: Array<{ path: string; expected: string; actual: string }>;
};

async function walkVersionTree(versionDir: string): Promise<Array<{ relPath: string; absPath: string; mode: number }>> {
  const entries: Array<{ relPath: string; absPath: string; mode: number }> = [];

  async function recurse(currentAbs: string, currentRel: string) {
    const dirEntries = await readdir(currentAbs, { withFileTypes: true });
    for (const dirent of dirEntries) {
      const relPath = currentRel ? `${currentRel}/${dirent.name}` : dirent.name;
      const absPath = join(currentAbs, dirent.name);
      if (relPath === ".integrity" || relPath === ".git" || relPath.startsWith(".git/")) {
        continue;
      }
      if (dirent.isDirectory()) {
        await recurse(absPath, relPath);
        continue;
      }
      if (!dirent.isFile() && !dirent.isSymbolicLink()) {
        continue;
      }
      const stats = await stat(absPath);
      if (stats.isFile()) {
        entries.push({ relPath, absPath, mode: stats.mode });
      }
    }
  }

  await recurse(versionDir, "");
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return entries;
}

function isUtf8Text(content: Buffer): boolean {
  if (content.includes(0)) {
    return false;
  }
  const text = content.toString("utf8");
  return Buffer.from(text, "utf8").equals(content);
}

export function normalizeFileBytes(content: Buffer): Buffer {
  if (!isUtf8Text(content)) {
    return content;
  }
  return Buffer.from(content.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
}

export function hashFileContent(content: Buffer): string {
  return createHash("sha256").update(normalizeFileBytes(content)).digest("hex");
}

export async function computeContentManifest(versionDir: string): Promise<ContentManifest> {
  const entries = await walkVersionTree(versionDir);
  const files: ContentManifestFile[] = [];
  for (const entry of entries) {
    const content = await readFile(entry.absPath);
    files.push({
      path: entry.relPath,
      exec: (entry.mode & 0o111) !== 0,
      hash: hashFileContent(content),
    });
  }
  return { files };
}

export function manifestIntegrityDigest(manifest: ContentManifest): string {
  const records = manifest.files.map((file) => ({
    p: file.path,
    m: file.exec ? "x" : ("-" as const),
    h: file.hash,
  }));
  const canonical = JSON.stringify(records);
  return `sha256-${createHash("sha256").update(canonical).digest("hex")}`;
}

export async function verifyManifest(versionDir: string, manifest: ContentManifest): Promise<ManifestVerification> {
  const current = await computeContentManifest(versionDir);
  const currentByPath = new Map(current.files.map((file) => [file.path, file]));
  const mismatches: ManifestVerification["mismatches"] = [];

  for (const expected of manifest.files) {
    const actual = currentByPath.get(expected.path);
    if (!actual) {
      mismatches.push({ path: expected.path, expected: expected.hash, actual: "(missing)" });
      continue;
    }
    if (actual.hash !== expected.hash || actual.exec !== expected.exec) {
      mismatches.push({ path: expected.path, expected: expected.hash, actual: actual.hash });
    }
  }

  for (const file of current.files) {
    if (!manifest.files.some((entry) => entry.path === file.path)) {
      mismatches.push({ path: file.path, expected: "(missing)", actual: file.hash });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}

export async function computeIntegrityFromDir(versionDir: string): Promise<string> {
  return manifestIntegrityDigest(await computeContentManifest(versionDir));
}
