// ABOUTME: Implements explicit migration from the pre-cards ~/.agents layout to the cards-era store.
// ABOUTME: Uses staging and archive directories so failures leave recoverable state.

import { existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, rmSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveLibraryDir, resolveSkillPackagesRoot, resolveUserConfigPath } from "./paths";
import {
  resolveCardsRoot,
  resolveMachineConfigPath,
  resolveSourcesRoot,
  resolveStoreCacheDir,
  resolveStoreGeneratedDir,
  resolveStoreMcpServersDir,
  resolveStoreMetadataPath,
  resolveStoreRoot,
  resolveStoreSkillsRoot,
} from "./store-paths";
import type { StoreMetadata, UserMcpLibrary } from "./types";

export interface MigrationOptions {
  agentsDir: string;
  cleanupLegacyOrphans?: boolean;
  yes?: boolean;
}

export interface MigrationResult {
  archivedTo: string;
  stagingPath: string;
  steps: string[];
  warnings: string[];
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function detectLegacyLayout(agentsDir: string): boolean {
  const hasLegacyConfig = existsSync(resolveUserConfigPath(agentsDir));
  const hasLegacyLibrary = existsSync(resolveLibraryDir(agentsDir));
  const hasLegacyPackages = existsSync(join(agentsDir, "packages"));
  return hasLegacyConfig || hasLegacyLibrary || hasLegacyPackages;
}

async function writeJson(pathValue: string, value: unknown) {
  mkdirSync(dirname(pathValue), { recursive: true });
  await writeFile(pathValue, `${JSON.stringify(value, null, 2)}\n`);
}

async function copyIfExists(from: string, to: string) {
  if (!existsSync(from)) {
    return false;
  }
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, verbatimSymlinks: true, force: true });
  return true;
}

async function explodeMcpLibrary(agentsDir: string, stagingRoot: string, steps: string[]) {
  const legacyPath = join(resolveLibraryDir(agentsDir), "mcp-servers.json");
  const targetDir = join(stagingRoot, "mcp-servers");
  await mkdir(targetDir, { recursive: true });
  if (!existsSync(legacyPath)) {
    steps.push("no legacy MCP library found");
    return 1;
  }

  const parsed = JSON.parse(await readFile(legacyPath, "utf8")) as UserMcpLibrary;
  for (const [id, server] of Object.entries(parsed.servers ?? {})) {
    await writeJson(join(targetDir, `${id}.json`), server);
  }
  steps.push(`migrated ${Object.keys(parsed.servers ?? {}).length} MCP server definitions`);
  return parsed.version === 1 ? 1 : parsed.version;
}

async function validateStaging(stagingRoot: string) {
  const required = ["store.json", "machine.json", "cards", "sources", "skills", "mcp-servers", "generated", "cache"];
  for (const entry of required) {
    if (!existsSync(join(stagingRoot, entry))) {
      throw new Error(`Migration staging missing ${entry}`);
    }
  }
  JSON.parse(await readFile(join(stagingRoot, "store.json"), "utf8"));
  JSON.parse(await readFile(join(stagingRoot, "machine.json"), "utf8"));
  for (const entry of await readdir(join(stagingRoot, "mcp-servers"), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      JSON.parse(await readFile(join(stagingRoot, "mcp-servers", entry.name), "utf8"));
    }
  }
}

