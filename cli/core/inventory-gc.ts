// ABOUTME: Plans and prunes only explicitly approved standalone inventory garbage.
// ABOUTME: Keeps current records and foreign state outside zero-reference garbage collection.

import { existsSync } from "node:fs";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { DrwnError } from "./errors";
import { currentInventoryLockPaths, withInventoryLock } from "./inventory-lock";
import { inspectInventoryTombstones, recoverInventoryTombstones, tombstoneInventoryPath } from "./inventory-tombstones";
import { sanitizeMcpServerSecrets } from "./mcp-secret-policy";
import { validateMcpLibraryServer } from "./mcp-library";
import { hashSkillPackageDirectory, loadBundleManifest, validateBundleManifest } from "./skill-packages";
import { isStrictSemver } from "./semver-utils";
import {
  assertStoreWritable,
  resolveInventoryLockPath,
  resolveStoreMcpServersDir,
  resolveStoreRoot,
  resolveStoreSkillPackagesRoot,
} from "./store-paths";
import type { RegistryServer } from "./types";

const TEMP_RETENTION_MS = 24 * 60 * 60 * 1000;
const VERSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TEMP_PATTERN = /^.+\.tmp\.[0-9a-f]{16}$/;

export type InventoryGcEntryKind = "temporary" | "tombstone" | "skill-version" | "mcp-record" | "foreign";
export type InventoryGcKeptReason =
  | "current-package-version"
  | "current-mcp-record"
  | "retention-window"
  | "foreign-path"
  | "live-operation-evidence";

export interface InventoryGcEntry {
  kind: InventoryGcEntryKind;
  path: string;
  reason: "abandoned-temporary" | "completed-tombstone" | "superseded-package-version" | InventoryGcKeptReason;
  packageName?: string;
  version?: string;
}

export interface InventoryGcPlan {
  schemaVersion: 1;
  mode: "dry-run" | "prune";
  evaluatedAt: string;
  retention: { temporaryHours: 24; inactiveVersionDays: 30 };
  eligible: InventoryGcEntry[];
  kept: InventoryGcEntry[];
  removed: string[];
  recoveredTombstones: string[];
}

interface PlanOptions {
  now?: Date;
}

function invalid(message: string, cause?: unknown) {
  return new DrwnError("INVENTORY_GC_INVALID", message, undefined, cause);
}

function relativeStorePath(agentsDir: string, path: string) {
  const root = resolveStoreRoot(agentsDir);
  const result = relative(root, path).replaceAll("\\", "/");
  if (!result || result === ".." || result.startsWith("../")) throw invalid(`Inventory GC path escapes the Store: ${path}`);
  return result;
}

function sorted(entries: InventoryGcEntry[]) {
  return entries.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

async function concreteDirectory(path: string, label: string) {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw invalid(`${label} is not a concrete directory: ${path}`);
}

async function classifyTemporary(
  agentsDir: string,
  path: string,
  nowMs: number,
  liveOperation: boolean,
  eligible: InventoryGcEntry[],
  kept: InventoryGcEntry[],
) {
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) throw invalid(`Inventory temporary is not a concrete file: ${path}`);
  const entry = { kind: "temporary" as const, path: relativeStorePath(agentsDir, path) };
  if (liveOperation) kept.push({ ...entry, reason: "live-operation-evidence" });
  else if (nowMs - stats.mtimeMs > TEMP_RETENTION_MS) eligible.push({ ...entry, reason: "abandoned-temporary" });
  else kept.push({ ...entry, reason: "retention-window" });
}

