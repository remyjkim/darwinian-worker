// ABOUTME: Orchestrates the drwn session-signal hooks: sink append + card-usage write-on-change.
// ABOUTME: Dependency-light by design (hot path) — reads card.lock directly; clock + card resolution injectable.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateCardLockfile, type ProjectLockV1 } from "./card-lock";
import {
  buildCardUsageRecord,
  buildSkillRecord,
  cardsEqual,
  parseLastCardUsageGraph,
  resolveSinkPath,
  workerRootsEqual,
  type ActiveWorkerGraph,
  type HookPayload,
  type SkillPhase,
  type WorkerRootRef,
} from "./hook-signals";

export interface SkillHookDeps {
  now?: () => string;
  resolveActiveGraph?: (cwd: string) => Promise<ActiveWorkerGraph | null>;
}

export interface CardUsageHookDeps {
  now?: () => string;
  resolveActiveGraph?: (cwd: string) => Promise<ActiveWorkerGraph | null>;
}

function nowIso(deps: { now?: () => string }): string {
  return (deps.now ?? (() => new Date().toISOString()))();
}

function appendLine(sinkPath: string, record: unknown): void {
  mkdirSync(dirname(sinkPath), { recursive: true });
  appendFileSync(sinkPath, `${JSON.stringify(record)}\n`);
}

function findCardLock(startDir: string): string | null {
  let dir = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = join(dir, ".agents", "drwn", "card.lock");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Joins each Worker root to its Card entry, which carries the version and the content signature. */
function joinWorkerRoots(lock: ProjectLockV1): WorkerRootRef[] {
  const cardsByName = new Map(lock.cards.map((card) => [card.name, card]));
  return lock.workerRoots.map((root) => {
    const card = cardsByName.get(root.name);
    // Unreachable through validateCardLockfile, which already rejects a root that is
    // missing from cards. Kept so that a lock which somehow slips past it still
    // no-ops rather than stamping a root with invented version and integrity.
    if (!card) throw new Error(`Worker root ${root.name} is missing from cards`);
    return { name: root.name, version: card.version, kind: root.kind, integrity: card.integrity };
  });
}

/** Default resolution: nearest supported `card.lock`; null when absent or invalid. */
export async function resolveActiveGraphFromLock(cwd: string): Promise<ActiveWorkerGraph | null> {
  if (!cwd) return null;
  const lockPath = findCardLock(cwd);
  if (!lockPath) return null;
  // Hooks stay silent on invalid state rather than disrupting the host process.
  try {
    const lock = validateCardLockfile(JSON.parse(readFileSync(lockPath, "utf8")), lockPath);
    return {
      cards: lock.cards.map((card) => ({ name: card.name, version: card.version, integrity: card.integrity })),
      workerRoots: joinWorkerRoots(lock),
    };
  } catch {
    return null;
  }
}

export async function emitSkillMarker(payload: HookPayload, phase: SkillPhase, deps: SkillHookDeps = {}): Promise<void> {
  const sinkPath = resolveSinkPath(payload);
  if (!sinkPath) return;
  const graph =
    phase === "expansion" ? await (deps.resolveActiveGraph ?? resolveActiveGraphFromLock)(payload.cwd ?? "") : null;
  const record = buildSkillRecord(payload, phase, nowIso(deps), graph === null ? {} : { cards: graph.cards });
  if (!record) return; // partial / mismatched payload → no-op
  appendLine(sinkPath, record);
}

export async function emitCardUsage(payload: HookPayload, deps: CardUsageHookDeps = {}): Promise<void> {
  const sinkPath = resolveSinkPath(payload);
  if (!sinkPath) return;

  const resolve = deps.resolveActiveGraph ?? resolveActiveGraphFromLock;
  const graph = await resolve(payload.cwd ?? "");
  if (graph === null) return; // no card.lock → skip silently

  if (existsSync(sinkPath)) {
    const last = parseLastCardUsageGraph(readFileSync(sinkPath, "utf8"));
    // Write-on-change keys on the whole root graph, not the flattened card list: a Blueprint's
    // members can swap at a fixed count, so validateCardLockfile admits a different root set over a
    // byte-identical closure (dw#52 follow-up). Suppress only when BOTH cards and roots are unchanged.
    if (last !== null && cardsEqual(last.cards, graph.cards) && workerRootsEqual(last.workerRoots, graph.workerRoots)) {
      return;
    }
  }

  appendLine(sinkPath, buildCardUsageRecord(payload, graph, nowIso(deps)));
}
