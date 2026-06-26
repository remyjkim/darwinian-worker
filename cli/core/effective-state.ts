// ABOUTME: Builds the effective drwn state shared by write and capture flows.
// ABOUTME: Keeps project card, overlay, registry, and target resolution in one place.

import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import { mergeCardManifestsIntoProjectConfig, resolveProjectCards } from "./card-project";
import { collectCardServerDefinitions, mergeCardServerDefinitionsIntoRegistry, type CardServerDefinition } from "./card-mcp";
import { loadCardLock } from "./card-lock";
import { loadConfig } from "./config";
import { hasExplicitSkillDefaults, mergeUserMcpLibrary } from "./defaults";
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
  cardServerDefinitions: CardServerDefinition[];
  lockedCards: CardLockEntry[];
  activeCards: CardLockEntry[];
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
  const projectConfigPath = normalized.forceMachineScope ? null : findProjectConfig(normalized.cwd ?? process.cwd());
  const projectRoot = projectConfigPath ? resolveProjectRootFromConfigPath(projectConfigPath) : null;
  const baseConfig = projectConfigPath ? repoConfig : machineConfig;
  let effectiveConfig = baseConfig;
  let effectiveRegistry = registry;
  const baseDefaultSkills = hasExplicitSkillDefaults(baseConfig) ? [...(baseConfig.defaults?.skills ?? [])] : [];
  let skillSelection: SkillSyncOverrides | undefined = baseDefaultSkills.length > 0
    ? { include: [...baseDefaultSkills] }
    : undefined;
  let lockedCards: CardLockEntry[] = [];
  let activeCards: CardLockEntry[] = [];
  let projectConfig: ProjectConfig | null = null;
  let projectConfigWithCards: ProjectConfig | null = null;
  let cardServerDefinitions: CardServerDefinition[] = [];

  if (projectConfigPath) {
    projectConfig = await loadProjectConfig(projectConfigPath);
    const cardLock = projectRoot ? await loadCardLock(projectRoot) : null;
    lockedCards = cardLock?.cards ?? (projectConfig.cards ? await resolveProjectCards(normalized.agentsDir, projectConfig.cards) : []);
    activeCards = selectActiveCards(lockedCards, projectConfig.activeMinds);
    projectConfigWithCards = mergeCardManifestsIntoProjectConfig(
      projectConfig,
      activeCards.map((card) => card.manifest),
    );
    cardServerDefinitions = collectCardServerDefinitions(lockedCards);
    const registryWithCards = mergeCardServerDefinitionsIntoRegistry(registry, collectCardServerDefinitions(activeCards));
    const projectOverlay: ProjectConfig = {
      ...projectConfigWithCards,
      servers: projectConfig.servers,
    };
    const merged = mergeProjectConfig(baseConfig, registryWithCards, projectOverlay);
    effectiveConfig = merged.config;
    effectiveRegistry = merged.registry;
    skillSelection = {
      include: [
        ...baseDefaultSkills,
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
    cardServerDefinitions,
    lockedCards,
    activeCards,
    skillSelection,
    recordPath: projectRoot ? resolveProjectWriteRecordPath(projectRoot) : resolveGlobalWriteRecordPath(normalized.agentsDir),
    scopeRoot,
    scopedOptions,
  };
}

function selectActiveCards(lockedCards: CardLockEntry[], activeMinds?: string[]) {
  if (activeMinds === undefined) {
    return lockedCards;
  }
  if (activeMinds.length === 0) {
    return [];
  }
  const byName = new Map(lockedCards.map((card) => [card.name, card]));
  return activeMinds.flatMap((name) => {
    const card = byName.get(name);
    return card ? [card] : [];
  });
}