async function inspectMcpInventory(
  agentsDir: string,
  nowMs: number,
  liveOperation: boolean,
  eligible: InventoryGcEntry[],
  kept: InventoryGcEntry[],
) {
  const root = resolveStoreMcpServersDir(agentsDir);
  if (!existsSync(root)) return;
  await concreteDirectory(root, "Standalone MCP inventory root");
  for (const entry of await readdir(root, { withFileTypes: true }).then((items) => items.sort((a, b) => a.name.localeCompare(b.name)))) {
    const path = join(root, entry.name);
    if (TEMP_PATTERN.test(entry.name) && entry.name.includes(".json.tmp.")) {
      await classifyTemporary(agentsDir, path, nowMs, liveOperation, eligible, kept);
      continue;
    }
    if (entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".json")) {
      const id = entry.name.slice(0, -5);
      try {
        const server = JSON.parse(await readFile(path, "utf8")) as RegistryServer;
        validateMcpLibraryServer(id, server);
        if (JSON.stringify(sanitizeMcpServerSecrets(id, server)) !== JSON.stringify(server)) {
          throw new Error("record contains a resolved secret value");
        }
      } catch (error) {
        throw invalid(`Invalid standalone MCP record: ${path}`, error);
      }
      kept.push({ kind: "mcp-record", path: relativeStorePath(agentsDir, path), reason: "current-mcp-record" });
      continue;
    }
    kept.push({ kind: "foreign", path: relativeStorePath(agentsDir, path), reason: "foreign-path" });
  }
}

async function inspectPackageRoot(
  agentsDir: string,
  path: string,
  packageName: string,
  nowMs: number,
  liveOperation: boolean,
  eligible: InventoryGcEntry[],
  kept: InventoryGcEntry[],
) {
  const packageStats = await lstat(path);
  if (!packageStats.isDirectory() || packageStats.isSymbolicLink()) {
    kept.push({ kind: "foreign", path: relativeStorePath(agentsDir, path), reason: "foreign-path" });
    return;
  }
  const entries = await readdir(path, { withFileTypes: true }).then((items) => items.sort((a, b) => a.name.localeCompare(b.name)));
  const currentEntry = entries.find((entry) => entry.name === "current");
  let activeVersion: string | null = null;
  if (currentEntry) {
    const currentPath = join(path, "current");
    const stats = await lstat(currentPath);
    if (!stats.isFile() || stats.isSymbolicLink()) throw invalid(`Invalid current pointer: ${currentPath}`);
    activeVersion = (await readFile(currentPath, "utf8")).trim();
    if (!isStrictSemver(activeVersion)) throw invalid(`Invalid current version: ${currentPath}`);
  }

  const versions = new Set<string>();
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.name === "current") continue;
    if (TEMP_PATTERN.test(entry.name) && entry.name.startsWith("current.tmp.")) {
      await classifyTemporary(agentsDir, child, nowMs, liveOperation, eligible, kept);
      continue;
    }
    if (!isStrictSemver(entry.name)) {
      kept.push({ kind: "foreign", path: relativeStorePath(agentsDir, child), reason: "foreign-path" });
      continue;
    }
    versions.add(entry.name);
    const stats = await lstat(child);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw invalid(`Invalid immutable skill package version: ${child}`);
    try {
      const manifest = await loadBundleManifest(child);
      await validateBundleManifest(child, manifest, new Set(), packageName, entry.name);
      await hashSkillPackageDirectory(child);
    } catch (error) {
      throw invalid(`Invalid immutable skill package version: ${child}`, error);
    }
    const base = {
      kind: "skill-version" as const,
      path: relativeStorePath(agentsDir, child),
      packageName,
      version: entry.name,
    };
    if (entry.name === activeVersion) kept.push({ ...base, reason: "current-package-version" });
    else if (liveOperation) kept.push({ ...base, reason: "live-operation-evidence" });
    else if (nowMs - stats.mtimeMs > VERSION_RETENTION_MS) eligible.push({ ...base, reason: "superseded-package-version" });
    else kept.push({ ...base, reason: "retention-window" });
  }
  if (activeVersion && !versions.has(activeVersion)) throw invalid(`Current skill package version is missing: ${packageName}@${activeVersion}`);
}

