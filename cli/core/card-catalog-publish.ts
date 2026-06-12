// ABOUTME: Publishes already-versioned Harness Cards into Git-backed catalog manifests.
// ABOUTME: Keeps producer-side catalog authoring separate from local catalog registration/search.

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadCardCatalogIndex,
  refreshCardCatalog,
  type CatalogIndexEntry,
  type CatalogManifest,
} from "./card-catalog";
import { isCardUnscopedName } from "./card-manifest";
import { parseCardRef, resolveCard, type ResolvedCard } from "./card-store";
import { DrwnError } from "./errors";
import { writeAtomically } from "./fs";
import * as git from "./git";
import { resolveCardBareRepoPath } from "./store-paths";
import { assertCatalogSourceTrusted, loadEffectiveTrustedSourcesPolicy } from "./trusted-sources";

export type CatalogPublishMode = "local" | "direct";
export type CatalogPublishAction = "add" | "replace" | "noop";

export interface CatalogCardEntry {
  name: string;
  url: string;
  description?: string;
  tags?: string[];
}

export interface PublishCardToCatalogOptions {
  agentsDir: string;
  repoRoot?: string;
  cwd?: string;
  allowUntrustedSource?: boolean;
  cardRef: string;
  catalog: string;
  mode: CatalogPublishMode;
  name?: string;
  description?: string;
  tags?: string[];
  url?: string;
  replace?: boolean;
  dryRun?: boolean;
}

export interface PublishCardToCatalogResult {
  ok: boolean;
  mode: CatalogPublishMode;
  catalog: {
    input: string;
    scope: string;
    url?: string;
    path: string;
  };
  card: {
    requested: string;
    name: string;
    version: string;
    integrity: string;
    installUrl: string;
  };
  entry: CatalogCardEntry;
  action: CatalogPublishAction;
  changed: boolean;
  commit?: string;
  warnings: string[];
  next: string[];
}

interface ValidatedCatalogManifest extends Omit<CatalogManifest, "cards"> {
  cards: CatalogCardEntry[];
}

interface CatalogPublishTarget {
  input: string;
  catalogJsonPath: string;
  worktreeDir: string;
  url?: string;
  registered?: CatalogIndexEntry;
  temporaryRoot?: string;
}

function catalogError(code: string, message: string, hints?: string[]) {
  return new DrwnError(code, `${code}: ${message}`, hints);
}

export async function publishCardToCatalog(
  options: PublishCardToCatalogOptions,
): Promise<PublishCardToCatalogResult> {
  if (options.mode !== "local" && options.mode !== "direct") {
    throw catalogError("CATALOG_MODE_UNSUPPORTED", `unsupported catalog publish mode: ${options.mode}`);
  }

  if (!options.allowUntrustedSource && isGitUrl(options.catalog)) {
    const policy = await loadEffectiveTrustedSourcesPolicy({
      agentsDir: options.agentsDir,
      repoRoot: options.repoRoot,
      cwd: options.cwd,
    });
    assertCatalogSourceTrusted(options.catalog, policy);
  }
  const target = await resolveCatalogPublishTarget(options);
  try {
    if (options.mode === "direct") {
      await assertDirectCatalogWorktreeReady(target);
    }
    const manifest = await loadCatalogManifestFromPath(target.catalogJsonPath);
    const resolved = await resolveCardForCatalogPublish(options);
    const installUrl = await determineInstallUrl(options, resolved);
    await validateInstallUrl(installUrl);
    const built = buildCatalogEntry(resolved, installUrl, options, manifest.scope);
    const warnings = [...built.warnings];
    const upserted = upsertCatalogEntry(manifest, built.entry, options.replace === true);
    const nextManifest = {
      ...manifest,
      cards: upserted.cards,
    };
    let commit: string | undefined;
    if (!options.dryRun && upserted.changed) {
      await writeCatalogManifest(target.catalogJsonPath, nextManifest);
      if (options.mode === "direct") {
        commit = await commitAndPushCatalog(target, built.entry);
        if (target.registered) {
          warnings.push(...(await refreshRegisteredCatalog(options.agentsDir, target.registered.scope)));
        }
      }
    }
    return {
      ok: true,
      mode: options.mode,
      catalog: {
        input: options.catalog,
        scope: manifest.scope,
        ...(target.url ? { url: target.url } : {}),
        path: target.catalogJsonPath,
      },
      card: {
        requested: options.cardRef,
        name: resolved.name,
        version: resolved.version,
        integrity: resolved.integrity,
        installUrl,
      },
      entry: built.entry,
      action: upserted.action,
      changed: upserted.changed,
      ...(commit ? { commit } : {}),
      warnings,
      next: [
        `drwn library catalog refresh ${manifest.scope}`,
        `drwn search card ${built.entry.name} --scope ${manifest.scope}`,
      ],
    };
  } finally {
    if (target.temporaryRoot) {
      await rm(target.temporaryRoot, { recursive: true, force: true });
    }
  }
}

