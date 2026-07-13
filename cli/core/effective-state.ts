// ABOUTME: Builds the effective drwn state shared by write and capture flows.
// ABOUTME: Keeps project card, overlay, registry, and target resolution in one place.

import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import { mergeCardManifestsIntoProjectConfig, resolveProjectCards } from "./card-project";
import { parseCardRef } from "./card-store";
import { collectCardServerDefinitions, mergeCardServerDefinitionsIntoRegistry, type CardServerDefinition } from "./card-mcp";
import { loadCardLock, backfillLockTreeShas } from "./card-lock";
import { loadConfigLocal, loadCardLockLocal, mergeProjectWithLocal } from "./config-local";
import { resolveCardContentRoot } from "./card-content-root";
import { resolveMode } from "./mode-resolution";
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

import type { ResolvedCardMode } from "./mode-resolution";

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
  skillApplyOrderCards: CardLockEntry[];
  overlayCards: CardLockEntry[];
  cardModes: Record<string, ResolvedCardMode>;
  cardLanes: Record<string, "committed" | "localOverlay">;
  contentRootsByCard: Record<string, string>;
  vendorEligible: Set<string>;
  overlayWarnings: string[];
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
  let skillApplyOrderCards: CardLockEntry[] = [];
  let projectConfig: ProjectConfig | null = null;
  let projectConfigWithCards: ProjectConfig | null = null;
  let cardServerDefinitions: CardServerDefinition[] = [];
  let overlayCards: CardLockEntry[] = [];
  const cardModes: Record<string, ResolvedCardMode> = {};
  const cardLanes: Record<string, "committed" | "localOverlay"> = {};
  const contentRootsByCard: Record<string, string> = {};
  const vendorEligible = new Set<string>();
  const overlayWarnings: string[] = [];
  const cardsSourcePath = process.env.CARDS_SOURCE_PATH ?? null;

  if (projectConfigPath) {
    projectConfig = await loadProjectConfig(projectConfigPath);
    const configLocal = projectRoot ? await loadConfigLocal(projectRoot) : null;
    if (configLocal?.activeWorker !== undefined && configLocal.activeWorker !== projectConfig.activeWorker) {
      overlayWarnings.push("config.local.json activeWorker overrides committed activeWorker");
    }
    projectConfig = mergeProjectWithLocal(projectConfig, configLocal);
    const cardLock = projectRoot ? await loadCardLock(projectRoot) : null;
    const committedCards =
      cardLock?.cards && cardLock.cards.length > 0
        ? cardLock.cards
        : projectConfig.workers.length > 0
          ? await resolveProjectCards(normalized.agentsDir, projectConfig.workers)
          : [];
    const localLockCards = projectRoot ? (await loadCardLockLocal(projectRoot))?.cards ?? [] : [];
    const byName = new Map<string, CardLockEntry>();
    for (const card of committedCards) {
      byName.set(card.name, card);
      cardLanes[card.name] = "committed";
    }
    for (const card of localLockCards) {
      if (byName.has(card.name)) {
        overlayWarnings.push(`card.lock.local overrides committed lock entry for ${card.name}`);
      }
      byName.set(card.name, card);
      cardLanes[card.name] = "localOverlay";
    }
    lockedCards = [...byName.values()];
    lockedCards = await backfillLockTreeShas(normalized.agentsDir, lockedCards);
    for (const card of lockedCards) {
      let resolved = resolveMode(card, {
        projectConfig,
        configLocal,
        cardsSourcePath,
      });
      if (cardLanes[card.name] === "localOverlay") {
        resolved = {
          mode: "overlay",
          reason: "local lock lane overlay",
          vendorEligible: false,
          sourcePath: resolved.sourcePath ?? card.path,
        };
      }
      cardModes[card.name] = resolved;
      if (resolved.vendorEligible) {
        vendorEligible.add(card.name);
      } else {
        overlayCards.push(card);
      }
      if (resolved.reason.includes("absent")) {
        overlayWarnings.push(`${card.name}: ${resolved.reason}`);
      }
    }
    if (projectRoot) {
      for (const card of lockedCards) {
        const mode = cardModes[card.name];
        if (mode) {
          contentRootsByCard[card.name] = resolveCardContentRoot({
            projectRoot,
            agentsDir: normalized.agentsDir,
            card,
            mode,
            allowPlanningFallback: true,
          });
        }
      }
    }
    activeCards = selectActiveCards(lockedCards, projectConfig.activeWorker === null ? [] : [projectConfig.activeWorker]);
    skillApplyOrderCards = orderCardsByApplySpecs(activeCards, projectConfig.workers);
    projectConfigWithCards = mergeCardManifestsIntoProjectConfig(
      projectConfig,
      activeCards.map((card) => card.manifest),
    );
    cardServerDefinitions = collectCardServerDefinitions(lockedCards);
    const registryWithCards = mergeCardServerDefinitionsIntoRegistry(registry, collectCardServerDefinitions(activeCards));
    const projectOverlay: ProjectConfig = {
      ...projectConfigWithCards,
      mcpServers: projectConfig.mcpServers,
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
    skillApplyOrderCards,
    overlayCards,
    cardModes,
    cardLanes,
    contentRootsByCard,
    vendorEligible,
    overlayWarnings,
    skillSelection,
    recordPath: projectRoot ? resolveProjectWriteRecordPath(projectRoot) : resolveGlobalWriteRecordPath(normalized.agentsDir),
    scopeRoot,
    scopedOptions,
  };
}

