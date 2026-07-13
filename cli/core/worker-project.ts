// ABOUTME: Mutates project Worker-root requirements through validated config V2 and lockfile V6 state.
// ABOUTME: Resolves complete next state before atomically committing config and lock bytes together.

import { cardLockPath, backfillLockTreeShas, serializeCardLock, validateCardLockfile, type CardLockEntry } from "./card-lock";
import { collectCardMetaWarnings } from "./card-project";
import { cardNamesEqual, parseCardRef, type ResolveCardOptions } from "./card-store";
import { DrwnError } from "./errors";
import { normalizeProjectConfig } from "./project-config-migration";
import { mutateProjectState, type ProjectStateSnapshot } from "./project-state-transaction";
import { projectConfigPath } from "./project-writes";
import { satisfies } from "./semver-utils";
import type { ProjectConfig } from "./types";
import {
  reconstructLegacyWorkerGraph,
  resolveWorkerGraph,
  type ResolvedWorkerGraph,
} from "./worker-graph";

export interface WorkerProjectMutation {
  projectConfigPath: string;
  lockPath: string;
  workers: string[];
  roots: ResolvedWorkerGraph["roots"];
  locked: CardLockEntry[];
  activeWorker?: string | null;
  warnings?: string[];
  dryRun?: boolean;
  configBytes: string;
  lockBytes: string;
}

export interface WorkerMutationOptions extends ResolveCardOptions {
  dryRun?: boolean;
}

interface CurrentProjectState {
  config: ProjectConfig;
  graph: ResolvedWorkerGraph;
}

function parseSnapshot(snapshot: ProjectStateSnapshot): CurrentProjectState {
  if (!snapshot.configBytes) {
    throw new DrwnError("PROJECT_CONFIG_REQUIRED", "Project config does not exist; run drwn init first");
  }
  const config = normalizeProjectConfig(JSON.parse(snapshot.configBytes)).config;
  if (!snapshot.lockBytes) return { config, graph: { roots: [], cards: [] } };
  const lock = validateCardLockfile(JSON.parse(snapshot.lockBytes));
  return {
    config,
    graph: lock.lockfileVersion === 6
      ? { roots: lock.workerRoots, cards: lock.cards }
      : reconstructLegacyWorkerGraph(lock.cards, config.workers ?? []),
  };
}

function preserveHookConsent(previousCards: CardLockEntry[], nextCards: CardLockEntry[], warnings: string[]) {
  const previousByName = new Map(previousCards.map((card) => [card.name, card]));
  return nextCards.map((card) => {
    const previous = previousByName.get(card.name);
    if (!previous?.hookConsent) return card;
    if (satisfies(card.version, previous.hookConsent.consentedRange, { includePrerelease: true })) {
      return { ...card, hookConsent: previous.hookConsent };
    }
    if (card.hooks.length > 0) {
      warnings.push(
        `${card.name} hook consent dropped: locked ${card.version} is outside consent range ${previous.hookConsent.consentedRange}. Run drwn card trust ${card.name} --hooks to re-consent.`,
      );
    }
    return card;
  });
}

function implicitOrExplicitSelection(state: CurrentProjectState): string | null | undefined {
  if (state.config.activeWorker !== undefined) return state.config.activeWorker;
  return state.graph.roots.length === 1 ? state.graph.roots[0]!.name : undefined;
}

function assertRootInstalled(graph: ResolvedWorkerGraph, name: string) {
  if (!graph.roots.some((root) => root.name === name)) {
    throw new DrwnError("ACTIVE_WORKER_NOT_INSTALLED", `Worker ${name} is not an installed root`);
  }
}

