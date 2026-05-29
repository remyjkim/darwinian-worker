// ABOUTME: Manages local Harness Card sources, immutable published versions, and resolution.
// ABOUTME: Centralizes card store layout so authoring and project commands share behavior.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { cp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertValidCardManifest, isCardScopeName, isCardUnscopedName, type CardManifest } from "./card-manifest";
import { detectLegacyLayout } from "./migration";
import { compareVersions, gt, isStrictSemver, maxSatisfying, validRange } from "./semver-utils";
import {
  resolveCardPackageDir,
  resolveCardSourceDir,
  resolveCardVersionDir,
  resolveCardsRoot,
  resolveMachineConfigPath,
  resolveSourcesRoot,
  resolveStoreCacheDir,
  resolveStoreGeneratedDir,
  resolveStoreMcpServersDir,
  resolveStoreMetadataPath,
  resolveStoreRoot,
  resolveStoreSkillsRoot,
  splitCardName,
} from "./store-paths";
import type { MachineConfig, StoreMetadata } from "./types";

export interface CardRef {
  name: string;
  range: string;
  filePath?: string;
}

export interface ResolvedCard {
  name: string;
  requested: string;
  version: string;
  dir: string;
  integrity: string;
  manifest: CardManifest;
}

export interface CardPackageIndexVersion {
  version: string;
  publishedAt: string;
  integrity: string;
  deprecated?: string;
}

export interface CardPackageIndex {
  name: string;
  versions: CardPackageIndexVersion[];
}

function nowIso() {
  return new Date().toISOString();
}

async function writeJson(pathValue: string, value: unknown) {
  mkdirSync(dirname(pathValue), { recursive: true });
  await writeFile(pathValue, `${JSON.stringify(value, null, 2)}\n`);
}

function assertNoLegacyLayout(agentsDir: string) {
  if (detectLegacyLayout(agentsDir)) {
    throw new Error("Legacy drwn layout detected. Run `drwn store migrate` before authoring or applying cards.");
  }
}

export async function ensureStoreInitialized(agentsDir: string) {
  const storeRoot = resolveStoreRoot(agentsDir);
  mkdirSync(storeRoot, { recursive: true });
  for (const pathValue of [
    resolveCardsRoot(agentsDir),
    resolveSourcesRoot(agentsDir),
    resolveStoreSkillsRoot(agentsDir),
    resolveStoreMcpServersDir(agentsDir),
    resolveStoreGeneratedDir(agentsDir),
    resolveStoreCacheDir(agentsDir),
  ]) {
    mkdirSync(pathValue, { recursive: true });
  }

  const metadataPath = resolveStoreMetadataPath(agentsDir);
  if (!existsSync(metadataPath)) {
    await writeJson(metadataPath, { schemaVersion: 1, initAt: nowIso() } satisfies StoreMetadata);
  }
  const machinePath = resolveMachineConfigPath(agentsDir);
  if (!existsSync(machinePath)) {
    await writeJson(machinePath, { version: 1, optional: {} });
  }
}

export async function readMachineConfig(agentsDir: string): Promise<MachineConfig> {
  await ensureStoreInitialized(agentsDir);
  return JSON.parse(await readFile(resolveMachineConfigPath(agentsDir), "utf8")) as MachineConfig;
}

export async function writeMachineConfig(agentsDir: string, config: MachineConfig) {
  await ensureStoreInitialized(agentsDir);
  await writeJson(resolveMachineConfigPath(agentsDir), config);
}

export function normalizeCardName(name: string, scope?: string) {
  if (isCardScopeName(name)) {
    return name;
  }
  if (!isCardUnscopedName(name)) {
    throw new Error(`Invalid card name: ${name}`);
  }
  if (!scope) {
    return name;
  }
  if (!/^@[a-z0-9-]+$/.test(scope)) {
    throw new Error(`Invalid card scope: ${scope}`);
  }
  return `${scope}/${name}`;
}

