// ABOUTME: Builds the effective drwn state shared by write and capture flows.
// ABOUTME: Keeps project card, overlay, registry, and target resolution in one place.

import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import { mergeCardManifestsIntoProjectConfig } from "./card-project";
import { collectCardServerDefinitions, mergeCardServerDefinitionsIntoRegistry, type CardServerDefinition } from "./card-mcp";
import { loadCardLock, backfillLockTreeShas } from "./card-lock";
import { loadConfigLocal, loadCardLockLocalGraph, mergeProjectWithLocal } from "./config-local";
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
import { assertWorkerCapabilityCompatibility } from "./card-skill-resolver";
import {
  overlayWorkerGraph,
  reconstructLegacyWorkerGraph,
  resolveWorkerGraph,
  type ResolvedWorkerGraph,
  type WorkerRootLockEntry,
} from "./worker-graph";
import { DrwnError } from "./errors";

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
  workerGraph: ResolvedWorkerGraph;
  activeWorkerRoot: WorkerRootLockEntry | null;
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
  let workerGraph: ResolvedWorkerGraph = { roots: [], cards: [] };
  let activeWorkerRoot: WorkerRootLockEntry | null = null;
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
    if ((configLocal?.activate !== undefined || configLocal?.activeWorker !== undefined) && projectConfig.activeWorker !== undefined) {
      overlayWarnings.push("config.local.json activeWorker overrides committed activeWorker");
    }
    projectConfig = mergeProjectWithLocal(projectConfig, configLocal);
    const cardLock = projectRoot ? await loadCardLock(projectRoot) : null;
    const committedGraph = cardLock?.cards && cardLock.cards.length > 0
      ? cardLock.lockfileVersion === 6
        ? { roots: cardLock.workerRoots, cards: cardLock.cards }
        : reconstructLegacyWorkerGraph(cardLock.cards, projectConfig.workers ?? [])
      : projectConfig.workers
        ? await resolveWorkerGraph(normalized.agentsDir, projectConfig.workers)
        : { roots: [], cards: [] };
    const localGraph = projectRoot ? await loadCardLockLocalGraph(projectRoot) : null;
    workerGraph = overlayWorkerGraph(committedGraph, localGraph);
    const byName = new Map<string, CardLockEntry>();
    for (const card of committedGraph.cards) {
      byName.set(card.name, card);
      cardLanes[card.name] = "committed";
    }
    for (const card of localGraph?.cards ?? []) {
      if (byName.has(card.name)) {
        overlayWarnings.push(`card.lock.local overrides committed lock entry for ${card.name}`);
      }
      byName.set(card.name, card);
      cardLanes[card.name] = "localOverlay";
    }
    lockedCards = [...byName.values()];
    lockedCards = await backfillLockTreeShas(normalized.agentsDir, lockedCards);
    workerGraph = { roots: workerGraph.roots, cards: lockedCards };
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
    const selected = selectActiveWorker(workerGraph, projectConfig.activeWorker);
    activeWorkerRoot = selected.root;
    activeCards = selected.cards;
    assertWorkerCapabilityCompatibility(activeCards);
    skillApplyOrderCards = activeCards;
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
    workerGraph,
    activeWorkerRoot,
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

export function selectActiveWorker(
  graph: ResolvedWorkerGraph,
  requested: string | null | undefined,
): { root: WorkerRootLockEntry | null; cards: CardLockEntry[] } {
  if (requested === null || graph.roots.length === 0) {
    return { root: null, cards: [] };
  }
  if (requested === undefined && graph.roots.length > 1) {
    throw new DrwnError(
      "MULTIPLE_WORKERS_REQUIRE_SELECTION",
      `Project has ${graph.roots.length} installed Worker roots; select one with drwn use <worker>`,
    );
  }
  const root = requested === undefined
    ? graph.roots[0]!
    : graph.roots.find((candidate) => candidate.name === requested);
  if (!root) {
    throw new DrwnError(
      "ACTIVE_WORKER_NOT_INSTALLED",
      `Active Worker ${requested} is not an installed Worker root`,
    );
  }
  const byName = new Map(graph.cards.map((card) => [card.name, card]));
  const closureNames = [root.name, ...root.members];
  const cards = closureNames.map((name) => {
    const card = byName.get(name);
    if (!card) {
      throw new DrwnError("WORKER_CARD_LOCK_MISSING", `Worker root ${root.name} references missing Card ${name}`);
    }
    return card;
  });
  return { root, cards };
}
