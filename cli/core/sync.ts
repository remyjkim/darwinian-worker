// ABOUTME: Orchestrates MCP and skill syncing using the extracted core modules.
// ABOUTME: Shared by the Clipanion commands and the legacy sync-mcp compatibility wrapper.

import { existsSync, renameSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expandHomePath, normalizeSyncPathOptions } from "./paths";
import { loadConfig } from "./config";
import { loadRegistry } from "./registry";
import { buildActiveServers, mergeClaudeSettingsText, mergeCodexTomlText, renderCursorConfig } from "./mcp";
import { syncSkills as syncSkillsCore } from "./skills";
import { ensureParentDir, lstatSafe, realpathSafe } from "./fs";
import { findProjectConfig, loadProjectConfig, mergeProjectConfig } from "./project";
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

export async function syncMcp(
  options: NormalizedSyncOptions,
  config: CanonicalConfig,
  servers: Record<string, RegistryServer>,
): Promise<SyncResult> {
  const result: SyncResult = { changes: [], warnings: [] };

  const selectedTargets = (Object.keys(config.targets) as TargetName[]).filter((name) => {
    if (options.target && options.target !== name) {
      return false;
    }
    return config.targets[name].enabled;
  });

  for (const targetName of selectedTargets) {
    const target = config.targets[targetName];
    const configPath = expandHomePath(target.configPath, options.homeDir);

    if (targetName === "claude") {
      const current = await readFile(configPath, "utf8");
      writeManagedFile(configPath, mergeClaudeSettingsText(current, servers), options.dryRun, result);
      continue;
    }

    if (targetName === "codex") {
      const current = await readFile(configPath, "utf8");
      writeManagedFile(configPath, mergeCodexTomlText(current, servers), options.dryRun, result);
      continue;
    }

    if (targetName === "cursor") {
      const generatedPath = join(options.agentsDir, "generated", "cursor-mcp.json");
      writeManagedFile(generatedPath, renderCursorConfig(servers), options.dryRun, result);
      ensureFileSymlink(configPath, generatedPath, options.dryRun, result);
    }
  }

  return result;
}

export async function syncRepository(options: SyncOptions = {}): Promise<SyncResult> {
  const normalized = normalizeSyncPathOptions(options, options.repoRoot ? undefined : import.meta.path);
  const config = await loadConfig(normalized.repoRoot);
  const registry = await loadRegistry(normalized.repoRoot);
  let effectiveConfig = config;
  let effectiveRegistry = registry;
  let skillOverrides: ReturnType<typeof mergeProjectConfig>["skills"];
  const result: SyncResult = { changes: [], warnings: [] };
  const projectConfigPath = findProjectConfig(normalized.cwd ?? process.cwd());

  if (projectConfigPath) {
    const projectConfig = await loadProjectConfig(projectConfigPath);
    const merged = mergeProjectConfig(config, registry, projectConfig);
    effectiveConfig = merged.config;
    effectiveRegistry = merged.registry;
    skillOverrides = merged.skills;
    result.changes.push(`project config: ${projectConfigPath}`);
  }

  const activeServers = buildActiveServers(effectiveRegistry, effectiveConfig);

  if (!normalized.skillsOnly) {
    const mcpResult = await syncMcp(normalized, effectiveConfig, activeServers);
    result.changes.push(...mcpResult.changes);
    result.warnings.push(...mcpResult.warnings);
  }

  if (!normalized.mcpOnly) {
    const skillsResult = await syncSkillsCore(normalized, skillOverrides);
    result.changes.push(...skillsResult.changes);
    result.warnings.push(...skillsResult.warnings);
  }

  return result;
}
