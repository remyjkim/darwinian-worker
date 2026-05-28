// ABOUTME: Reads and writes project Harness Card lockfiles.
// ABOUTME: Keeps card resolution deterministic once a project has selected cards.

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CardManifest } from "./card-manifest";

export interface CardLockEntry {
  name: string;
  requested: string;
  version: string;
  path: string;
  integrity: string;
  manifest: CardManifest;
  skills: string[];
  registry: null;
}

export interface CardLockfile {
  lockfileVersion: 1;
  cards: CardLockEntry[];
}

export function cardLockPath(projectRoot: string) {
  return join(projectRoot, ".agents", "bgng", "card.lock");
}

export async function loadCardLock(projectRoot: string): Promise<CardLockfile | null> {
  const path = cardLockPath(projectRoot);
  if (!existsSync(path)) {
    return null;
  }
  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<CardLockfile> & {
    cards?: Array<Partial<CardLockEntry> & {
      name: string;
      requested: string;
      version: string;
      path: string;
      integrity: string;
      manifest: CardManifest;
    }>;
  };
  if (parsed.lockfileVersion !== 1 || !Array.isArray(parsed.cards)) {
    throw new Error(`Invalid card lockfile: ${path}`);
  }
  const cards: CardLockEntry[] = parsed.cards.map((entry) => ({
    ...entry,
    skills: entry.skills ?? entry.manifest.skills?.include ?? [],
    registry: null,
  }));
  return { lockfileVersion: 1, cards };
}

export function writeCardLock(projectRoot: string, cards: CardLockEntry[]) {
  const path = cardLockPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, `${JSON.stringify({ lockfileVersion: 1, cards }, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
  const dirFd = openSync(dirname(path), "r");
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
  return path;
}