export async function migrateStore(options: MigrationOptions): Promise<MigrationResult> {
  const steps: string[] = [];
  const warnings: string[] = [];
  if (!detectLegacyLayout(options.agentsDir)) {
    return { archivedTo: "", stagingPath: "", steps: ["no legacy layout detected"], warnings };
  }

  const ts = timestamp();
  const stagingPath = join(options.agentsDir, `bgng.staging-${ts}`);
  const archivePath = join(options.agentsDir, `bgng.archive-${ts}`);
  rmSync(stagingPath, { recursive: true, force: true });
  await mkdir(stagingPath, { recursive: true });

  const legacyConfig = resolveUserConfigPath(options.agentsDir);
  if (existsSync(legacyConfig)) {
    await copyIfExists(legacyConfig, join(stagingPath, "machine.json"));
    steps.push("migrated machine config");
  } else {
    await writeJson(join(stagingPath, "machine.json"), { version: 1, optional: {} });
    steps.push("created empty machine config");
  }

  const libraryVersion = await explodeMcpLibrary(options.agentsDir, stagingPath, steps);
  const legacySkillsRoot = resolveSkillPackagesRoot(options.agentsDir);
  if (existsSync(legacySkillsRoot)) {
    await cp(legacySkillsRoot, join(stagingPath, "skills"), { recursive: true, verbatimSymlinks: true, force: true });
    steps.push("migrated skill packages");
  } else {
    await mkdir(join(stagingPath, "skills"), { recursive: true });
    steps.push("created empty skills store");
  }

  await mkdir(join(stagingPath, "cards"), { recursive: true });
  await mkdir(join(stagingPath, "sources"), { recursive: true });
  await mkdir(join(stagingPath, "cache"), { recursive: true });
  await mkdir(join(stagingPath, "generated"), { recursive: true });
  await writeJson(join(stagingPath, "store.json"), {
    schemaVersion: 1,
    initAt: new Date().toISOString(),
  } satisfies StoreMetadata);

  await validateStaging(stagingPath);

  await mkdir(archivePath, { recursive: true });
  if (existsSync(resolveStoreRoot(options.agentsDir))) {
    await rename(resolveStoreRoot(options.agentsDir), join(archivePath, "bgng"));
  }
  if (existsSync(resolveLibraryDir(options.agentsDir))) {
    await rename(resolveLibraryDir(options.agentsDir), join(archivePath, "library"));
  }
  if (existsSync(join(options.agentsDir, "packages"))) {
    await rename(join(options.agentsDir, "packages"), join(archivePath, "packages"));
  }
  renameSync(stagingPath, resolveStoreRoot(options.agentsDir));
  steps.push("activated cards-era store");

  return { archivedTo: archivePath, stagingPath, steps, warnings };
}

export interface StoreStatus {
  path: string;
  initialized: boolean;
  schemaVersion: number | null;
  cardCount: number;
  sourceCount: number;
  skillBundleCount: number;
  mcpServerCount: number;
  legacyLayoutDetected: boolean;
}

function countEntries(pathValue: string) {
  if (!existsSync(pathValue)) return 0;
  return readdir(pathValue, { withFileTypes: true }).then((entries) => entries.filter((entry) => !entry.name.startsWith(".")).length);
}

export async function getStoreStatus(agentsDir: string): Promise<StoreStatus> {
  const metadataPath = resolveStoreMetadataPath(agentsDir);
  let schemaVersion: number | null = null;
  if (existsSync(metadataPath)) {
    schemaVersion = (JSON.parse(await readFile(metadataPath, "utf8")) as StoreMetadata).schemaVersion;
  }
  return {
    path: resolveStoreRoot(agentsDir),
    initialized: existsSync(metadataPath),
    schemaVersion,
    cardCount: await countEntries(resolveCardsRoot(agentsDir)),
    sourceCount: await countEntries(resolveSourcesRoot(agentsDir)),
    skillBundleCount: await countEntries(resolveStoreSkillsRoot(agentsDir)),
    mcpServerCount: await countEntries(resolveStoreMcpServersDir(agentsDir)),
    legacyLayoutDetected: detectLegacyLayout(agentsDir),
  };
}

export async function cleanupLegacyOrphans(options?: {
  homeDir?: string;
  agentsDir?: string;
  archivePath?: string;
}): Promise<{ removed: string[]; warnings: string[] }> {
  const removed: string[] = [];
  const warnings: string[] = [];
  if (!options?.homeDir || !options.agentsDir) {
    return { removed, warnings: ["legacy orphan cleanup requires homeDir and agentsDir"] };
  }

  const candidateDirs = [
    join(options.homeDir, ".claude", "skills"),
    join(options.homeDir, ".codex", "skills"),
  ];
  const ownedPrefixes = [
    join(options.agentsDir, "packages"),
    join(options.agentsDir, "skills"),
    resolveStoreRoot(options.agentsDir),
    ...(options.archivePath ? [options.archivePath] : []),
  ];

  for (const dir of candidateDirs) {
    if (!existsSync(dir)) {
      continue;
    }
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) {
        continue;
      }
      const pathValue = join(dir, entry.name);
      let target: string;
      try {
        target = readlinkSync(pathValue);
      } catch (error) {
        warnings.push(`could not inspect ${pathValue}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const absoluteTarget = target.startsWith("/") ? target : join(dir, target);
      const isOwned = ownedPrefixes.some((prefix) => absoluteTarget === prefix || absoluteTarget.startsWith(`${prefix}/`));
      if (!isOwned) {
        try {
          const resolved = existsSync(pathValue) ? lstatSync(pathValue) : null;
          if (resolved && ownedPrefixes.some((prefix) => absoluteTarget.startsWith(prefix))) {
            // Kept for explicitness; absoluteTarget covers the safe deletion check.
          }
        } catch {
          // Broken non-owned symlinks are preserved.
        }
        continue;
      }
      rmSync(pathValue, { recursive: true, force: true });
      removed.push(pathValue);
    }
  }

  return { removed, warnings };
}
