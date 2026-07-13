// ABOUTME: Builds deterministic typed snapshots and comparisons for portable machine inventory.
// ABOUTME: Reads only Task 81 standalone records and publishes manifests outside managed state.

import { createReadStream, existsSync } from "node:fs";
import { link, lstat, mkdir, open, readFile, readdir, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { DrwnError } from "./errors";
import { syncDirectory } from "./fs";
import {
  initializeInventoryStorage,
  listStandaloneMcpRecords,
  listStandaloneSkillPackages,
} from "./inventory";
import { withInventoryLock } from "./inventory-lock";
import {
  buildPortableInventoryManifest,
  canonicalJsonBytes,
  comparePortableStrings,
  sha256Integrity,
  type InventoryDisposition,
  type InventoryTransferReasonCode,
  type PortableInventoryEntry,
  type PortableInventoryEntryInput,
  type PortableInventoryManifestV1,
} from "./inventory-portable";
import { loadRegistry } from "./registry";
import { listRepoSkills } from "./skills";
import { installSkillBundleRoot, type SkillPackageCommitCheckpoint } from "./skill-packages";
import { createMcpLibraryRecord, type McpRecordCommitCheckpoint } from "./mcp-library";
import { assertStoreWritable, resolveStoreRoot } from "./store-paths";

export type PortableInventorySnapshotPayload =
  | {
      kind: "skill-package";
      id: string;
      payloadPath: string;
      sourcePath: string;
    }
  | {
      kind: "mcp";
      id: string;
      payloadPath: string;
      sourcePath: string;
      bytes: Uint8Array;
    };

export interface PortableInventorySnapshot {
  manifest: PortableInventoryManifestV1;
  payloads: PortableInventorySnapshotPayload[];
}

export interface InventoryComparisonReport {
  source: {
    kind: "manifest" | "bundle";
    schema: "drwn.portable-inventory";
    schemaVersion: 1;
    manifestSha256: `sha256-${string}`;
  };
  entries: Array<{
    kind: "skill-package" | "mcp";
    id: string;
    disposition: Exclude<InventoryDisposition, "extra">;
    reasonCode: InventoryTransferReasonCode;
  }>;
  extras: Array<{
    kind: "skill-package" | "mcp";
    id: string;
    disposition: "extra";
  }>;
  summary: { missing: number; identical: number; conflicting: number; extra: number };
  exact: boolean;
}

interface TreeMetrics {
  fileCount: number;
  directoryCount: number;
  sizeBytes: number;
}

function invalidArtifact(message: string, cause?: unknown) {
  return new DrwnError("INVENTORY_TRANSFER_ARTIFACT_INVALID", message, undefined, cause);
}

async function measureConcreteTree(root: string): Promise<TreeMetrics> {
  const rootStats = await lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw invalidArtifact(`Portable skill package root is not a concrete directory: ${root}`);
  }
  const metrics: TreeMetrics = { fileCount: 0, directoryCount: 0, sizeBytes: 0 };
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true }).then((entries) => entries.sort((a, b) => comparePortableStrings(a.name, b.name)))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw invalidArtifact(`Portable skill package contains a symbolic link: ${relative(root, path)}`);
      if (entry.isDirectory()) {
        metrics.directoryCount += 1;
        await walk(path);
      } else if (entry.isFile()) {
        const stats = await lstat(path);
        if (!stats.isFile() || stats.isSymbolicLink()) throw invalidArtifact(`Portable skill package file changed during inspection: ${relative(root, path)}`);
        metrics.fileCount += 1;
        metrics.sizeBytes += stats.size;
        if (!Number.isSafeInteger(metrics.sizeBytes)) throw invalidArtifact("Portable skill package size exceeds safe integer range");
      } else {
        throw invalidArtifact(`Portable skill package contains an unsupported entry: ${relative(root, path)}`);
      }
    }
  }
  await walk(root);
  return metrics;
}