async function inspectSkillInventory(
  agentsDir: string,
  nowMs: number,
  liveOperation: boolean,
  eligible: InventoryGcEntry[],
  kept: InventoryGcEntry[],
) {
  const root = resolveStoreSkillPackagesRoot(agentsDir);
  if (!existsSync(root)) return;
  await concreteDirectory(root, "Standalone skill inventory root");
  for (const entry of await readdir(root, { withFileTypes: true }).then((items) => items.sort((a, b) => a.name.localeCompare(b.name)))) {
    const path = join(root, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory() && !entry.isSymbolicLink()) {
      for (const child of await readdir(path, { withFileTypes: true }).then((items) => items.sort((a, b) => a.name.localeCompare(b.name)))) {
        await inspectPackageRoot(agentsDir, join(path, child.name), `${entry.name}/${child.name}`, nowMs, liveOperation, eligible, kept);
      }
      continue;
    }
    await inspectPackageRoot(agentsDir, path, entry.name, nowMs, liveOperation, eligible, kept);
  }
}

export async function planInventoryGc(agentsDir: string, options: PlanOptions = {}): Promise<InventoryGcPlan> {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw invalid("Inventory GC requires a valid evaluation time");
  const inventoryLock = resolve(resolveInventoryLockPath(agentsDir));
  const liveOperation = existsSync(inventoryLock) && !currentInventoryLockPaths().includes(inventoryLock);
  const eligible: InventoryGcEntry[] = [];
  const kept: InventoryGcEntry[] = [];

  const tombstones = await inspectInventoryTombstones(agentsDir);
  for (const tombstone of tombstones.tombstones) {
    const entry: InventoryGcEntry = {
      kind: "tombstone",
      path: relativeStorePath(agentsDir, tombstone.metadataPath),
      reason: liveOperation ? "live-operation-evidence" : "completed-tombstone",
    };
    (liveOperation ? kept : eligible).push(entry);
  }
  for (const path of tombstones.temporaryPaths) {
    await classifyTemporary(agentsDir, path, now.getTime(), liveOperation, eligible, kept);
  }
  await inspectMcpInventory(agentsDir, now.getTime(), liveOperation, eligible, kept);
  await inspectSkillInventory(agentsDir, now.getTime(), liveOperation, eligible, kept);

  return {
    schemaVersion: 1,
    mode: "dry-run",
    evaluatedAt: now.toISOString(),
    retention: { temporaryHours: 24, inactiveVersionDays: 30 },
    eligible: sorted(eligible),
    kept: sorted(kept),
    removed: [],
    recoveredTombstones: [],
  };
}

export async function pruneInventoryGc(agentsDir: string, options: PlanOptions = {}): Promise<InventoryGcPlan> {
  return withInventoryLock(agentsDir, async () => {
    assertStoreWritable();
    const initial = await planInventoryGc(agentsDir, options);
    const recovery = await recoverInventoryTombstones(agentsDir);
    const plan = await planInventoryGc(agentsDir, options);
    const removed: string[] = [];
    for (const entry of plan.eligible) {
      const path = join(resolveStoreRoot(agentsDir), ...entry.path.split("/"));
      if (entry.kind === "temporary") {
        const stats = await lstat(path);
        if (!stats.isFile() || stats.isSymbolicLink()) throw invalid(`Inventory temporary changed before prune: ${path}`);
        await rm(path);
      } else if (entry.kind === "skill-version") {
        await tombstoneInventoryPath({ agentsDir, kind: "skill-package", sourcePath: path });
      } else {
        throw invalid(`Unexpected GC candidate after tombstone recovery: ${entry.path}`);
      }
      removed.push(entry.path);
    }
    return {
      ...plan,
      mode: "prune",
      eligible: sorted([
        ...initial.eligible.filter((entry) => entry.kind === "tombstone"),
        ...plan.eligible,
      ]),
      removed: removed.sort((a, b) => a.localeCompare(b)),
      recoveredTombstones: recovery.recovered.sort((a, b) => a.localeCompare(b)),
    };
  });
}
