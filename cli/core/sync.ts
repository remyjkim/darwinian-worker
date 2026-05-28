// ABOUTME: Orchestrates MCP and skill syncing using the extracted core modules.
// ABOUTME: Shared by the Clipanion commands and the legacy sync-mcp compatibility wrapper.

import { existsSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expandHomePath, normalizeSyncPathOptions, resolveToolPaths } from "./paths";
import { loadConfig } from "./config";
import { loadRegistry } from "./registry";
import { buildActiveServers, mergeClaudeSettingsText, mergeCodexTomlText, renderCursorConfig } from "./mcp";
import { syncSkills as syncSkillsCore } from "./skills";
import type { CardLockEntry } from "./card-lock";
import { mergeCardManifestsIntoProjectConfig, resolveProjectCards } from "./card-project";
import { loadEffectiveConfig } from "./user-config";
import { loadMcpLibrary } from "./mcp-library";
import { mergeUserMcpLibrary } from "./defaults";
import { ensureParentDir, lstatSafe, realpathSafe } from "./fs";
import { findProjectConfig, loadProjectConfig, mergeProjectConfig, resolveProjectRootFromConfigPath } from "./project";
import { diffWriteRecord, loadWriteRecord, resolveProjectWriteRecordPath, saveWriteRecord, type ManagedPath } from "./write-record";
import { resolveGlobalWriteRecordPath, resolveStoreGeneratedDir } from "./store-paths";
import type {
  CanonicalConfig,
  NormalizedSyncOptions,
  RegistryServer,
  SyncOptions,
  SyncResult,
  TargetName,
} from "./types";

function nextBackupPath(pathValue: string) {
  let candidate = `${pathValue}.bak`;
  let index = 1;
  while (existsSync(candidate)) {
    candidate = `${pathValue}.bak.${index}`;
    index += 1;
  }
  return candidate;
}

function backupExistingPath(pathValue: string, dryRun: boolean, result: SyncResult) {
  const backupPath = nextBackupPath(pathValue);
  result.changes.push(`backup ${pathValue} -> ${backupPath}`);
  if (!dryRun) {
    renameSync(pathValue, backupPath);
  }
}

function writeManagedFile(pathValue: string, nextContent: string, dryRun: boolean, result: SyncResult) {
  const exists = existsSync(pathValue);
  const currentContent = exists ? readFileSync(pathValue, "utf8") : undefined;

  if (currentContent === nextContent) {
    return;
  }

  ensureParentDir(pathValue, dryRun);
  if (exists) {
    backupExistingPath(pathValue, dryRun, result);
  }
  result.changes.push(`write ${pathValue}`);
  if (!dryRun) {
    writeFileSync(pathValue, nextContent);
  }
}