async function prepareMutation(
  projectRoot: string,
  agentsDir: string,
  snapshot: ProjectStateSnapshot,
  nextSpecs: string[],
  select: (current: CurrentProjectState, next: ResolvedWorkerGraph) => string | null | undefined,
  options: WorkerMutationOptions,
): Promise<{ bytes: { configBytes: string; lockBytes: string }; value: WorkerProjectMutation }> {
  const current = parseSnapshot(snapshot);
  const resolved = await resolveWorkerGraph(agentsDir, nextSpecs, options);
  const warnings: string[] = [];
  const cardsWithConsent = preserveHookConsent(current.graph.cards, resolved.cards, warnings);
  const locked = await backfillLockTreeShas(agentsDir, cardsWithConsent);
  warnings.push(...await collectCardMetaWarnings(agentsDir, locked, options));
  const graph = { roots: resolved.roots, cards: locked };
  const activeWorker = select(current, graph);
  if (typeof activeWorker === "string") assertRootInstalled(graph, activeWorker);
  const config: ProjectConfig = {
    ...current.config,
    version: 2,
    workers: [...nextSpecs],
  };
  if (activeWorker === undefined) {
    delete config.activeWorker;
  } else {
    config.activeWorker = activeWorker;
  }
  const configBytes = `${JSON.stringify(config, null, 2)}\n`;
  const lockBytes = serializeCardLock(graph);
  return {
    bytes: { configBytes, lockBytes },
    value: {
      projectConfigPath: projectConfigPath(projectRoot),
      lockPath: cardLockPath(projectRoot),
      workers: [...nextSpecs],
      roots: graph.roots,
      locked,
      ...(activeWorker !== undefined ? { activeWorker } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(options.dryRun ? { dryRun: true } : {}),
      configBytes,
      lockBytes,
    },
  };
}

async function mutateRoots(
  projectRoot: string,
  agentsDir: string,
  derive: (current: CurrentProjectState) => Promise<{
    specs: string[];
    select: (current: CurrentProjectState, next: ResolvedWorkerGraph) => string | null | undefined;
  }>,
  options: WorkerMutationOptions = {},
) {
  return mutateProjectState(projectRoot, async (snapshot) => {
    const current = parseSnapshot(snapshot);
    const mutation = await derive(current);
    return prepareMutation(projectRoot, agentsDir, snapshot, mutation.specs, mutation.select, options);
  }, { dryRun: options.dryRun });
}

export async function addProjectWorkerRoot(
  projectRoot: string,
  agentsDir: string,
  spec: string,
  options: WorkerMutationOptions = {},
) {
  return mutateRoots(projectRoot, agentsDir, async (current) => ({
    specs: [...(current.config.workers ?? []), spec],
    select: (before, next) => {
      if (before.config.activeWorker !== undefined) return before.config.activeWorker;
      if (before.graph.roots.length === 1 && next.roots.length > 1) return before.graph.roots[0]!.name;
      return undefined;
    },
  }), options);
}

export async function applyProjectWorkerRoots(
  projectRoot: string,
  agentsDir: string,
  specs: string[],
  options: WorkerMutationOptions & { active?: string; none?: boolean } = {},
) {
  if (options.active && options.none) {
    throw new DrwnError("PROJECT_WORKER_SELECTION_INVALID", "Use either --active <name> or --none, not both");
  }
  return mutateRoots(projectRoot, agentsDir, async () => ({
    specs,
    select: (current, next) => {
      if (options.active) return options.active;
      if (options.none) return null;
      const currentSelection = implicitOrExplicitSelection(current);
      if (currentSelection === null) return null;
      if (typeof currentSelection === "string" && next.roots.some((root) => root.name === currentSelection)) {
        return currentSelection;
      }
      if (next.roots.length <= 1) return undefined;
      throw new DrwnError(
        "MULTIPLE_WORKERS_REQUIRE_SELECTION",
        "Applying multiple Worker roots requires --active <installed-root> or --none",
      );
    },
  }), options);
}

export async function removeProjectWorkerRoot(
  projectRoot: string,
  agentsDir: string,
  refOrName: string,
  options: WorkerMutationOptions = {},
) {
  return mutateRoots(projectRoot, agentsDir, async (current) => {
    const requestedName = parseCardRef(refOrName).name;
    const index = current.graph.roots.findIndex((root) => cardNamesEqual(root.name, requestedName));
    if (index < 0) throw new DrwnError("WORKER_ROOT_NOT_INSTALLED", `Worker root is not installed: ${requestedName}`);
    const removedName = current.graph.roots[index]!.name;
    const specs = (current.config.workers ?? []).filter((_, specIndex) => specIndex !== index);
    return {
      specs,
      select: (before, next) => {
        const selected = implicitOrExplicitSelection(before);
        if (selected === removedName) return next.roots.length > 0 ? null : undefined;
        return before.config.activeWorker;
      },
    };
  }, options);
}

export async function pinProjectWorkerRoot(
  projectRoot: string,
  agentsDir: string,
  spec: string,
  options: WorkerMutationOptions = {},
) {
  const [resolvedRoot] = (await resolveWorkerGraph(agentsDir, [spec], options)).roots;
  if (!resolvedRoot) throw new DrwnError("WORKER_ROOT_NOT_RESOLVED", `Could not resolve Worker root ${spec}`);
  return mutateRoots(projectRoot, agentsDir, async (current) => {
    const index = current.graph.roots.findIndex((root) => root.name === resolvedRoot.name);
    if (index < 0) throw new DrwnError("WORKER_ROOT_NOT_INSTALLED", `Worker root is not installed: ${resolvedRoot.name}`);
    const specs = [...(current.config.workers ?? [])];
    specs[index] = spec;
    return { specs, select: (before) => before.config.activeWorker };
  }, options);
}

export async function updateProjectWorkerGraph(
  projectRoot: string,
  agentsDir: string,
  name?: string,
  options: WorkerMutationOptions = {},
) {
  return mutateRoots(projectRoot, agentsDir, async (current) => {
    if (name && !current.graph.roots.some((root) => cardNamesEqual(root.name, name))) {
      throw new DrwnError("WORKER_ROOT_NOT_INSTALLED", `Worker root is not installed: ${name}`);
    }
    return {
      specs: [...(current.config.workers ?? [])],
      select: (before) => before.config.activeWorker,
    };
  }, options);
}
