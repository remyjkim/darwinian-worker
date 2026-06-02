// ABOUTME: Migrates legacy per-version card directories into Git-backed bare repos.
// ABOUTME: Verifies content integrity before removing old card directories.

import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertValidCardManifest } from "./card-manifest";
import { computeCardIntegrity, ensureExtracted } from "./card-store";
import * as git from "./git";
import { compareVersions, isStrictSemver } from "./semver-utils";
import { assertStoreWritable, resolveCardBareRepoPath, resolveCardsRoot } from "./store-paths";

export interface MigrateToGitOptions {
  agentsDir: string;
  dryRun?: boolean;
}

export interface MigrateToGitCardResult {
  name: string;
  versions: string[];
  bareRepoPath: string;
}

export interface MigrateToGitResult {
  dryRun: boolean;
  cards: MigrateToGitCardResult[];
  steps: string[];
  warnings: string[];
}

interface LegacyCardPackage {
  name: string;
  packageDir: string;
  bareRepoPath: string;
  versions: string[];
}

export async function migrateCardsToGit(options: MigrateToGitOptions): Promise<MigrateToGitResult> {
  const cards = await listLegacyCardPackages(options.agentsDir);
  const result: MigrateToGitResult = {
    dryRun: Boolean(options.dryRun),
    cards: cards.map((card) => ({ name: card.name, versions: card.versions, bareRepoPath: card.bareRepoPath })),
    steps: [],
    warnings: [],
  };
  if (options.dryRun) {
    result.steps.push(`would migrate ${cards.length} card package(s)`);
    return result;
  }
  if (cards.length > 0) {
    // Only enforce read-only when actual mutation would occur. dry-run remains
    // safe to call against a read-only store.
    assertStoreWritable();
  }

  for (const card of cards) {
    await migrateOneCard(options.agentsDir, card, result);
  }
  if (cards.length === 0) {
    result.steps.push("no per-version card directories detected");
  }
  return result;
}

async function migrateOneCard(agentsDir: string, card: LegacyCardPackage, result: MigrateToGitResult) {
  if (existsSync(card.bareRepoPath)) {
    throw new Error(`cannot migrate ${card.name}: bare repo already exists at ${card.bareRepoPath}`);
  }
  const tmpRepo = `${card.bareRepoPath}.tmp`;
  await rm(tmpRepo, { recursive: true, force: true });
  await git.initBare(tmpRepo);
  await git.configSet(tmpRepo, "drwn.cardName", card.name);
  let parent: string | null = null;

  for (const version of card.versions) {
    const versionDir = join(card.packageDir, version);
    const manifest = JSON.parse(await readFile(join(versionDir, "card.json"), "utf8"));
    assertValidCardManifest(manifest);
    if (manifest.name !== card.name || manifest.version !== version) {
      throw new Error(`manifest mismatch while migrating ${card.name}@${version}`);
    }
    const expectedIntegrity = await readRecordedIntegrity(card.packageDir, versionDir, version);
    const actualLegacyIntegrity = await computeCardIntegrity(versionDir);
    if (expectedIntegrity && expectedIntegrity !== actualLegacyIntegrity) {
      throw new Error(
        `integrity mismatch for ${card.name}@${version}: expected ${expectedIntegrity}, got ${actualLegacyIntegrity}`,
      );
    }

    const stagedSource = join(dirname(tmpRepo), `.migrate-${card.name.replace(/[\\/]/g, "_")}-${version}`);
    await rm(stagedSource, { recursive: true, force: true });
    await cp(versionDir, stagedSource, { recursive: true, verbatimSymlinks: true, force: true });
    await rm(join(stagedSource, ".integrity"), { force: true });
    const treeSha = await git.writeTreeFromDir(tmpRepo, stagedSource);
    const extractedDir = await ensureExtracted(agentsDir, tmpRepo, treeSha);
    const migratedIntegrity = await computeCardIntegrity(extractedDir);
    if (expectedIntegrity && expectedIntegrity !== migratedIntegrity) {
      throw new Error(`integrity mismatch after migration for ${card.name}@${version}`);
    }
    const commit = await git.commitTree(tmpRepo, treeSha, parent, `Migrate ${card.name}@${version}\n\nIntegrity: ${migratedIntegrity}`);
    await git.updateRef(tmpRepo, "refs/heads/main", commit);
    await git.createAnnotatedTag(tmpRepo, `v${version}`, commit, `Migrate ${card.name}@${version}`);
    parent = commit;
    await rm(stagedSource, { recursive: true, force: true });
  }

  await mkdir(dirname(card.bareRepoPath), { recursive: true });
  await rename(tmpRepo, card.bareRepoPath);
  await rm(card.packageDir, { recursive: true, force: true });
  result.steps.push(`migrated ${card.name} (${card.versions.join(", ")})`);
}

async function listLegacyCardPackages(agentsDir: string): Promise<LegacyCardPackage[]> {
  const root = resolveCardsRoot(agentsDir);
  if (!existsSync(root)) {
    return [];
  }
  const cards: LegacyCardPackage[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scopeDir = join(root, entry.name);
      for (const cardEntry of await readdir(scopeDir, { withFileTypes: true })) {
        if (!cardEntry.isDirectory() || cardEntry.name.endsWith(".git")) continue;
        const name = `${entry.name}/${cardEntry.name}`;
        const packageDir = join(scopeDir, cardEntry.name);
        const versions = await listLegacyVersions(packageDir);
        if (versions.length > 0) {
          cards.push({ name, packageDir, versions, bareRepoPath: resolveCardBareRepoPath(agentsDir, name) });
        }
      }
      continue;
    }
    if (entry.isDirectory() && !entry.name.endsWith(".git")) {
      const packageDir = join(root, entry.name);
      const versions = await listLegacyVersions(packageDir);
      if (versions.length > 0) {
        cards.push({ name: entry.name, packageDir, versions, bareRepoPath: resolveCardBareRepoPath(agentsDir, entry.name) });
      }
    }
  }
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

async function listLegacyVersions(packageDir: string) {
  const entries = await readdir(packageDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && isStrictSemver(entry.name))
    .map((entry) => entry.name)
    .sort(compareVersions);
}

async function readRecordedIntegrity(packageDir: string, versionDir: string, version: string) {
  const integrityPath = join(versionDir, ".integrity");
  if (existsSync(integrityPath)) {
    return (await readFile(integrityPath, "utf8")).trim();
  }
  const indexPath = join(packageDir, "versions.json");
  if (existsSync(indexPath)) {
    const parsed = JSON.parse(await readFile(indexPath, "utf8")) as { versions?: Array<{ version: string; integrity?: string }> };
    return parsed.versions?.find((entry) => entry.version === version)?.integrity ?? null;
  }
  return null;
}
