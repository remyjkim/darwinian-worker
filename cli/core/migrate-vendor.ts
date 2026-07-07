// ABOUTME: Migrates legacy generated-symlink materialization to vendored vendor trees.
// ABOUTME: Surgically updates write-records while preserving unrelated managed-path ownership.

import { existsSync, lstatSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildEffectiveState, recomputeContentRootsByCard } from "./effective-state";
import { syncWorkers } from "./worker-generator/sync-worker";
import { reconcileVendorTrees } from "./vendor-reconcile";
import { DRWN_VERSION } from "./version";
import { dedupeManagedPathsByPath, loadWriteRecord, saveWriteRecord, type ManagedPath } from "./write-record";
import { resolveProjectWriteRecordPath } from "./write-record";

export interface VendorMigrationReport {
  migrated: boolean;
  replacedSymlinks: number;
  vendorTreesCreated: number;
}

export interface VendorMigrationContext {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
}

export async function migrateSymlinkLayerToVendor(
  projectRoot: string,
  context: VendorMigrationContext,
): Promise<VendorMigrationReport> {
  const recordPath = resolveProjectWriteRecordPath(projectRoot);
  const record = loadWriteRecord(recordPath);
  const symlinkEntries = (record?.managedPaths ?? []).filter((entry) => entry.kind === "generated-symlink");
  if (symlinkEntries.length === 0) {
    return { migrated: false, replacedSymlinks: 0, vendorTreesCreated: 0 };
  }

  const state = await buildEffectiveState({
    repoRoot: context.repoRoot,
    agentsDir: context.agentsDir,
    homeDir: context.homeDir,
    cwd: projectRoot,
  });
  const result = { changes: [] as string[], warnings: [] as string[], managedPaths: [] as ManagedPath[] };
  await reconcileVendorTrees(state, result);
  state.contentRootsByCard = recomputeContentRootsByCard(state, { allowPlanningFallback: false });
  const vendorTreesCreated = result.changes.filter((change) => change.startsWith("vendor ")).length;

  const workersResult = await syncWorkers(state);
  result.changes.push(...workersResult.changes);
  result.managedPaths.push(...(workersResult.managedPaths ?? []));

  const preserved = (record?.managedPaths ?? []).filter((entry) => entry.kind !== "generated-symlink");
  const rewritten = (workersResult.managedPaths ?? []).filter((entry) => entry.kind !== "generated-symlink");
  const nextManagedPaths = dedupeManagedPathsByPath([...preserved, ...rewritten]);
  saveWriteRecord(recordPath, {
    writeRecordVersion: 1,
    lastWriteAt: new Date().toISOString(),
    lastWriteHarnessVersion: DRWN_VERSION,
    managedPaths: nextManagedPaths,
  });

  const remaining = (loadWriteRecord(recordPath)?.managedPaths ?? []).filter(
    (entry) => entry.kind === "generated-symlink",
  );
  if (remaining.length > 0) {
    throw new Error("vendor migration failed: generated-symlink entries remain in write-record");
  }

  for (const entry of symlinkEntries) {
    const absolutePath = join(projectRoot, entry.path);
    if (!existsSync(absolutePath)) {
      continue;
    }
    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`vendor migration failed: symlink remains at ${entry.path}`);
    }
  }

  return {
    migrated: true,
    replacedSymlinks: symlinkEntries.length,
    vendorTreesCreated,
  };
}

export function hasLegacyGeneratedSymlinks(projectRoot: string) {
  const record = loadWriteRecord(resolveProjectWriteRecordPath(projectRoot));
  return (record?.managedPaths ?? []).some((entry) => entry.kind === "generated-symlink");
}

export async function committedSurfacesEnabled(projectRoot: string) {
  const configPath = join(projectRoot, ".agents", "drwn", "config.json");
  if (!existsSync(configPath)) {
    return false;
  }
  const config = JSON.parse(await readFile(configPath, "utf8")) as { committedSurfaces?: boolean };
  return config.committedSurfaces === true;
}
