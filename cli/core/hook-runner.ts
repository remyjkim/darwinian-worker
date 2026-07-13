// ABOUTME: Orchestrates the drwn session-signal hooks: sink append + card-usage write-on-change.
// ABOUTME: Dependency-light by design (hot path) — reads card.lock directly; clock + card resolution injectable.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateCardLockfile } from "./card-lock";
import {
  buildCardUsageRecord,
  buildSkillRecord,
  cardsEqual,
  parseLastCardUsageCards,
  resolveSinkPath,
  type CardRef,
  type HookPayload,
  type SkillPhase,
} from "./hook-signals";

export interface SkillHookDeps {
  now?: () => string;
  resolveActiveCards?: (cwd: string) => Promise<CardRef[] | null>;
}

export interface CardUsageHookDeps {
  now?: () => string;
  resolveActiveCards?: (cwd: string) => Promise<CardRef[] | null>;
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

/** Default card resolution: nearest supported `card.lock`; null when absent or invalid. */
export async function resolveActiveCardsFromLock(cwd: string): Promise<CardRef[] | null> {
  if (!cwd) return null;
  const lockPath = findCardLock(cwd);
  if (!lockPath) return null;
  // Hooks stay silent on invalid state rather than disrupting the host process.
  try {
    const lock = validateCardLockfile(JSON.parse(readFileSync(lockPath, "utf8")), lockPath);
    return lock.cards.map((card) => ({ name: card.name, version: card.version }));
  } catch {
    return null;
  }
}

export async function emitSkillMarker(payload: HookPayload, phase: SkillPhase, deps: SkillHookDeps = {}): Promise<void> {
  const sinkPath = resolveSinkPath(payload);
  if (!sinkPath) return;
  const cards =
    phase === "expansion" ? await (deps.resolveActiveCards ?? resolveActiveCardsFromLock)(payload.cwd ?? "") : null;
  const record = buildSkillRecord(payload, phase, nowIso(deps), cards === null ? {} : { cards });
  if (!record) return; // partial / mismatched payload → no-op
  appendLine(sinkPath, record);
}

export async function emitCardUsage(payload: HookPayload, deps: CardUsageHookDeps = {}): Promise<void> {
  const sinkPath = resolveSinkPath(payload);
  if (!sinkPath) return;

  const resolve = deps.resolveActiveCards ?? resolveActiveCardsFromLock;
  const cards = await resolve(payload.cwd ?? "");
  if (cards === null) return; // no card.lock → skip silently

  if (existsSync(sinkPath)) {
    const last = parseLastCardUsageCards(readFileSync(sinkPath, "utf8"));
    if (last !== null && cardsEqual(last, cards)) return; // write-on-change
  }

  appendLine(sinkPath, buildCardUsageRecord(payload, cards, nowIso(deps)));
}
