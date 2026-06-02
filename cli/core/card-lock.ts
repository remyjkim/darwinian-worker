// ABOUTME: Reads and writes project Harness Card lockfiles.
// ABOUTME: Keeps card resolution deterministic once a project has selected cards.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CardManifest } from "./card-manifest";
import { assertValidCardManifest } from "./card-manifest";
import { writeAtomically } from "./fs";

export type CardOrigin = "store" | "git" | "file" | "npm";

export interface GitLockInfo {
  url?: string;
  ref?: string;
  commit: string;
}

export interface CardLockEntry {
  name: string;
  requested: string;
  version: string;
  path: string;
  integrity: string;
  manifest: CardManifest;
  skills: string[];
  registry: null;
  origin: CardOrigin;
  git?: GitLockInfo;
}

export interface CardLockfile {
  lockfileVersion: 2;
  store?: { minDrwnVersion?: string };
  cards: CardLockEntry[];
}

export function cardLockPath(projectRoot: string) {
  return join(projectRoot, ".agents", "drwn", "card.lock");
}

export async function loadCardLock(projectRoot: string): Promise<CardLockfile | null> {
  const path = cardLockPath(projectRoot);
  if (!existsSync(path)) {
    return null;
  }
  return validateCardLockfile(JSON.parse(await readFile(path, "utf8")), path);
}

export async function writeCardLock(projectRoot: string, cards: CardLockEntry[]) {
  const path = cardLockPath(projectRoot);
  const lockfile = validateCardLockfile({ lockfileVersion: 2, cards });
  await writeAtomically(path, `${JSON.stringify(lockfile, null, 2)}\n`);
  return path;
}

export function validateCardLockfile(input: unknown, source = "card lockfile"): CardLockfile {
  if (!isObject(input) || input.lockfileVersion !== 2 || !Array.isArray(input.cards)) {
    throw new Error(`Invalid card lockfile ${source}: expected lockfileVersion: 2`);
  }
  const cards = input.cards.map((entry, index) => validateCardLockEntry(entry, `${source} cards[${index}]`));
  const store = isObject(input.store) ? { minDrwnVersion: stringOrUndefined(input.store.minDrwnVersion) } : undefined;
  return store ? { lockfileVersion: 2, store, cards } : { lockfileVersion: 2, cards };
}

function validateCardLockEntry(input: unknown, source: string): CardLockEntry {
  if (!isObject(input)) {
    throw new Error(`Invalid card lock entry ${source}: expected object`);
  }
  const origin = input.origin;
  if (origin !== "store" && origin !== "git" && origin !== "file" && origin !== "npm") {
    throw new Error(`Invalid card lock entry ${source}: origin must be store, git, file, or npm`);
  }
  assertString(input.name, `${source}.name`);
  assertString(input.requested, `${source}.requested`);
  assertString(input.version, `${source}.version`);
  assertString(input.path, `${source}.path`);
  assertString(input.integrity, `${source}.integrity`);
  assertValidCardManifest(input.manifest);
  if (!Array.isArray(input.skills) || !input.skills.every((skill) => typeof skill === "string")) {
    throw new Error(`Invalid card lock entry ${source}: skills must be string[]`);
  }
  if (input.registry !== null) {
    throw new Error(`Invalid card lock entry ${source}: registry must be null`);
  }

  const git = validateGitLockInfo(input.git, origin, source);
  return {
    name: input.name,
    requested: input.requested,
    version: input.version,
    path: input.path,
    integrity: input.integrity,
    manifest: input.manifest,
    skills: [...input.skills],
    registry: null,
    origin,
    ...(git ? { git } : {}),
  };
}

function validateGitLockInfo(input: unknown, origin: CardOrigin, source: string): GitLockInfo | undefined {
  if (origin === "file" || origin === "npm") {
    if (input !== undefined) {
      throw new Error(`Invalid card lock entry ${source}: ${origin} origin must not include git metadata`);
    }
    return undefined;
  }
  if (!isObject(input)) {
    throw new Error(`Invalid card lock entry ${source}: ${origin} origin requires git metadata`);
  }
  assertString(input.commit, `${source}.git.commit`);
  if (!/^[a-f0-9]{40}$/.test(input.commit)) {
    throw new Error(`Invalid card lock entry ${source}: git.commit must be a 40-character SHA`);
  }
  return {
    commit: input.commit,
    ...(typeof input.url === "string" ? { url: input.url } : {}),
    ...(typeof input.ref === "string" ? { ref: input.ref } : {}),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid card lock entry: ${label} must be a non-empty string`);
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