async function readSnapshotUnlocked(agentsDir: string): Promise<PortableInventorySnapshot> {
  const [packages, mcpRecords] = await Promise.all([
    listStandaloneSkillPackages(agentsDir),
    listStandaloneMcpRecords(agentsDir),
  ]);
  const inputs: PortableInventoryEntryInput[] = [];
  const sourceByIdentity = new Map<string, { path: string; bytes?: Uint8Array }>();

  for (const record of packages.sort((left, right) => comparePortableStrings(left.packageName, right.packageName))) {
    const metrics = await measureConcreteTree(record.versionRoot);
    inputs.push({
      kind: "skill-package",
      packageName: record.packageName,
      activeVersion: record.activeVersion,
      exportedSkillIds: record.exportedSkillIds,
      ...metrics,
      integrity: record.integrity,
    });
    sourceByIdentity.set(`skill-package:${record.packageName}`, { path: record.versionRoot });
  }
  for (const record of mcpRecords.sort((left, right) => comparePortableStrings(left.id, right.id))) {
    inputs.push({ kind: "mcp", id: record.id, definition: record.server });
    sourceByIdentity.set(`mcp:${record.id}`, { path: record.path });
  }

  const manifest = buildPortableInventoryManifest(inputs);
  const payloads = manifest.entries.map((entry): PortableInventorySnapshotPayload => {
    const id = entry.kind === "skill-package" ? entry.packageName : entry.id;
    const source = sourceByIdentity.get(`${entry.kind}:${id}`);
    if (!source) throw invalidArtifact(`Portable inventory source disappeared during snapshot: ${entry.kind} ${id}`);
    if (entry.kind === "mcp") {
      return {
        kind: entry.kind,
        id,
        payloadPath: entry.payloadPath,
        sourcePath: source.path,
        bytes: canonicalJsonBytes(entry.definition),
      };
    }
    return { kind: entry.kind, id, payloadPath: entry.payloadPath, sourcePath: source.path };
  });
  return { manifest, payloads };
}

export async function snapshotPortableInventory(options: {
  agentsDir: string;
  lock?: boolean;
}): Promise<PortableInventorySnapshot> {
  const storeRoot = resolveStoreRoot(options.agentsDir);
  if (!existsSync(storeRoot)) return { manifest: buildPortableInventoryManifest([]), payloads: [] };
  if (options.lock === false) return readSnapshotUnlocked(options.agentsDir);
  return withInventoryLock(options.agentsDir, () => readSnapshotUnlocked(options.agentsDir));
}

async function resolvedThroughExistingAncestor(pathValue: string): Promise<string> {
  const missing: string[] = [];
  let cursor = resolve(pathValue);
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    missing.unshift(cursor.slice(parent.length + (parent.endsWith("/") ? 0 : 1)));
    cursor = parent;
  }
  const canonical = existsSync(cursor) ? await realpath(cursor) : cursor;
  return resolve(canonical, ...missing);
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export async function assertPortableOutputPath(agentsDir: string, outputPath: string): Promise<void> {
  const [storeRoot, target] = await Promise.all([
    resolvedThroughExistingAncestor(resolveStoreRoot(agentsDir)),
    resolvedThroughExistingAncestor(outputPath),
  ]);
  if (isWithin(storeRoot, target)) {
    throw invalidArtifact("Portable inventory output must be outside the managed Store");
  }
}

