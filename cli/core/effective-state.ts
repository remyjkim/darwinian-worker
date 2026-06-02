// ABOUTME: Builds the effective drwn state shared by write and capture flows.
// ABOUTME: Keeps project card, overlay, registry, and target resolution in one place.

import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import { mergeCardManifestsIntoProjectConfig, resolveProjectCards } from "./card-project";
import { loadConfig } from "./config";
import { mergeUserMcpLibrary } from "./defaults";
import { loadMcpLibrary } from "./mcp-library";
import { buildActiveServers } from "./mcp";
import { normalizeSyncPathOptions } from "./paths";
import { findProjectConfig, loadProjectConfig, mergeProjectConfig, resolveProjectRootFromConfigPath } from "./project";
import { loadRegistry } from "./registry";
import { resolveGlobalWriteRecordPath, resolveStoreGeneratedDir } from "./store-paths";
import type {
  CanonicalConfig,
  CanonicalRegistry,
  NormalizedSyncOptions,
  ProjectConfig,
  RegistryServer,
  SyncOptions,
} from "./types";
import { loadEffectiveConfig } from "./user-config";
import { resolveProjectWriteRecordPath } from "./write-record";
import type { SkillSyncOverrides } from "./skills";

export interface EffectiveState {
  normalized: NormalizedSyncOptions;
  repoConfig: CanonicalConfig;
  effectiveConfig: CanonicalConfig;
  effectiveRegistry: CanonicalRegistry;
  activeServers: Record<string, RegistryServer>;
  projectConfigPath: string | null;
  projectRoot: string | null;
  projectConfig: ProjectConfig | null;
  projectConfigWithCards: ProjectConfig | null;
  lockedCards: CardLockEntry[];
  skillSelection?: SkillSyncOverrides;
  recordPath: string;
  scopeRoot: string;
  scopedOptions: NormalizedSyncOptions;
}

export async function buildEffectiveState(options: SyncOptions = {}): Promise<EffectiveState> {
  const normalized = normalizeSyncPathOptions(options, options.repoRoot ? undefined : import.meta.path);
  const repoConfig = await loadConfig(normalized.repoRoot);
  const registry = mergeUserMcpLibrary(
    await loadRegistry(normalized.repoRoot),
    await loadMcpLibrary(normalized.agentsDir),
  );
  const { config: machineConfig } = await loadEffectiveConfig(repoConfig, normalized.agentsDir);
  const projectConfigPath = findProjectConfig(normalized.cwd ?? process.cwd());
  const projectRoot = projectConfigPath ? resolveProjectRootFromConfigPath(projectConfigPath) : null;
  const baseConfig = projectConfigPath ? repoConfig : machineConfig;
  let effectiveConfig = baseConfig;
  let effectiveRegistry = registry;
  let skillSelection: SkillSyncOverrides | undefined = baseConfig.defaults?.skills
    ? { include: [...baseConfig.defaults.skills] }
    : undefined;
  let lockedCards: CardLockEntry[] = [];
  let projectConfig: ProjectConfig | null = null;
  let projectConfigWithCards: ProjectConfig | null = null;

  if (projectConfigPath) {
    projectConfig = await loadProjectConfig(projectConfigPath);
    lockedCards = projectConfig.cards ? await resolveProjectCards(normalized.agentsDir, projectConfig.cards) : [];
    projectConfigWithCards = mergeCardManifestsIntoProjectConfig(
      projectConfig,
      lockedCards.map((card) => card.manifest),
    );
    const merged = mergeProjectConfig(baseConfig, registry, projectConfigWithCards);
    effectiveConfig = merged.config;
    effectiveRegistry = merged.registry;
    skillSelection = {
      include: [
        ...(baseConfig.defaults?.skills ?? []),
        ...(merged.skills?.include ?? []),
      ],
      exclude: merged.skills?.exclude,
    };
  }

  const scopeRoot = projectRoot ?? normalized.homeDir;
  const scopedOptions: NormalizedSyncOptions = {
    ...normalized,
    toolRoot: scopeRoot,
    writeScope: projectRoot ? "project" : "machine",
    generatedDir: projectRoot ? join(projectRoot, ".agents", "drwn", "generated") : resolveStoreGeneratedDir(normalized.agentsDir),
  };

  return {
    normalized,
    repoConfig,
    effectiveConfig,
    effectiveRegistry,
    activeServers: buildActiveServers(effectiveRegistry, effectiveConfig),
    projectConfigPath,
    projectRoot,
    projectConfig,
    projectConfigWithCards,
    lockedCards,
    skillSelection,
    recordPath: projectRoot ? resolveProjectWriteRecordPath(projectRoot) : resolveGlobalWriteRecordPath(normalized.agentsDir),
    scopeRoot,
    scopedOptions,
  };
}
