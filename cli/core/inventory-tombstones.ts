// ABOUTME: Performs recoverable logical removal of standalone inventory records.
// ABOUTME: Uses validated operation tombstones so interrupted cleanup cannot corrupt current inventory.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { DrwnError } from "./errors";
import { writeAtomically } from "./fs";
import { resolveInventoryTombstonesRoot, resolveStoreRoot } from "./store-paths";

export type InventoryTombstoneKind = "skill-package" | "mcp";

interface InventoryTombstoneV1 {
  schema: "drwn.inventory-tombstone";
  schemaVersion: 1;
  id: string;
  kind: InventoryTombstoneKind;
  originalPath: string;
  createdAt: string;
}

export interface InventoryTombstoneInspection {
  id: string;
  kind: InventoryTombstoneKind;
  originalPath: string;
  metadataPath: string;
  payloadPath: string;
  state: "pending-rename" | "renamed" | "cleanup-pending";
}

const TOMBSTONE_TEMP_PATTERN = /^[0-9a-f-]{36}\.json\.tmp\.[0-9a-f]{16}$/;

function invalid(message: string, cause?: unknown) {
  return new DrwnError("INVENTORY_TOMBSTONE_INVALID", message, undefined, cause);
}

function validateOriginalPath(storeRoot: string, kind: InventoryTombstoneKind, pathValue: string) {
  if (!pathValue || isAbsolute(pathValue) || pathValue.includes("\\")) throw invalid("Invalid tombstone original path");
  const absolute = resolve(storeRoot, pathValue);
  const rel = relative(storeRoot, absolute).replaceAll("\\", "/");
  const prefix = kind === "skill-package" ? "skills/" : "mcp-servers/";
  if (rel.startsWith("../") || !rel.startsWith(prefix)) throw invalid(`Tombstone path is outside ${prefix}`);
  return { absolute, relative: rel };
}

function parseTombstone(value: unknown, storeRoot: string): InventoryTombstoneV1 {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (
    !record ||
    Object.keys(record).some((key) => !["schema", "schemaVersion", "id", "kind", "originalPath", "createdAt"].includes(key)) ||
    record.schema !== "drwn.inventory-tombstone" ||
    record.schemaVersion !== 1 ||
    typeof record.id !== "string" ||
    !/^[0-9a-f-]{36}$/.test(record.id) ||
    (record.kind !== "skill-package" && record.kind !== "mcp") ||
    typeof record.originalPath !== "string" ||
    typeof record.createdAt !== "string" ||
    Number.isNaN(Date.parse(record.createdAt))
  ) throw invalid("Malformed inventory tombstone metadata");
  validateOriginalPath(storeRoot, record.kind, record.originalPath);
  return record as unknown as InventoryTombstoneV1;
}

function tombstonePaths(agentsDir: string, id: string) {
  const root = resolveInventoryTombstonesRoot(agentsDir);
  return { root, metadata: join(root, `${id}.json`), payload: join(root, `${id}.payload`) };
}

