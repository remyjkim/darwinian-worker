// ABOUTME: Manages Git-backed card discovery catalogs.
// ABOUTME: Reads catalog.json from registered catalog repos for card search.

import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import {
  resolveCatalogPath,
  resolveCatalogsIndexPath,
  assertStoreWritable,
} from "./store-paths";
import { writeAtomically } from "./fs";
import * as git from "./git";
import type { CanonicalConfig } from "./types";
import { assertCatalogSourceTrusted, loadEffectiveTrustedSourcesPolicy } from "./trusted-sources";

/**
 * Schema served by a catalog repo at HEAD:catalog.json.
 *
 * Cards listed here have unscoped names; the catalog's `scope` field is the
 * implied scope. A card entry like `{ name: "baseline", url: "..." }` in a
 * `scope: "@team"` catalog resolves to `@team/baseline` for search results.
 */
export interface CatalogManifest {
  catalogVersion: 1;
  scope: string;
  description?: string;
  homepage?: string;
  cards: Array<{
    name: string;
    url: string;
    description?: string;
    tags?: string[];
  }>;
  maintainers?: Array<{ name: string; email?: string }>;
}

/**
 * Index entry recorded in ~/.agents/drwn/catalogs.json for each registered
 * catalog. The URL is the canonical identifier (must be unique). Scope is
 * denormalized for fast list/search.
 */
export interface CatalogIndexEntry {
  url: string;
  scope: string;
  path: string;
  lastFetched: string;
  cardCount: number;
}

export interface CatalogsIndex {
  catalogsVersion: 1;
  catalogs: CatalogIndexEntry[];
}

/**
 * A flattened search result: a card from any registered catalog with its scope
 * resolved into a fully-qualified name.
 */
export interface CardCatalogCard {
  name: string;
  scope: string;
  url: string;
  description?: string;
  tags?: string[];
  sourceCatalog: string;
}

export function resolveDefaultCommunityCatalogUrl(
  config: Pick<CanonicalConfig, "defaults"> | null | undefined,
): string | null {
  const value = config?.defaults?.communityCatalogUrl;
  if (value === undefined || value === null) return null;
  return value;
}

export async function loadCardCatalogIndex(agentsDir: string): Promise<CatalogsIndex> {
  const path = resolveCatalogsIndexPath(agentsDir);
  if (!existsSync(path)) {
    return { catalogsVersion: 1, catalogs: [] };
  }
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  return validateCatalogsIndex(parsed, path);
}

function validateCatalogsIndex(input: unknown, source: string): CatalogsIndex {
  if (
    typeof input !== "object" ||
    input === null ||
    (input as { catalogsVersion?: unknown }).catalogsVersion !== 1 ||
    !Array.isArray((input as { catalogs?: unknown }).catalogs)
  ) {
    throw new Error(`Invalid catalogs index at ${source}: expected catalogsVersion: 1`);
  }
  return input as CatalogsIndex;
}

export async function saveCardCatalogIndex(
  agentsDir: string,
  index: CatalogsIndex,
): Promise<void> {
  await writeAtomically(
    resolveCatalogsIndexPath(agentsDir),
    `${JSON.stringify(index, null, 2)}\n`,
  );
}

async function loadCatalogManifest(catalogRepoPath: string): Promise<CatalogManifest> {
  const text = await git.showBlob(catalogRepoPath, "HEAD:catalog.json");
  const parsed = JSON.parse(text) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { catalogVersion?: unknown }).catalogVersion !== 1 ||
    typeof (parsed as { scope?: unknown }).scope !== "string" ||
    !Array.isArray((parsed as { cards?: unknown }).cards)
  ) {
    throw new Error(
      "Invalid catalog.json: expected catalogVersion: 1, scope: string, cards: array",
    );
  }
  return parsed as CatalogManifest;
}