async function resolveCatalogPublishTarget(options: PublishCardToCatalogOptions): Promise<CatalogPublishTarget> {
  if (options.mode === "local") {
    const catalogJsonPath = resolveLocalCatalogPath(options.catalog);
    return {
      input: options.catalog,
      catalogJsonPath,
      worktreeDir: options.catalog,
    };
  }

  if (isCatalogScope(options.catalog)) {
    const index = await loadCardCatalogIndex(options.agentsDir);
    const entry = index.catalogs.find((candidate) => candidate.scope === options.catalog);
    if (!entry) {
      throw catalogError("CATALOG_TARGET_NOT_FOUND", `registered catalog scope not found: ${options.catalog}`);
    }
    return await cloneCatalogWorktree(options.catalog, entry.url, entry);
  }

  if (isGitUrl(options.catalog)) {
    return await cloneCatalogWorktree(options.catalog, options.catalog);
  }

  const catalogJsonPath = resolveLocalCatalogPath(options.catalog);
  return {
    input: options.catalog,
    catalogJsonPath,
    worktreeDir: options.catalog,
  };
}

async function cloneCatalogWorktree(input: string, url: string, registered?: CatalogIndexEntry): Promise<CatalogPublishTarget> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "drwn-card-catalog-publish-"));
  const worktreeDir = join(temporaryRoot, "catalog");
  try {
    await git.cloneWorktree(url, worktreeDir);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
  return {
    input,
    catalogJsonPath: join(worktreeDir, "catalog.json"),
    worktreeDir,
    url,
    ...(registered ? { registered } : {}),
    temporaryRoot,
  };
}

function resolveLocalCatalogPath(catalog: string) {
  if (!catalog) {
    throw catalogError("CATALOG_TARGET_NOT_FOUND", "catalog target is required");
  }
  const path = join(catalog, "catalog.json");
  if (!existsSync(path)) {
    throw catalogError("CATALOG_TARGET_NOT_FOUND", `catalog.json not found at ${path}`);
  }
  return path;
}

async function assertDirectCatalogWorktreeReady(target: CatalogPublishTarget): Promise<void> {
  const branch = await git.currentBranch(target.worktreeDir);
  if (!branch) {
    throw catalogError("CATALOG_BRANCH_UNRESOLVED", "catalog worktree is detached or has no current branch");
  }
  const status = await git.worktreeStatusPorcelain(target.worktreeDir);
  if (status) {
    throw catalogError(
      "CATALOG_WORKTREE_DIRTY",
      "catalog worktree has uncommitted changes; commit or stash them before direct publishing",
    );
  }
}

async function commitAndPushCatalog(target: CatalogPublishTarget, entry: CatalogCardEntry): Promise<string> {
  const branch = await git.currentBranch(target.worktreeDir);
  if (!branch) {
    throw catalogError("CATALOG_BRANCH_UNRESOLVED", "catalog worktree is detached or has no current branch");
  }
  await git.addWorktreePaths(target.worktreeDir, ["catalog.json"]);
  const status = await git.worktreeStatusPorcelain(target.worktreeDir);
  if (!status) {
    return await git.revParseWorktree(target.worktreeDir, "HEAD");
  }
  const commit = await git.commitWorktree(target.worktreeDir, `Publish ${entry.name} card to catalog`);
  await git.pushWorktreeHead(target.worktreeDir, "origin", branch);
  return commit;
}

async function refreshRegisteredCatalog(agentsDir: string, scope: string): Promise<string[]> {
  try {
    const result = await refreshCardCatalog(agentsDir, scope);
    return result.warnings;
  } catch (error) {
    if (error instanceof DrwnError && error.code === "STORE_READONLY") {
      return [`catalog ${scope} was published but local catalog cache refresh was skipped because the store is read-only`];
    }
    return [`catalog ${scope} was published but local catalog cache refresh failed: ${
      error instanceof Error ? error.message : String(error)
    }`];
  }
}

function isCatalogScope(value: string) {
  return /^@[a-z0-9-]+$/.test(value);
}

function isGitUrl(value: string) {
  return /^(git@|ssh:\/\/|https?:\/\/|file:\/\/)/.test(value);
}

