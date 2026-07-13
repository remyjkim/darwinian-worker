// ABOUTME: Reads and writes machine-local project overlay files.
// ABOUTME: Keeps dev/link overrides out of committed config.json and card.lock.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCardLock, validateCardLockfile, type CardLockEntry } from "./card-lock";
import { resolveCard } from "./card-store";
import { DrwnError } from "./errors";
import { writeAtomically } from "./fs";
import { ensureGitignoreEntries } from "./git-hygiene";
import type { ProjectConfig } from "./types";
import { graphFromCards, resolveWorkerGraph, type ResolvedWorkerGraph } from "./worker-graph";

export interface ConfigLocal {
  activate?: string[];
  overrides?: Record<string, string>;
}

export function configLocalPath(projectRoot: string) {
  return join(projectRoot, ".agents", "drwn", "config.local.json");
}

export function cardLockLocalPath(projectRoot: string) {
  return join(projectRoot, ".agents", "drwn", "card.lock.local");
}

export async function loadConfigLocal(projectRoot: string): Promise<ConfigLocal | null> {
  const path = configLocalPath(projectRoot);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf8")) as ConfigLocal;
}

export async function writeConfigLocal(projectRoot: string, config: ConfigLocal) {
  await ensureGitignoreEntries(projectRoot);
  const path = configLocalPath(projectRoot);
  await writeAtomically(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}

async function validateLocalGraph(projectRoot: string, local: ResolvedWorkerGraph): Promise<ResolvedWorkerGraph> {
  const committed = await loadCardLock(projectRoot);
  const committedGraph = committed
    ? committed.lockfileVersion === 6
      ? { roots: committed.workerRoots, cards: committed.cards }
      : graphFromCards(committed.cards)
    : { roots: [], cards: [] };
  const roots = new Map(committedGraph.roots.map((root) => [root.name, root]));
  const cards = new Map(committedGraph.cards.map((card) => [card.name, card]));
  for (const root of local.roots) roots.set(root.name, root);
  for (const card of local.cards) cards.set(card.name, card);
  const validated = validateCardLockfile({
    lockfileVersion: 6,
    workerRoots: [...roots.values()],
    cards: [...cards.values()],
  }, cardLockLocalPath(projectRoot));
  if (validated.lockfileVersion !== 6) {
    throw new Error("Internal error: local Worker graph did not validate as lockfile V6");
  }
  return { roots: validated.workerRoots, cards: validated.cards };
}

export async function loadCardLockLocalGraph(projectRoot: string): Promise<ResolvedWorkerGraph | null> {
  const path = cardLockLocalPath(projectRoot);
  if (!existsSync(path)) {
    return null;
  }
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  const parsed = validateLocalShape(raw, path);
  const combined = await validateLocalGraph(projectRoot, parsed);
  const rootNames = new Set(parsed.roots.map((root) => root.name));
  const cardNames = new Set(parsed.cards.map((card) => card.name));
  return {
    roots: combined.roots.filter((root) => rootNames.has(root.name)),
    cards: combined.cards.filter((card) => cardNames.has(card.name)),
  };
}

function validateLocalShape(input: unknown, source: string): ResolvedWorkerGraph {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Invalid local card lockfile ${source}: expected object`);
  }
  const raw = input as Record<string, unknown>;
  if (raw.lockfileVersion !== 6) {
    const legacy = validateCardLockfile(raw, source);
    return graphFromCards(legacy.cards);
  }
  if (!Array.isArray(raw.workerRoots) || !Array.isArray(raw.cards)) {
    throw new Error(`Invalid local card lockfile ${source}: workerRoots and cards must be arrays`);
  }
  return {
    roots: raw.workerRoots as ResolvedWorkerGraph["roots"],
    cards: raw.cards as CardLockEntry[],
  };
}

export async function loadCardLockLocal(projectRoot: string): Promise<CardLockEntry[] | null> {
  return (await loadCardLockLocalGraph(projectRoot))?.cards ?? null;
}

export async function writeCardLockLocal(projectRoot: string, graphOrCards: ResolvedWorkerGraph | CardLockEntry[]) {
  await ensureGitignoreEntries(projectRoot);
  const path = cardLockLocalPath(projectRoot);
  const graph = Array.isArray(graphOrCards) ? graphFromCards(graphOrCards) : graphOrCards;
  await validateLocalGraph(projectRoot, graph);
  await writeAtomically(
    path,
    `${JSON.stringify({ lockfileVersion: 6, workerRoots: graph.roots, cards: graph.cards }, null, 2)}\n`,
  );
  return path;
}

export async function ensureCardLockLocalEntry(projectRoot: string, agentsDir: string, cardName: string) {
  const committed = await loadCardLock(projectRoot);
  if (committed?.cards?.some((card) => card.name === cardName)) {
    return;
  }
  const existing = (await loadCardLockLocalGraph(projectRoot)) ?? { roots: [], cards: [] };
  if (existing.cards.some((card) => card.name === cardName)) {
    return;
  }
  const graph = await resolveWorkerGraph(agentsDir, [cardName]);
  if (graph.cards.length === 0) {
    return;
  }
  await writeCardLockLocal(projectRoot, {
    roots: [...existing.roots, ...graph.roots],
    cards: [...existing.cards, ...graph.cards],
  });
}

export async function ensureCardLockLocalEntryFromSource(
  projectRoot: string,
  agentsDir: string,
  expectedName: string,
  sourceDir: string,
) {
  const committed = await loadCardLock(projectRoot);
  const fileRef = sourceDir.startsWith("file:") ? sourceDir : `file:${sourceDir}`;
  const resolved = await resolveCard(agentsDir, fileRef, { allowUntrustedSource: true });
  if (resolved.name !== expectedName) {
    throw new DrwnError(
      "LOCAL_LOCK_NAME_MISMATCH",
      `local source manifest name ${resolved.name} does not match expected ${expectedName}`,
    );
  }
  const entry: CardLockEntry = {
    name: resolved.name,
    requested: fileRef,
    version: resolved.version,
    path: resolved.dir,
    integrity: resolved.integrity,
    manifest: resolved.manifest,
    skills: resolved.manifest.skills?.include ?? [],
    hooks: resolved.manifest.hooks?.include ?? [],
    registry: null,
    origin: "file",
  };
  const existing = (await loadCardLockLocalGraph(projectRoot)) ?? { roots: [], cards: [] };
  const cards = existing.cards.some((card) => card.name === expectedName)
    ? existing.cards.map((card) => (card.name === expectedName ? entry : card))
    : [...existing.cards, entry];
  const committedRoot = committed?.lockfileVersion === 6
    ? committed.workerRoots.find((root) => root.name === expectedName)
    : undefined;
  const replacementRoot = committedRoot
    ? { ...committedRoot, requested: fileRef }
    : committed?.cards.some((card) => card.name === expectedName)
      ? null
      : {
          name: entry.name,
          requested: entry.requested,
          kind: entry.manifest.kind === "blueprint" ? "blueprint" as const : "card" as const,
          members: [],
        };
  const roots = replacementRoot
    ? existing.roots.some((root) => root.name === expectedName)
      ? existing.roots.map((root) => (root.name === expectedName ? replacementRoot : root))
      : [...existing.roots, replacementRoot]
    : existing.roots;
  await writeCardLockLocal(projectRoot, { roots, cards });
}

export function mergeProjectWithLocal(project: ProjectConfig, local: ConfigLocal | null): ProjectConfig {
  if (!local) {
    return project;
  }
  const next: ProjectConfig = { ...project };
  if (local.activate !== undefined) {
    next.activeWorkers = [...local.activate];
  }
  return next;
}