export function parseCardRef(ref: string): CardRef {
  if (ref.startsWith("file:")) {
    return { name: ref, range: "*", filePath: ref.slice("file:".length) };
  }
  const slashIndex = ref.indexOf("/");
  const rangeMarker = ref.lastIndexOf("@");
  if (ref.startsWith("@") && slashIndex !== -1 && rangeMarker > slashIndex) {
    return { name: ref.slice(0, rangeMarker), range: ref.slice(rangeMarker + 1) };
  }
  if (!ref.startsWith("@") && rangeMarker > 0) {
    return { name: ref.slice(0, rangeMarker), range: ref.slice(rangeMarker + 1) };
  }
  return { name: ref, range: "*" };
}

export function formatCardSpec(name: string, range: string) {
  return range === "*" ? name : `${name}@${range}`;
}

export function cardNamesEqual(refOrName: string, name: string) {
  return parseCardRef(refOrName).name === name;
}

export async function createCardSource(options: {
  agentsDir: string;
  name: string;
  scope?: string;
  noGit?: boolean;
}) {
  assertNoLegacyLayout(options.agentsDir);
  if (isCardUnscopedName(options.name) && !options.scope) {
    throw new Error("Unscoped card names require --scope or machine authoring.scope");
  }
  const fullName = normalizeCardName(options.name, options.scope);
  await ensureStoreInitialized(options.agentsDir);
  if (options.scope) {
    const machine = await readMachineConfig(options.agentsDir);
    machine.authoring = { ...(machine.authoring ?? {}), scope: options.scope };
    await writeMachineConfig(options.agentsDir, machine);
  }

  const sourceDir = resolveCardSourceDir(options.agentsDir, fullName);
  if (existsSync(join(sourceDir, "card.json"))) {
    throw new Error(`Card source already exists: ${fullName}`);
  }
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(join(sourceDir, "skills"), { recursive: true });
  mkdirSync(join(sourceDir, "mcp-servers"), { recursive: true });
  const manifest: CardManifest = {
    name: fullName,
    version: "1.0.0",
    description: "",
  };
  await writeJson(join(sourceDir, "card.json"), manifest);
  if (!options.noGit) {
    try {
      const proc = Bun.spawn(["git", "init"], { cwd: sourceDir, stdout: "pipe", stderr: "pipe" });
      await proc.exited;
    } catch {
      // Git initialization is best-effort; card files are still usable without it.
    }
  }
  return { name: fullName, sourceDir, manifestPath: join(sourceDir, "card.json") };
}