export function recomputeContentRootsByCard(
  state: Pick<EffectiveState, "projectRoot" | "scopedOptions" | "lockedCards" | "cardModes">,
  options: { allowPlanningFallback?: boolean } = {},
): Record<string, string> {
  if (!state.projectRoot) {
    return {};
  }
  const allowPlanningFallback = options.allowPlanningFallback ?? !state.scopedOptions.dryRun;
  const contentRootsByCard: Record<string, string> = {};
  for (const card of state.lockedCards) {
    const mode = state.cardModes[card.name];
    if (!mode) {
      continue;
    }
    contentRootsByCard[card.name] = resolveCardContentRoot({
      projectRoot: state.projectRoot,
      agentsDir: state.scopedOptions.agentsDir,
      card,
      mode,
      allowPlanningFallback,
    });
  }
  return contentRootsByCard;
}

export function assertMachineWriteScopeAllowed(options: {
  writeScope?: "machine" | "project";
  forceMachineScope?: boolean;
  scope?: "machine" | "project";
}) {
  if (options.writeScope !== "machine") {
    return;
  }
  if (options.forceMachineScope || options.scope === "machine") {
    return;
  }
  throw new Error(
    "Machine-scope drwn write would modify user home tool configs (~/.claude, ~/.codex, ...). Re-run with --scope machine or --root to confirm.",
  );
}

function selectActiveCards(lockedCards: CardLockEntry[], activeWorkers?: string[]) {
  if (activeWorkers === undefined) {
    return lockedCards;
  }
  if (activeWorkers.length === 0) {
    return [];
  }
  const byName = new Map(lockedCards.map((card) => [card.name, card]));
  return activeWorkers.flatMap((name) => {
    const card = byName.get(name);
    return card ? [card] : [];
  });
}

export function orderCardsByApplySpecs(cards: CardLockEntry[], specs: string[]) {
  const byName = new Map(cards.map((card) => [card.name, card]));
  const unused = [...cards];
  return specs.flatMap((spec) => {
    const parsed = parseCardRef(spec);
    if (parsed.origin === "store" && parsed.name) {
      const card = byName.get(parsed.name);
      if (!card) {
        return [];
      }
      const idx = unused.indexOf(card);
      if (idx >= 0) {
        unused.splice(idx, 1);
      }
      return [card];
    }
    const card = unused.shift();
    return card ? [card] : [];
  });
}
