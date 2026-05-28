// ABOUTME: Manages user-owned global bgng config under ~/.agents/bgng.
// ABOUTME: Initializes defaults from packaged config while preserving existing compatibility state.

import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveUserBgngDir, resolveUserConfigPath } from "./paths";
import { resolveMachineConfigPath, resolveStoreMetadataPath } from "./store-paths";
import { listCuratedSkills } from "./skills";
import { resolveDefaultMcpNames } from "./defaults";
import type { CanonicalConfig, CanonicalRegistry, MachineConfig } from "./types";

export { resolveUserBgngDir, resolveUserConfigPath };

export { resolveMachineConfigPath };

function resolveActiveUserConfigPath(agentsDir: string) {
  return existsSync(resolveStoreMetadataPath(agentsDir))
    ? resolveMachineConfigPath(agentsDir)
    : resolveUserConfigPath(agentsDir);
}

export async function loadUserConfig(path: string): Promise<CanonicalConfig> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as CanonicalConfig;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported user config version: ${String(parsed.version)}`);
  }
  return parsed;
}

export async function saveUserConfig(path: string, config: CanonicalConfig) {
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

export async function initializeUserConfigFromPackagedDefaults(
  packagedConfig: CanonicalConfig,
  registry: CanonicalRegistry,
  agentsDir?: string,
): Promise<CanonicalConfig> {
  const next: CanonicalConfig = JSON.parse(JSON.stringify(packagedConfig));
  const curated = agentsDir ? await listCuratedSkills(agentsDir) : [];
  next.defaults = {
    ...(next.defaults ?? {}),
    skills: next.defaults?.skills ?? curated.map((skill) => skill.name),
    mcpServers: next.defaults?.mcpServers ?? resolveDefaultMcpNames(packagedConfig, registry),
    extensions: next.defaults?.extensions ?? {},
  };
  return next;
}

export async function loadOrInitializeUserConfig(options: {
  repoConfig: CanonicalConfig;
  registry: CanonicalRegistry;
  agentsDir: string;
}) {
  const path = resolveActiveUserConfigPath(options.agentsDir);
  if (existsSync(path)) {
    return { path, config: await loadUserConfig(path), created: false };
  }
  const config = await initializeUserConfigFromPackagedDefaults(options.repoConfig, options.registry, options.agentsDir);
  return { path, config, created: true };
}

export async function loadEffectiveConfig(repoConfig: CanonicalConfig, agentsDir: string) {
  const path = resolveActiveUserConfigPath(agentsDir);
  if (!existsSync(path)) {
    return { config: repoConfig, userConfigPath: null };
  }
  const userConfig = await loadUserConfig(path) as MachineConfig;
  const config = existsSync(resolveStoreMetadataPath(agentsDir))
    ? mergeMachineConfig(repoConfig, userConfig)
    : userConfig;
  return { config, userConfigPath: path };
}

function mergeMachineConfig(repoConfig: CanonicalConfig, machineConfig: MachineConfig): CanonicalConfig {
  const merged: CanonicalConfig = JSON.parse(JSON.stringify(repoConfig));
  merged.targets = {
    ...merged.targets,
    ...(machineConfig.targets ?? {}),
  };
  merged.optional = {
    ...(merged.optional ?? {}),
    ...(machineConfig.optional ?? {}),
  };
  merged.defaults = {
    ...(merged.defaults ?? {}),
    ...(machineConfig.defaults ?? {}),
  };
  merged.catalogs = {
    ...(merged.catalogs ?? {}),
    ...(machineConfig.catalogs ?? {}),
  };
  merged.parallel = {
    ...(merged.parallel ?? {}),
    ...(machineConfig.parallel ?? {}),
  };
  return merged;
}