async function loadCatalogManifestFromPath(catalogJsonPath: string): Promise<ValidatedCatalogManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(catalogJsonPath, "utf8"));
  } catch (error) {
    throw catalogError(
      "CATALOG_INVALID_MANIFEST",
      `failed to read ${catalogJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validateCatalogManifestForPublish(parsed);
}

export function validateCatalogManifestForPublish(input: unknown): ValidatedCatalogManifest {
  if (!isObject(input)) {
    throw catalogError("CATALOG_INVALID_MANIFEST", "catalog manifest must be an object");
  }
  if (input.catalogVersion !== 1) {
    throw catalogError("CATALOG_INVALID_MANIFEST", "catalogVersion must be 1");
  }
  if (typeof input.scope !== "string" || !/^@[a-z0-9-]+$/.test(input.scope)) {
    throw catalogError("CATALOG_INVALID_MANIFEST", "scope must be @scope");
  }
  if (!Array.isArray(input.cards)) {
    throw catalogError("CATALOG_INVALID_MANIFEST", "cards must be an array");
  }
  const seen = new Set<string>();
  const cards = input.cards.map((card, index) => validateCatalogCardEntry(card, index, seen));
  if (input.description !== undefined && typeof input.description !== "string") {
    throw catalogError("CATALOG_INVALID_MANIFEST", "description must be a string");
  }
  if (input.homepage !== undefined && typeof input.homepage !== "string") {
    throw catalogError("CATALOG_INVALID_MANIFEST", "homepage must be a string");
  }
  if (input.maintainers !== undefined) {
    if (!Array.isArray(input.maintainers)) {
      throw catalogError("CATALOG_INVALID_MANIFEST", "maintainers must be an array");
    }
    for (const [index, maintainer] of input.maintainers.entries()) {
      if (!isObject(maintainer) || typeof maintainer.name !== "string" || maintainer.name.length === 0) {
        throw catalogError("CATALOG_INVALID_MANIFEST", `maintainers[${index}].name must be a non-empty string`);
      }
      if (maintainer.email !== undefined && typeof maintainer.email !== "string") {
        throw catalogError("CATALOG_INVALID_MANIFEST", `maintainers[${index}].email must be a string`);
      }
    }
  }
  return {
    catalogVersion: 1,
    scope: input.scope,
    ...(typeof input.description === "string" ? { description: input.description } : {}),
    ...(typeof input.homepage === "string" ? { homepage: input.homepage } : {}),
    cards,
    ...(Array.isArray(input.maintainers) ? { maintainers: input.maintainers as Array<{ name: string; email?: string }> } : {}),
  };
}

function validateCatalogCardEntry(input: unknown, index: number, seen: Set<string>): CatalogCardEntry {
  if (!isObject(input)) {
    throw catalogError("CATALOG_INVALID_MANIFEST", `cards[${index}] must be an object`);
  }
  if (typeof input.name !== "string" || !isCardUnscopedName(input.name)) {
    throw catalogError("CATALOG_INVALID_MANIFEST", `cards[${index}].name must be an unscoped card name`);
  }
  if (seen.has(input.name)) {
    throw catalogError("CATALOG_INVALID_MANIFEST", `duplicate card name: ${input.name}`);
  }
  seen.add(input.name);
  if (typeof input.url !== "string" || input.url.length === 0) {
    throw catalogError("CATALOG_INVALID_MANIFEST", `cards[${index}].url must be a non-empty string`);
  }
  if (input.description !== undefined && typeof input.description !== "string") {
    throw catalogError("CATALOG_INVALID_MANIFEST", `cards[${index}].description must be a string`);
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || !input.tags.every((tag) => typeof tag === "string")) {
      throw catalogError("CATALOG_INVALID_MANIFEST", `cards[${index}].tags must be string[]`);
    }
  }
  return {
    name: input.name,
    url: input.url,
    ...(typeof input.description === "string" ? { description: input.description } : {}),
    ...(Array.isArray(input.tags) ? { tags: normalizeTags(input.tags as string[]) } : {}),
  };
}

async function resolveCardForCatalogPublish(options: PublishCardToCatalogOptions): Promise<ResolvedCard> {
  const { agentsDir, cardRef } = options;
  const parsed = parseCardRef(cardRef);
  if (parsed.origin === "git") {
    const tempRoot = await mkdtemp(join(tmpdir(), "drwn-card-catalog-card-"));
    try {
      return await withIsolatedStoreWritable(() =>
        resolveCard(join(tempRoot, ".agents"), cardRef, {
          allowUntrustedSource: options.allowUntrustedSource,
          repoRoot: options.repoRoot,
          cwd: options.cwd,
        }),
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
  return await resolveCard(agentsDir, cardRef, {
    allowUntrustedSource: options.allowUntrustedSource,
    repoRoot: options.repoRoot,
    cwd: options.cwd,
  });
}

async function determineInstallUrl(
  options: PublishCardToCatalogOptions,
  resolved: ResolvedCard,
): Promise<string> {
  if (options.url) {
    assertSupportedInstallUrl(options.url);
    return options.url;
  }
  if (resolved.git?.url) {
    return `git+${resolved.git.url}#v${resolved.version}`;
  }
  const barePath = resolveCardBareRepoPath(options.agentsDir, resolved.name);
  const originUrl = existsSync(barePath) ? await git.configGet(barePath, "drwn.originUrl") : null;
  if (!originUrl) {
    throw catalogError(
      "CATALOG_CARD_REMOTE_MISSING",
      `cannot infer installable catalog URL for ${resolved.name}@${resolved.version}; push the card to a Git remote first or pass --url`,
    );
  }
  return `git+${originUrl}#v${resolved.version}`;
}

