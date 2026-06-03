// ABOUTME: Validates local archive existence, type, and size before analyzer upload.
// ABOUTME: Provides fast client-side failures while server validation remains authoritative.

import { stat } from "node:fs/promises";

const EXTENSIONS = [".tar", ".tar.gz", ".tgz"] as const;

export interface ArchiveInfo {
  path: string;
  size: number;
  extension: string;
}

export async function validateArchive(path: string, maxBytes: number): Promise<ArchiveInfo> {
  let stats;
  try {
    stats = await stat(path);
  } catch {
    throw new Error(`Archive not found: ${path}`);
  }

  if (stats.size === 0) throw new Error(`Archive is empty: ${path}`);
  const extension = EXTENSIONS.find((candidate) => path.endsWith(candidate));
  if (!extension) {
    throw new Error(`Unsupported archive extension. Expected one of: ${EXTENSIONS.join(", ")}.`);
  }
  if (stats.size > maxBytes) {
    throw new Error(`Archive exceeds limit (${stats.size} bytes > ${maxBytes} bytes).`);
  }
  return { path, size: stats.size, extension };
}