export async function readCardSourceManifest(agentsDir: string, name: string): Promise<CardManifest> {
  const manifestPath = join(resolveCardSourceDir(agentsDir, name), "card.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Card source not found: ${name}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CardManifest;
  assertValidCardManifest(manifest);
  if (manifest.name !== name) {
    throw new Error(`Card source manifest name mismatch: expected ${name}, got ${manifest.name}`);
  }
  return manifest;
}

function versionsIndexPath(agentsDir: string, name: string) {
  return join(resolveCardPackageDir(agentsDir, name), "versions.json");
}

export async function loadCardPackageIndex(agentsDir: string, name: string): Promise<CardPackageIndex> {
  const path = versionsIndexPath(agentsDir, name);
  if (!existsSync(path)) {
    return { name, versions: [] };
  }
  return JSON.parse(await readFile(path, "utf8")) as CardPackageIndex;
}

async function writeCardPackageIndex(agentsDir: string, index: CardPackageIndex) {
  const versions = [...index.versions].sort((a, b) => compareVersions(a.version, b.version));
  await writeJson(versionsIndexPath(agentsDir, index.name), { ...index, versions });
}

export async function readPublishedCardManifest(agentsDir: string, name: string, version: string): Promise<CardManifest> {
  const manifestPath = join(resolveCardVersionDir(agentsDir, name, version), "card.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Card version not found: ${name}@${version}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CardManifest;
  assertValidCardManifest(manifest);
  return manifest;
}

async function walkVersionTree(versionDir: string): Promise<Array<{ relPath: string; absPath: string; mode: number }>> {
  const entries: Array<{ relPath: string; absPath: string; mode: number }> = [];

  async function recurse(currentAbs: string, currentRel: string) {
    const dirEntries = await readdir(currentAbs, { withFileTypes: true });
    for (const dirent of dirEntries) {
      const relPath = currentRel ? `${currentRel}/${dirent.name}` : dirent.name;
      const absPath = join(currentAbs, dirent.name);
      if (relPath === ".integrity") {
        continue;
      }
      if (dirent.isDirectory()) {
        await recurse(absPath, relPath);
        continue;
      }
      if (!dirent.isFile() && !dirent.isSymbolicLink()) {
        continue;
      }
      const stats = await stat(absPath);
      if (stats.isFile()) {
        entries.push({ relPath, absPath, mode: stats.mode });
      }
    }
  }

  await recurse(versionDir, "");
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return entries;
}

export async function computeCardIntegrity(versionDir: string) {
  const entries = await walkVersionTree(versionDir);
  const records: Array<{ p: string; m: "x" | "-"; h: string }> = [];
  for (const entry of entries) {
    const content = await readFile(entry.absPath);
    const fileHash = createHash("sha256").update(content).digest("hex");
    records.push({
      p: entry.relPath,
      m: (entry.mode & 0o111) !== 0 ? "x" : "-",
      h: fileHash,
    });
  }
  const canonical = JSON.stringify(records);
  return `sha256-${createHash("sha256").update(canonical).digest("hex")}`;
}

function validatePublishedSkillDirs(versionDir: string, manifest: CardManifest) {
  for (const skillName of manifest.skills?.include ?? []) {
    const skillDir = join(versionDir, "skills", skillName);
    const skillMd = join(skillDir, "SKILL.md");
    if (!existsSync(skillDir)) {
      throw new Error(
        `Card ${manifest.name}@${manifest.version} is missing required skill directory '${skillName}'. The card must be republished from a complete source.`,
      );
    }
    if (!existsSync(skillMd)) {
      throw new Error(
        `Card ${manifest.name}@${manifest.version} is missing SKILL.md for required skill '${skillName}'. The card must be republished from a complete source.`,
      );
    }
  }
}

export async function publishCard(agentsDir: string, name: string) {
  assertNoLegacyLayout(agentsDir);
  await ensureStoreInitialized(agentsDir);
  const manifest = await readCardSourceManifest(agentsDir, name);
  const sourceDir = resolveCardSourceDir(agentsDir, manifest.name);
  for (const skillName of manifest.skills?.include ?? []) {
    const skillDir = join(sourceDir, "skills", skillName);
    const skillMd = join(skillDir, "SKILL.md");
    if (!existsSync(skillDir)) {
      throw new Error(
        `Card source is missing skill directory '${skillName}' declared in skills.include. Expected: ${skillDir}`,
      );
    }
    if (!existsSync(skillMd)) {
      throw new Error(`Card source skill '${skillName}' is missing SKILL.md. Expected: ${skillMd}`);
    }
  }
  const packagePath = join(resolveCardSourceDir(agentsDir, manifest.name), "package.json");
  if (existsSync(packagePath)) {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { name?: string; version?: string };
    if (packageJson.name !== manifest.name) {
      throw new Error(`package.json.name must equal card.json name: ${manifest.name}`);
    }
    if (packageJson.version !== manifest.version) {
      throw new Error(`package.json.version must equal card.json version: ${manifest.version}`);
    }
  }
  const versionDir = resolveCardVersionDir(agentsDir, manifest.name, manifest.version);
  if (existsSync(versionDir)) {
    throw new Error(`Card version already exists: ${manifest.name}@${manifest.version}`);
  }
  mkdirSync(dirname(versionDir), { recursive: true });
  await cp(resolveCardSourceDir(agentsDir, manifest.name), versionDir, {
    recursive: true,
    verbatimSymlinks: true,
    force: false,
  });
  validatePublishedSkillDirs(versionDir, manifest);
  const integrity = await computeCardIntegrity(versionDir);
  await writeFile(join(versionDir, ".integrity"), `${integrity}\n`);
  const index = await loadCardPackageIndex(agentsDir, manifest.name);
  index.versions = index.versions.filter((entry) => entry.version !== manifest.version);
  index.versions.push({ version: manifest.version, publishedAt: nowIso(), integrity });
  await writeCardPackageIndex(agentsDir, index);
  return { name: manifest.name, version: manifest.version, versionDir, integrity, manifest };
}

async function listPublishedVersions(agentsDir: string, name: string) {
  const packageDir = resolveCardPackageDir(agentsDir, name);
  if (!existsSync(packageDir)) {
    return [];
  }
  const entries = await readdir(packageDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && isStrictSemver(entry.name))
    .map((entry) => entry.name)
    .sort(compareVersions);
}

export async function resolveCard(agentsDir: string, ref: string): Promise<ResolvedCard> {
  assertNoLegacyLayout(agentsDir);
  const parsed = parseCardRef(ref);
  if (parsed.filePath) {
    const dir = resolve(parsed.filePath);
    const manifestPath = join(dir, "card.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`File card is missing card.json: ${parsed.filePath}`);
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CardManifest;
    assertValidCardManifest(manifest);
    validatePublishedSkillDirs(dir, manifest);
    return {
      name: manifest.name,
      requested: ref,
      version: manifest.version,
      dir,
      integrity: await computeCardIntegrity(dir),
      manifest,
    };
  }
  const versions = await listPublishedVersions(agentsDir, parsed.name);
  const range = parsed.range || "*";
  if (!validRange(range) && !isStrictSemver(range)) {
    throw new Error(`Invalid card version range: ${ref}`);
  }
  const version = maxSatisfying(versions, range) ?? (versions.includes(range) ? range : null);
  if (!version) {
    throw new Error(`No published version satisfies ${ref}`);
  }
  const manifest = await readPublishedCardManifest(agentsDir, parsed.name, version);
  const versionDir = resolveCardVersionDir(agentsDir, parsed.name, version);
  validatePublishedSkillDirs(versionDir, manifest);
  const computedIntegrity = await computeCardIntegrity(versionDir);
  const index = await loadCardPackageIndex(agentsDir, parsed.name);
  const recordedEntry = index.versions.find((entry) => entry.version === version);
  if (recordedEntry && recordedEntry.integrity !== computedIntegrity) {
    console.info(
      `[drwn] upgraded integrity hash for ${parsed.name}@${version}: was ${recordedEntry.integrity.slice(0, 20)}..., now ${computedIntegrity.slice(0, 20)}...`,
    );
    recordedEntry.integrity = computedIntegrity;
    await writeCardPackageIndex(agentsDir, index);
    await writeFile(join(versionDir, ".integrity"), `${computedIntegrity}\n`);
  } else if (!recordedEntry) {
    await writeFile(join(versionDir, ".integrity"), `${computedIntegrity}\n`);
  }
  return {
    name: parsed.name,
    requested: formatCardSpec(parsed.name, range),
    version,
    dir: versionDir,
    integrity: computedIntegrity,
    manifest,
  };
}

export async function listCards(agentsDir: string) {
  const root = resolveCardsRoot(agentsDir);
  if (!existsSync(root)) {
    return [];
  }
  const cards: Array<{ name: string; versions: string[] }> = [];
  const roots = await readdir(root, { withFileTypes: true });
  for (const entry of roots) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scopeDir = join(root, entry.name);
      for (const cardEntry of await readdir(scopeDir, { withFileTypes: true })) {
        if (cardEntry.isDirectory()) {
          const name = `${entry.name}/${cardEntry.name}`;
          cards.push({ name, versions: await listPublishedVersions(agentsDir, name) });
        }
      }
      continue;
    }
    if (entry.isDirectory()) {
      cards.push({ name: entry.name, versions: await listPublishedVersions(agentsDir, entry.name) });
    }
  }
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deprecateCardVersion(agentsDir: string, ref: string, message: string) {
  const resolved = await resolveCard(agentsDir, ref);
  const index = await loadCardPackageIndex(agentsDir, resolved.name);
  const version = index.versions.find((entry) => entry.version === resolved.version);
  if (!version) {
    throw new Error(`Card version not found: ${ref}`);
  }
  version.deprecated = message || "deprecated";
  await writeCardPackageIndex(agentsDir, index);
  return resolved;
}

export async function removeCardSourceForTests(agentsDir: string, name: string) {
  rmSync(resolveCardSourceDir(agentsDir, name), { recursive: true, force: true });
}

export function cardPathParts(name: string) {
  return splitCardName(name);
}

export function isNewerVersion(a: string, b: string) {
  return gt(a, b);
}