async function validateInstallUrl(installUrl: string): Promise<void> {
  assertSupportedInstallUrl(installUrl);
  const tempRoot = await mkdtemp(join(tmpdir(), "drwn-card-catalog-url-"));
  try {
    await withIsolatedStoreWritable(() => resolveCard(join(tempRoot, ".agents"), installUrl));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function withIsolatedStoreWritable<T>(callback: () => Promise<T>): Promise<T> {
  const previous = process.env.DRWN_STORE_READONLY;
  delete process.env.DRWN_STORE_READONLY;
  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.DRWN_STORE_READONLY;
    } else {
      process.env.DRWN_STORE_READONLY = previous;
    }
  }
}

function assertSupportedInstallUrl(installUrl: string) {
  const parsed = parseCardRef(installUrl);
  if (parsed.origin !== "git") {
    throw catalogError("CATALOG_ENTRY_URL_INVALID", `catalog entry URL must be a git card ref: ${installUrl}`);
  }
}

function buildCatalogEntry(
  resolved: ResolvedCard,
  installUrl: string,
  options: PublishCardToCatalogOptions,
  catalogScope: string,
): { entry: CatalogCardEntry; warnings: string[] } {
  const name = options.name ?? unscopedName(resolved.name);
  if (!isCardUnscopedName(name)) {
    throw catalogError("CATALOG_ENTRY_NAME_INVALID", `invalid catalog entry name: ${name}`);
  }
  const description = options.description ?? resolved.manifest.description;
  const tags = normalizeTags(options.tags ?? []);
  const warnings: string[] = [];
  const catalogName = `${catalogScope}/${name}`;
  if (catalogName !== resolved.name) {
    warnings.push(`catalog entry ${catalogName} points to card manifest ${resolved.name}`);
  }
  return {
    entry: {
      name,
      url: installUrl,
      ...(description ? { description } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    },
    warnings,
  };
}

function upsertCatalogEntry(
  manifest: ValidatedCatalogManifest,
  entry: CatalogCardEntry,
  replace: boolean,
): { cards: CatalogCardEntry[]; action: CatalogPublishAction; changed: boolean } {
  const existing = manifest.cards.find((card) => card.name === entry.name);
  if (!existing) {
    return { cards: sortCards([...manifest.cards, entry]), action: "add", changed: true };
  }
  if (entriesEqual(existing, entry)) {
    return { cards: sortCards([...manifest.cards]), action: "noop", changed: false };
  }
  if (!replace) {
    throw catalogError(
      "CATALOG_DUPLICATE_CARD",
      `catalog already contains card "${entry.name}". Use --replace to update it.`,
    );
  }
  return {
    cards: sortCards(manifest.cards.map((card) => (card.name === entry.name ? entry : card))),
    action: "replace",
    changed: true,
  };
}

async function writeCatalogManifest(catalogJsonPath: string, manifest: ValidatedCatalogManifest): Promise<void> {
  await writeAtomically(catalogJsonPath, `${JSON.stringify({ ...manifest, cards: sortCards(manifest.cards) }, null, 2)}\n`);
}

function entriesEqual(a: CatalogCardEntry, b: CatalogCardEntry) {
  return JSON.stringify(normalizeEntry(a)) === JSON.stringify(normalizeEntry(b));
}

function normalizeEntry(entry: CatalogCardEntry): CatalogCardEntry {
  return {
    name: entry.name,
    url: entry.url,
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.tags && entry.tags.length > 0 ? { tags: normalizeTags(entry.tags) } : {}),
  };
}

function sortCards(cards: CatalogCardEntry[]) {
  return cards.map(normalizeEntry).sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeTags(tags: string[]) {
  return [...new Set(tags.filter(Boolean))].sort();
}

function unscopedName(name: string) {
  return name.startsWith("@") ? name.split("/")[1] ?? name : name;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