async function readTextIfExists(pathValue: string, fallback: string) {
  try {
    return await readFile(pathValue, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function ensureFileSymlink(linkPath: string, targetPath: string, dryRun: boolean, result: SyncResult) {
  const exists = existsSync(linkPath) || lstatSafe(linkPath) !== null;
  if (exists) {
    const stats = lstatSafe(linkPath);
    if (stats?.isSymbolicLink()) {
      const resolved = realpathSafe(linkPath);
      if (resolved === realpathSafe(targetPath)) {
        return;
      }
    }
    backupExistingPath(linkPath, dryRun, result);
  }

  ensureParentDir(linkPath, dryRun);
  result.changes.push(`symlink ${linkPath} -> ${targetPath}`);
  if (!dryRun) {
    symlinkSync(targetPath, linkPath, "file");
  }
}

function uniqueManagedPaths(paths: ManagedPath[]) {
  const map = new Map<string, ManagedPath>();
  for (const path of paths) {
    map.set(path.path, path);
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function managedPathToAbsolute(scopeRoot: string, pathValue: string) {
  return join(scopeRoot, pathValue);
}

function cleanupRemovedManagedPaths(scopeRoot: string, previous: ManagedPath[], dryRun: boolean, result: SyncResult) {
  for (const entry of previous) {
    const absolutePath = managedPathToAbsolute(scopeRoot, entry.path);
    if (!existsSync(absolutePath) && lstatSafe(absolutePath) === null) {
      continue;
    }
    if (entry.kind === "symlink" || entry.kind === "generated-symlink") {
      const stats = lstatSafe(absolutePath);
      const expectedTarget = entry.kind === "symlink" ? entry.target : entry.generatedPath;
      const linkTarget = stats?.isSymbolicLink() ? readlinkSync(absolutePath) : null;
      if (
        stats?.isSymbolicLink() &&
        (realpathSafe(absolutePath) === realpathSafe(expectedTarget) || linkTarget === expectedTarget)
      ) {
        result.changes.push(`remove ${absolutePath}`);
        if (!dryRun) {
          rmSync(absolutePath, { recursive: true, force: true });
        }
        continue;
      }
    }
    result.warnings.push(`preserved user-owned path: ${absolutePath}`);
  }
}

export async function syncMcp(
  options: NormalizedSyncOptions,
  config: CanonicalConfig,
  servers: Record<string, RegistryServer>,
): Promise<SyncResult> {
  const managedPaths: ManagedPath[] = [];
  const result: SyncResult = { changes: [], warnings: [], managedPaths };
  const toolRoot = options.toolRoot ?? options.homeDir;
  const toolPaths = resolveToolPaths(toolRoot);
  const generatedDir = options.generatedDir ?? join(options.agentsDir, "generated");

  const targetConfigPath = (targetName: TargetName, configuredPath: string) => {
    if (options.writeScope === "project") {
      if (targetName === "claude") return toolPaths.claudeSettings;
      if (targetName === "codex") return toolPaths.codexConfig;
      return toolPaths.cursorMcp;
    }
    return expandHomePath(configuredPath, options.homeDir);
  };

  const selectedTargets = (Object.keys(config.targets) as TargetName[]).filter((name) => {
    if (options.target && options.target !== name) {
      return false;
    }
    return config.targets[name].enabled;
  });

  for (const targetName of selectedTargets) {
    const target = config.targets[targetName];
    const configPath = targetConfigPath(targetName, target.configPath);

    if (targetName === "claude") {
      const current = await readTextIfExists(configPath, "{}\n");
      writeManagedFile(configPath, mergeClaudeSettingsText(current, servers, { force: options.force ?? false }), options.dryRun, result);
      managedPaths.push({ path: ".claude/settings.json", kind: "managed-fields", fields: ["mcpServers"], fieldHashes: {} });
      continue;
    }

    if (targetName === "codex") {
      const current = await readTextIfExists(configPath, "");
      writeManagedFile(configPath, mergeCodexTomlText(current, servers), options.dryRun, result);
      managedPaths.push({ path: ".codex/config.toml", kind: "managed-fields", fields: ["mcp_servers"], fieldHashes: {} });
      continue;
    }

    if (targetName === "cursor") {
      const generatedPath = join(generatedDir, "cursor-mcp.json");
      writeManagedFile(generatedPath, renderCursorConfig(servers), options.dryRun, result);
      ensureFileSymlink(configPath, generatedPath, options.dryRun, result);
      managedPaths.push({ path: ".cursor/mcp.json", kind: "generated-symlink", generatedPath });
    }
  }

  return result;
}

export async function syncRepository(options: SyncOptions = {}): Promise<SyncResult> {
  const normalized = normalizeSyncPathOptions(options, options.repoRoot ? undefined : import.meta.path);
  const repoConfig = await loadConfig(normalized.repoRoot);
  const registry = mergeUserMcpLibrary(
    await loadRegistry(normalized.repoRoot),
    await loadMcpLibrary(normalized.agentsDir),
  );
  const { config } = await loadEffectiveConfig(repoConfig, normalized.agentsDir);
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  const projectConfigPath = findProjectConfig(normalized.cwd ?? process.cwd());
  const projectRoot = projectConfigPath ? resolveProjectRootFromConfigPath(projectConfigPath) : null;
  const baseConfig = projectConfigPath ? repoConfig : config;
  let effectiveConfig = baseConfig;
  let effectiveRegistry = registry;
  let skillOverrides: ReturnType<typeof mergeProjectConfig>["skills"] = baseConfig.defaults?.skills
    ? { include: [...baseConfig.defaults.skills] }
    : undefined;
  const recordPath = projectRoot
    ? resolveProjectWriteRecordPath(projectRoot)
    : resolveGlobalWriteRecordPath(normalized.agentsDir);
  const scopeRoot = projectRoot ?? normalized.homeDir;
  const scopedOptions: NormalizedSyncOptions = {
    ...normalized,
    toolRoot: scopeRoot,
    writeScope: projectRoot ? "project" : "machine",
    generatedDir: projectRoot ? join(projectRoot, ".agents", "bgng", "generated") : resolveStoreGeneratedDir(normalized.agentsDir),
  };
  const previousRecord = loadWriteRecord(recordPath);
  let lockedCards: CardLockEntry[] = [];

  if (projectConfigPath) {
    const projectConfig = await loadProjectConfig(projectConfigPath);
    lockedCards = projectConfig.cards ? await resolveProjectCards(normalized.agentsDir, projectConfig.cards) : [];
    const projectWithCards = mergeCardManifestsIntoProjectConfig(
      projectConfig,
      lockedCards.map((card) => card.manifest),
    );
    const merged = mergeProjectConfig(baseConfig, registry, projectWithCards);
    effectiveConfig = merged.config;
    effectiveRegistry = merged.registry;
    skillOverrides = {
      include: [
        ...(baseConfig.defaults?.skills ?? []),
        ...(merged.skills?.include ?? []),
      ],
      exclude: merged.skills?.exclude,
    };
  }

  const activeServers = buildActiveServers(effectiveRegistry, effectiveConfig);

  if (!normalized.skillsOnly) {
    const mcpResult = await syncMcp(scopedOptions, effectiveConfig, activeServers);
    result.changes.push(...mcpResult.changes);
    result.warnings.push(...mcpResult.warnings);
    result.managedPaths?.push(...(mcpResult.managedPaths ?? []));
  }

  if (!normalized.mcpOnly) {
    const skillsResult = await syncSkillsCore(scopedOptions, skillOverrides, lockedCards);
    result.changes.push(...skillsResult.changes);
    result.warnings.push(...skillsResult.warnings);
    result.managedPaths?.push(...(skillsResult.managedPaths ?? []));
  }

  const desiredManagedPaths = uniqueManagedPaths(result.managedPaths ?? []);
  const { toRemove } = diffWriteRecord(previousRecord, desiredManagedPaths);
  cleanupRemovedManagedPaths(scopeRoot, toRemove, normalized.dryRun, result);
  result.managedPaths = desiredManagedPaths;
  if (!normalized.dryRun) {
    saveWriteRecord(recordPath, {
      writeRecordVersion: 1,
      lastWriteAt: new Date().toISOString(),
      lastWriteHarnessVersion: "0.1.0",
      managedPaths: desiredManagedPaths,
    });
  }

  return result;
}