export async function addCardCatalog(
  agentsDir: string,
  url: string,
  options: { allowUntrustedSource?: boolean; repoRoot?: string; cwd?: string } = {},
): Promise<CatalogIndexEntry> {
  assertStoreWritable();
  if (!options.allowUntrustedSource) {
    const policy = await loadEffectiveTrustedSourcesPolicy({
      agentsDir,
      repoRoot: options.repoRoot,
      cwd: options.cwd,
    });
    assertCatalogSourceTrusted(url, policy);
  }
  const index = await loadCardCatalogIndex(agentsDir);
  if (index.catalogs.some((entry) => entry.url === url)) {
    throw new Error(`Card catalog already registered: ${url}`);
  }
  const path = resolveCatalogPath(agentsDir, url);
  await rm(path, { recursive: true, force: true });
  // Catalogs only need HEAD's catalog.json; shallow clone keeps the local cache small.
  await git.cloneBare(url, path, { depth: 1 });
  const manifest = await loadCatalogManifest(path);
  if (index.catalogs.some((entry) => entry.scope === manifest.scope)) {
    await rm(path, { recursive: true, force: true });
    throw new Error(
      `Card catalog scope already registered: ${manifest.scope} (use \`drwn catalog remove ${manifest.scope}\` first)`,
    );
  }
  const entry: CatalogIndexEntry = {
    url,
    scope: manifest.scope,
    path,
    lastFetched: new Date().toISOString(),
    cardCount: manifest.cards.length,
  };
  index.catalogs.push(entry);
  await saveCardCatalogIndex(agentsDir, index);
  return entry;
}

export async function removeCardCatalog(
  agentsDir: string,
  scopeOrUrl: string,
): Promise<void> {
  assertStoreWritable();
  const index = await loadCardCatalogIndex(agentsDir);
  const entry = index.catalogs.find(
    (candidate) => candidate.scope === scopeOrUrl || candidate.url === scopeOrUrl,
  );
  if (!entry) {
    throw new Error(`Card catalog not found: ${scopeOrUrl}`);
  }
  await rm(entry.path, { recursive: true, force: true });
  await saveCardCatalogIndex(agentsDir, {
    catalogsVersion: 1,
    catalogs: index.catalogs.filter((candidate) => candidate !== entry),
  });
}

export async function refreshCardCatalog(
  agentsDir: string,
  scopeFilter?: string,
): Promise<{ refreshed: CatalogIndexEntry[]; warnings: string[] }> {
  assertStoreWritable();
  const index = await loadCardCatalogIndex(agentsDir);
  const refreshed: CatalogIndexEntry[] = [];
  const warnings: string[] = [];
  for (const entry of index.catalogs) {
    if (scopeFilter && entry.scope !== scopeFilter) {
      continue;
    }
    try {
      await git.fetch(entry.path, "origin", ["+refs/heads/*:refs/heads/*"]);
      const manifest = await loadCatalogManifest(entry.path);
      entry.scope = manifest.scope;
      entry.cardCount = manifest.cards.length;
      entry.lastFetched = new Date().toISOString();
      refreshed.push(entry);
    } catch (error) {
      warnings.push(
        `failed to refresh ${entry.scope} (${entry.url}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  await saveCardCatalogIndex(agentsDir, index);
  return { refreshed, warnings };
}

export async function ensureDefaultCommunityCatalog(
  agentsDir: string,
  url: string | null,
): Promise<void> {
  if (!url) return;
  const index = await loadCardCatalogIndex(agentsDir);
  if (index.catalogs.some((entry) => entry.url === url)) {
    return;
  }
  try {
    await addCardCatalog(agentsDir, url);
  } catch (error) {
    // Fail-soft: the default catalog may not be reachable. Don't break `drwn init` over it.
    process.stderr.write(
      `drwn: could not register default community catalog (${url}): ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  }
}

export interface SearchCardCatalogsOptions {
  scope?: string;
}

export async function searchCardCatalogs(
  agentsDir: string,
  query: string,
  opts: SearchCardCatalogsOptions = {},
): Promise<{ results: CardCatalogCard[]; warnings: string[] }> {
  const index = await loadCardCatalogIndex(agentsDir);
  const results: CardCatalogCard[] = [];
  const warnings: string[] = [];
  const normalized = query.toLowerCase();
  for (const entry of index.catalogs) {
    if (opts.scope && entry.scope !== opts.scope) {
      continue;
    }
    if (!existsSync(entry.path)) {
      warnings.push(
        `card catalog ${entry.scope} (${entry.url}) is registered but its local clone is missing; run \`drwn catalog refresh ${entry.scope}\` to recover`,
      );
      continue;
    }
    try {
      const manifest = await loadCatalogManifest(entry.path);
      for (const card of manifest.cards) {
        const haystack = `${card.name} ${card.description ?? ""} ${(card.tags ?? []).join(" ")}`.toLowerCase();
        if (haystack.includes(normalized)) {
          results.push({
            name: card.name,
            scope: manifest.scope,
            url: card.url,
            description: card.description,
            tags: card.tags,
            sourceCatalog: entry.url,
          });
        }
      }
    } catch (error) {
      warnings.push(
        `card catalog ${entry.scope} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return { results, warnings };
}
