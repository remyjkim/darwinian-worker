// ABOUTME: Persists Git URL to card-name mappings for repeat card resolution.
// ABOUTME: Treats the cache as an optimization; missing or corrupt files are ignored.

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertValidCardManifest } from "./card-manifest";
import { writeAtomically } from "./fs";
import { assertStoreWritable, resolveStoreRoot } from "./store-paths";

export interface UrlCardMapEntry {
  name: string;
  url: string;
  discoveredAt: string;
}

interface UrlCardMapFile {
  mapVersion: 1;
  entries: Record<string, UrlCardMapEntry>;
}

export function resolveUrlCardMapPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "url-card-map.json");
}

function emptyMap(): UrlCardMapFile {
  return { mapVersion: 1, entries: {} };
}

function isValidEntry(value: unknown): value is UrlCardMapEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entry = value as Partial<UrlCardMapEntry>;
  return typeof entry.name === "string" && typeof entry.url === "string" && typeof entry.discoveredAt === "string";
}

async function loadUrlCardMap(agentsDir: string): Promise<UrlCardMapFile> {
  try {
    const parsed = JSON.parse(await readFile(resolveUrlCardMapPath(agentsDir), "utf8")) as Partial<UrlCardMapFile>;
    if (parsed.mapVersion !== 1 || !parsed.entries || typeof parsed.entries !== "object" || Array.isArray(parsed.entries)) {
      return emptyMap();
    }
    return {
      mapVersion: 1,
      entries: Object.fromEntries(Object.entries(parsed.entries).filter(([, entry]) => isValidEntry(entry))),
    };
  } catch {
    return emptyMap();
  }
}

export async function readUrlCardName(agentsDir: string, url: string): Promise<UrlCardMapEntry | null> {
  const map = await loadUrlCardMap(agentsDir);
  return map.entries[url] ?? null;
}

export async function writeUrlCardName(agentsDir: string, url: string, name: string): Promise<UrlCardMapEntry> {
  assertStoreWritable();
  assertValidCardManifest({ name, version: "0.0.0" });
  const map = await loadUrlCardMap(agentsDir);
  const entry = { name, url, discoveredAt: new Date().toISOString() };
  map.entries[url] = entry;
  const pathValue = resolveUrlCardMapPath(agentsDir);
  await mkdir(dirname(pathValue), { recursive: true });
  await writeAtomically(pathValue, `${JSON.stringify(map, null, 2)}\n`);
  return entry;
}
