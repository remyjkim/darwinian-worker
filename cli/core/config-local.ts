// ABOUTME: Reads and writes machine-local project overlay files.
// ABOUTME: Keeps dev/link overrides out of committed config.json and card.lock.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCardLock, validateCardLockfile, type CardLockEntry } from "./card-lock";
import { resolveCard } from "./card-store";
import { DrwnError } from "./errors";
import { resolveProjectCards } from "./card-project";
import { writeAtomically } from "./fs";
import { ensureGitignoreEntries } from "./git-hygiene";
import type { ProjectConfig } from "./types";

export interface ConfigLocal {
  schema: "drwn.project-local";
  schemaVersion: 1;
  activeWorker?: string | null;
  cardReplacements?: Record<string, string>;
  localOnlyRoots?: string[];
  sourceOverrides?: Record<string, string>;
}

export function emptyConfigLocal(): ConfigLocal {
  return { schema: "drwn.project-local", schemaVersion: 1 };
}

const CONFIG_LOCAL_KEYS = new Set([
  "schema",
  "schemaVersion",
  "activeWorker",
  "cardReplacements",
  "localOnlyRoots",
  "sourceOverrides",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidLocal(source: string, detail: string): never {
  throw new DrwnError("PROJECT_CONFIG_INVALID", `Invalid local project config ${source}: ${detail}`);
}

function validateStringMap(value: unknown, source: string, field: string) {
  if (value === undefined) return;
  if (!isObject(value) || !Object.values(value).every((entry) => typeof entry === "string")) {
    invalidLocal(source, `${field} must be a string map`);
  }
}

export function validateConfigLocal(input: unknown, source = "<memory>"): ConfigLocal {
  if (!isObject(input)) invalidLocal(source, "expected an object");
  const unknown = Object.keys(input).filter((key) => !CONFIG_LOCAL_KEYS.has(key));
  if (unknown.length > 0) invalidLocal(source, `unsupported field(s): ${unknown.join(", ")}`);
  if (input.schema !== "drwn.project-local") invalidLocal(source, "schema must be drwn.project-local");
  if (input.schemaVersion !== 1) invalidLocal(source, "schemaVersion must be 1");
  if (input.activeWorker !== undefined && input.activeWorker !== null && typeof input.activeWorker !== "string") {
    invalidLocal(source, "activeWorker must be a string or null");
  }
  if (input.localOnlyRoots !== undefined && (!Array.isArray(input.localOnlyRoots) || !input.localOnlyRoots.every((entry) => typeof entry === "string"))) {
    invalidLocal(source, "localOnlyRoots must be a string array");
  }
  validateStringMap(input.cardReplacements, source, "cardReplacements");
  validateStringMap(input.sourceOverrides, source, "sourceOverrides");
  return input as unknown as ConfigLocal;
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new DrwnError("PROJECT_CONFIG_INVALID", `Invalid local project config ${path}: malformed JSON`, undefined, error);
  }
  return validateConfigLocal(parsed, path);
}

export async function writeConfigLocal(projectRoot: string, config: ConfigLocal) {
  await ensureGitignoreEntries(projectRoot);
  const path = configLocalPath(projectRoot);
  await writeAtomically(path, `${JSON.stringify(validateConfigLocal(config, path), null, 2)}\n`);
  return path;
}

export async function loadCardLockLocal(projectRoot: string): Promise<CardLockEntry[] | null> {
  const path = cardLockLocalPath(projectRoot);
  if (!existsSync(path)) {
    return null;
  }
  const lockfile = validateCardLockfile(JSON.parse(await readFile(path, "utf8")), path);
  return lockfile.cards;
}

export async function writeCardLockLocal(projectRoot: string, cards: CardLockEntry[]) {
  await ensureGitignoreEntries(projectRoot);
  const path = cardLockLocalPath(projectRoot);
  await writeAtomically(
    path,
    `${JSON.stringify({ lockfileVersion: 5, cards }, null, 2)}\n`,
  );
  return path;
}

export async function ensureCardLockLocalEntry(projectRoot: string, agentsDir: string, cardName: string) {
  const committed = await loadCardLock(projectRoot);
  if (committed?.cards?.some((card) => card.name === cardName)) {
    return;
  }
  const existing = (await loadCardLockLocal(projectRoot)) ?? [];
  if (existing.some((card) => card.name === cardName)) {
    return;
  }
  const [entry] = await resolveProjectCards(agentsDir, [cardName]);
  if (!entry) {
    return;
  }
  await writeCardLockLocal(projectRoot, [...existing, entry]);
}

export async function ensureCardLockLocalEntryFromSource(
  projectRoot: string,
  agentsDir: string,
  expectedName: string,
  sourceDir: string,
) {
  const committed = await loadCardLock(projectRoot);
  if (committed?.cards?.some((card) => card.name === expectedName)) {
    return;
  }
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
  const existing = (await loadCardLockLocal(projectRoot)) ?? [];
  const next = existing.some((card) => card.name === expectedName)
    ? existing.map((card) => (card.name === expectedName ? entry : card))
    : [...existing, entry];
  await writeCardLockLocal(projectRoot, next);
}

export function mergeProjectWithLocal(project: ProjectConfig, local: ConfigLocal | null): ProjectConfig {
  if (!local) {
    return project;
  }
  const next: ProjectConfig = { ...project };
  if (local.activeWorker !== undefined) {
    next.activeWorker = local.activeWorker;
  }
  return next;
}