export async function publishPortableOutput(outputPath: string, bytes: Uint8Array): Promise<"written" | "unchanged"> {
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  if (existsSync(target)) {
    const stats = await lstat(target);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new DrwnError("INVENTORY_TRANSFER_OUTPUT_EXISTS", `Portable inventory output already exists: ${target}`);
    }
    if (Buffer.from(await readFile(target)).equals(Buffer.from(bytes))) return "unchanged";
    throw new DrwnError("INVENTORY_TRANSFER_OUTPUT_EXISTS", `Portable inventory output already exists with different bytes: ${target}`);
  }

  const temporary = join(dirname(target), `.${randomBytes(12).toString("hex")}.inventory-transfer.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, target);
      await syncDirectory(dirname(target));
      return "written";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readFile(target);
      if (Buffer.from(existing).equals(Buffer.from(bytes))) return "unchanged";
      throw new DrwnError("INVENTORY_TRANSFER_OUTPUT_EXISTS", `Portable inventory output already exists with different bytes: ${target}`);
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function exportPortableInventoryManifest(options: {
  agentsDir: string;
  outputPath: string;
}) {
  await assertPortableOutputPath(options.agentsDir, options.outputPath);
  const snapshot = await snapshotPortableInventory({ agentsDir: options.agentsDir });
  const bytes = canonicalJsonBytes(snapshot.manifest);
  const action = await publishPortableOutput(options.outputPath, bytes);
  return {
    action,
    outputPath: resolve(options.outputPath),
    manifest: snapshot.manifest,
    manifestSha256: sha256Integrity(bytes),
    sizeBytes: bytes.byteLength,
  };
}

function entryIdentity(entry: PortableInventoryEntry): string {
  return entry.kind === "skill-package" ? entry.packageName : entry.id;
}

function comparableEntry(entry: PortableInventoryEntry): unknown {
  if (entry.kind === "skill-package") {
    const { payloadPath: _payloadPath, ...rest } = entry;
    return rest;
  }
  const { payloadPath: _payloadPath, ...rest } = entry;
  return rest;
}

function entriesIdentical(left: PortableInventoryEntry, right: PortableInventoryEntry): boolean {
  return left.kind === right.kind
    && Buffer.from(canonicalJsonBytes(comparableEntry(left))).equals(Buffer.from(canonicalJsonBytes(comparableEntry(right))));
}

export async function comparePortableInventory(options: {
  source: PortableInventoryManifestV1;
  sourceKind: "manifest" | "bundle";
  repoRoot: string;
  target?: PortableInventoryManifestV1;
  agentsDir?: string;
}): Promise<InventoryComparisonReport> {
  if (!options.target && !options.agentsDir) throw new Error("Portable comparison requires target manifest or agentsDir");
  const target = options.target ?? (await snapshotPortableInventory({ agentsDir: options.agentsDir! })).manifest;
  const [repoSkills, registry] = await Promise.all([listRepoSkills(options.repoRoot), loadRegistry(options.repoRoot)]);
  const repoSkillIds = new Set(repoSkills.map((skill) => skill.name));
  const registryMcpIds = new Set(Object.keys(registry.servers));
  const targetByIdentity = new Map(target.entries.map((entry) => [`${entry.kind}:${entryIdentity(entry)}`, entry]));
  const targetSkillOwners = new Map<string, string>();
  for (const entry of target.entries) {
    if (entry.kind === "skill-package") {
      for (const skillId of entry.exportedSkillIds) targetSkillOwners.set(skillId, entry.packageName);
    }
  }

  const entries: InventoryComparisonReport["entries"] = options.source.entries.map((sourceEntry) => {
    const id = entryIdentity(sourceEntry);
    const targetEntry = targetByIdentity.get(`${sourceEntry.kind}:${id}`);
    let disposition: Exclude<InventoryDisposition, "extra"> = "missing";
    let reasonCode: InventoryTransferReasonCode = "MISSING";
    if (sourceEntry.kind === "skill-package") {
      if (sourceEntry.exportedSkillIds.some((skillId) => repoSkillIds.has(skillId))) {
        disposition = "conflicting";
        reasonCode = "REPOSITORY_SKILL_CONFLICT";
      } else if (targetEntry) {
        disposition = entriesIdentical(sourceEntry, targetEntry) ? "identical" : "conflicting";
        reasonCode = disposition === "identical" ? "IDENTICAL" : "PACKAGE_METADATA_CONFLICT";
      } else if (sourceEntry.exportedSkillIds.some((skillId) => targetSkillOwners.has(skillId))) {
        disposition = "conflicting";
        reasonCode = "SKILL_ID_OWNERSHIP_CONFLICT";
      }
    } else if (registryMcpIds.has(sourceEntry.id)) {
      disposition = "conflicting";
      reasonCode = "BUNDLED_MCP_CONFLICT";
    } else if (targetEntry) {
      disposition = entriesIdentical(sourceEntry, targetEntry) ? "identical" : "conflicting";
      reasonCode = disposition === "identical" ? "IDENTICAL" : "MCP_DEFINITION_CONFLICT";
    }
    return { kind: sourceEntry.kind, id, disposition, reasonCode };
  });

  const sourceIdentities = new Set(options.source.entries.map((entry) => `${entry.kind}:${entryIdentity(entry)}`));
  const extras = target.entries
    .filter((entry) => !sourceIdentities.has(`${entry.kind}:${entryIdentity(entry)}`))
    .map((entry) => ({ kind: entry.kind, id: entryIdentity(entry), disposition: "extra" as const }));
  const summary = {
    missing: entries.filter((entry) => entry.disposition === "missing").length,
    identical: entries.filter((entry) => entry.disposition === "identical").length,
    conflicting: entries.filter((entry) => entry.disposition === "conflicting").length,
    extra: extras.length,
  };
  return {
    source: {
      kind: options.sourceKind,
      schema: options.source.schema,
      schemaVersion: options.source.schemaVersion,
      manifestSha256: sha256Integrity(canonicalJsonBytes(options.source)),
    },
    entries,
    extras,
    summary,
    exact: summary.missing === 0 && summary.conflicting === 0 && summary.extra === 0,
  };
}

export interface PortableSyncCheckpointEvent {
  phase: "before-lock" | "before-first-commit" | "before-entry" | "after-entry" | "package-commit" | "mcp-commit";
  kind?: "skill-package" | "mcp";
  id?: string;
  checkpoint?: SkillPackageCommitCheckpoint | McpRecordCommitCheckpoint;
}

export interface PortableSyncResult {
  dryRun: boolean;
  source: InventoryComparisonReport["source"];
  actions: Array<{
    kind: "skill-package" | "mcp";
    id: string;
    action: "would-install" | "installed" | "no-op";
  }>;
  extras: InventoryComparisonReport["extras"];
  summary: { installed: number; wouldInstall: number; identical: number; extra: number };
}

async function sha256FileIntegrity(path: string): Promise<`sha256-${string}`> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return `sha256-${hash.digest("hex")}`;
}

function reportFingerprint(report: InventoryComparisonReport): string {
  return Buffer.from(canonicalJsonBytes({ entries: report.entries, extras: report.extras, summary: report.summary })).toString("base64");
}

function assertConflictFree(report: InventoryComparisonReport): void {
  if (report.summary.conflicting === 0) return;
  const conflicts = report.entries.filter((entry) => entry.disposition === "conflicting");
  throw new DrwnError(
    "INVENTORY_TRANSFER_CONFLICT",
    `Portable inventory sync has ${conflicts.length} blocking conflict${conflicts.length === 1 ? "" : "s"}`,
    undefined,
    { conflicts },
  );
}

function renderSyncResult(
  report: InventoryComparisonReport,
  dryRun: boolean,
): PortableSyncResult {
  const actions = report.entries.map((entry) => ({
    kind: entry.kind,
    id: entry.id,
    action: entry.disposition === "identical"
      ? "no-op" as const
      : dryRun
        ? "would-install" as const
        : "installed" as const,
  }));
  return {
    dryRun,
    source: report.source,
    actions,
    extras: report.extras,
    summary: {
      installed: actions.filter((entry) => entry.action === "installed").length,
      wouldInstall: actions.filter((entry) => entry.action === "would-install").length,
      identical: actions.filter((entry) => entry.action === "no-op").length,
      extra: report.extras.length,
    },
  };
}

async function existingSkillOwnership(repoRoot: string, agentsDir: string) {
  const [repository, packages] = await Promise.all([
    listRepoSkills(repoRoot),
    listStandaloneSkillPackages(agentsDir),
  ]);
  const records = [
    ...repository.map((skill) => ({ name: skill.name, sourceType: "repo" as const })),
    ...packages.flatMap((record) => record.exportedSkillIds.map((name) => ({
      name,
      sourceType: "npm" as const,
      sourceId: record.packageName,
    }))),
  ];
  return { names: new Set(records.map((record) => record.name)), records };
}

export async function syncPortableInventory(options: {
  agentsDir: string;
  repoRoot: string;
  sourcePath: string;
  dryRun?: boolean;
  checkpoint?: (event: PortableSyncCheckpointEvent) => void | Promise<void>;
}): Promise<PortableSyncResult> {
  const { readPortableInventoryArtifact } = await import("./inventory-bundle");
  const artifact = await readPortableInventoryArtifact(options.sourcePath);
  try {
    if (artifact.kind !== "bundle") {
      throw new DrwnError(
        "INVENTORY_TRANSFER_BUNDLE_REQUIRED",
        "Portable inventory sync requires a byte-carrying gzip bundle",
      );
    }
    const target = await snapshotPortableInventory({ agentsDir: options.agentsDir, lock: false });
    const preflight = await comparePortableInventory({
      source: artifact.manifest,
      sourceKind: "bundle",
      target: target.manifest,
      repoRoot: options.repoRoot,
    });
    assertConflictFree(preflight);
    if (options.dryRun) return renderSyncResult(preflight, true);

    assertStoreWritable();
    const acceptedFingerprint = reportFingerprint(preflight);
    const acceptedSourceIntegrity = artifact.archiveSha256;
    await options.checkpoint?.({ phase: "before-lock" });
    let sourceIntegrity: `sha256-${string}`;
    try {
      sourceIntegrity = await sha256FileIntegrity(artifact.sourcePath);
    } catch (error) {
      throw new DrwnError("INVENTORY_TRANSFER_SOURCE_CHANGED", "Portable inventory source disappeared before commit", undefined, error);
    }
    if (sourceIntegrity !== acceptedSourceIntegrity) {
      throw new DrwnError("INVENTORY_TRANSFER_SOURCE_CHANGED", "Portable inventory source changed before commit");
    }

    return await withInventoryLock(options.agentsDir, async () => {
      let lockedSourceIntegrity: `sha256-${string}`;
      try {
        lockedSourceIntegrity = await sha256FileIntegrity(artifact.sourcePath);
      } catch (error) {
        throw new DrwnError("INVENTORY_TRANSFER_SOURCE_CHANGED", "Portable inventory source disappeared during commit", undefined, error);
      }
      if (lockedSourceIntegrity !== acceptedSourceIntegrity) {
        throw new DrwnError("INVENTORY_TRANSFER_SOURCE_CHANGED", "Portable inventory source changed during commit");
      }
      const lockedTarget = await snapshotPortableInventory({ agentsDir: options.agentsDir, lock: false });
      const lockedReport = await comparePortableInventory({
        source: artifact.manifest,
        sourceKind: "bundle",
        target: lockedTarget.manifest,
        repoRoot: options.repoRoot,
      });
      assertConflictFree(lockedReport);
      if (reportFingerprint(lockedReport) !== acceptedFingerprint) {
        throw new DrwnError("INVENTORY_TRANSFER_SOURCE_CHANGED", "Target inventory changed after portable sync preflight");
      }

      await initializeInventoryStorage(options.agentsDir);
      const missing = lockedReport.entries.filter((entry) => entry.disposition === "missing");
      if (missing.length > 0) await options.checkpoint?.({ phase: "before-first-commit" });
      const missingKeys = new Set(missing.map((entry) => `${entry.kind}:${entry.id}`));
      const registry = await loadRegistry(options.repoRoot);

      for (const entry of artifact.manifest.entries) {
        const id = entry.kind === "skill-package" ? entry.packageName : entry.id;
        if (!missingKeys.has(`${entry.kind}:${id}`)) continue;
        await options.checkpoint?.({ phase: "before-entry", kind: entry.kind, id });
        const payload = join(artifact.rootDir, "drwn-inventory", ...entry.payloadPath.split("/"));
        if (entry.kind === "skill-package") {
          const ownership = await existingSkillOwnership(options.repoRoot, options.agentsDir);
          await installSkillBundleRoot({
            agentsDir: options.agentsDir,
            bundleRoot: payload,
            packageName: entry.packageName,
            version: entry.activeVersion,
            existingSkillNames: ownership.names,
            existingSkills: ownership.records,
            checkpoint: (checkpoint) => options.checkpoint?.({
              phase: "package-commit",
              kind: entry.kind,
              id,
              checkpoint,
            }),
          });
        } else {
          await createMcpLibraryRecord(options.agentsDir, entry.id, entry.definition, {
            reservedIds: Object.keys(registry.servers),
            checkpoint: (checkpoint) => options.checkpoint?.({
              phase: "mcp-commit",
              kind: entry.kind,
              id,
              checkpoint,
            }),
          });
        }
        await options.checkpoint?.({ phase: "after-entry", kind: entry.kind, id });
      }
      return renderSyncResult(lockedReport, false);
    });
  } finally {
    await artifact.cleanup();
  }
}