export async function tombstoneInventoryPath(options: {
  agentsDir: string;
  kind: InventoryTombstoneKind;
  sourcePath: string;
  checkpoint?: (name: "after-metadata" | "after-rename") => void | Promise<void>;
}): Promise<{ removed: true; cleanupPending: boolean; tombstoneId: string }> {
  const storeRoot = resolveStoreRoot(options.agentsDir);
  const original = validateOriginalPath(storeRoot, options.kind, relative(storeRoot, options.sourcePath).replaceAll("\\", "/"));
  if (!existsSync(original.absolute)) throw new DrwnError("INVENTORY_ITEM_NOT_FOUND", `Inventory path does not exist: ${original.absolute}`);
  const id = randomUUID();
  const paths = tombstonePaths(options.agentsDir, id);
  await mkdir(paths.root, { recursive: true });
  const metadata: InventoryTombstoneV1 = {
    schema: "drwn.inventory-tombstone",
    schemaVersion: 1,
    id,
    kind: options.kind,
    originalPath: original.relative,
    createdAt: new Date().toISOString(),
  };
  await writeAtomically(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  await options.checkpoint?.("after-metadata");
  try {
    await rename(original.absolute, paths.payload);
  } catch (error) {
    await rm(paths.metadata, { force: true });
    throw error;
  }
  await options.checkpoint?.("after-rename");
  try {
    await rm(paths.payload, { recursive: true, force: true });
    await rm(paths.metadata, { force: true });
    return { removed: true, cleanupPending: false, tombstoneId: id };
  } catch {
    return { removed: true, cleanupPending: true, tombstoneId: id };
  }
}

export async function recoverInventoryTombstones(agentsDir: string) {
  const inspection = await inspectInventoryTombstones(agentsDir);
  if (inspection.tombstones.length === 0) return { recovered: [] as string[] };
  const recovered: string[] = [];
  for (const tombstone of inspection.tombstones) {
    if (tombstone.state === "renamed") {
      await rm(tombstone.payloadPath, { recursive: true, force: true });
    }
    await rm(tombstone.metadataPath, { force: true });
    recovered.push(tombstone.id);
  }
  return { recovered };
}

export async function inspectInventoryTombstones(agentsDir: string): Promise<{
  tombstones: InventoryTombstoneInspection[];
  temporaryPaths: string[];
}> {
  const root = resolveInventoryTombstonesRoot(agentsDir);
  if (!existsSync(root)) return { tombstones: [], temporaryPaths: [] };
  const rootStats = await lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw invalid(`Inventory tombstone root is not a concrete directory: ${root}`);
  const storeRoot = resolveStoreRoot(agentsDir);
  const entries = await readdir(root, { withFileTypes: true });
  const temporaryPaths: string[] = [];
  for (const entry of entries) {
    if (!TOMBSTONE_TEMP_PATTERN.test(entry.name)) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) throw invalid(`Invalid tombstone temporary: ${entry.name}`);
    temporaryPaths.push(join(root, entry.name));
  }
  const durableEntries = entries.filter((entry) => !TOMBSTONE_TEMP_PATTERN.test(entry.name));
  const metadataIds = new Set(durableEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name.slice(0, -5)));
  for (const entry of durableEntries) {
    if (entry.name.endsWith(".payload") && !metadataIds.has(entry.name.slice(0, -8))) {
      throw invalid(`Inventory tombstone payload has no metadata: ${entry.name}`);
    }
  }
  const tombstones: InventoryTombstoneInspection[] = [];
  for (const entry of durableEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      if (!entry.name.endsWith(".payload")) throw invalid(`Foreign tombstone entry: ${entry.name}`);
      continue;
    }
    let metadata: InventoryTombstoneV1;
    try {
      metadata = parseTombstone(JSON.parse(await readFile(join(root, entry.name), "utf8")), storeRoot);
    } catch (error) {
      if (error instanceof DrwnError) throw error;
      throw invalid(`Malformed tombstone JSON: ${entry.name}`, error);
    }
    if (`${metadata.id}.json` !== entry.name) throw invalid(`Tombstone filename does not match metadata ID: ${entry.name}`);
    const paths = tombstonePaths(agentsDir, metadata.id);
    const original = validateOriginalPath(storeRoot, metadata.kind, metadata.originalPath).absolute;
    const payloadExists = existsSync(paths.payload);
    const originalExists = existsSync(original);
    if (payloadExists && originalExists) throw invalid(`Tombstone ${metadata.id} has both original and payload state`);
    if (payloadExists) {
      const payloadStats = await lstat(paths.payload);
      if (payloadStats.isSymbolicLink() || (!payloadStats.isDirectory() && !payloadStats.isFile())) {
        throw invalid(`Invalid tombstone payload: ${metadata.id}`);
      }
    }
    tombstones.push({
      id: metadata.id,
      kind: metadata.kind,
      originalPath: metadata.originalPath,
      metadataPath: paths.metadata,
      payloadPath: paths.payload,
      state: payloadExists ? "renamed" : originalExists ? "pending-rename" : "cleanup-pending",
    });
  }
  return {
    tombstones,
    temporaryPaths: temporaryPaths.sort((a, b) => a.localeCompare(b)),
  };
}
