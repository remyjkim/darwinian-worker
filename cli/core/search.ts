// ABOUTME: Composes local inventory and configured catalog results for discovery commands.
// ABOUTME: Keeps add/search commands aligned on source ordering and filtering semantics.

import { searchMcpCatalog, searchNpmSkillCatalog, type CatalogSearchResult } from "./catalogs";
import { listLibraryMcpServers, listLibrarySkills, type LibraryMcpServer, type LibrarySkill } from "./library";
import type { CanonicalConfig } from "./types";

export type SearchResult =
  | (LibrarySkill & { sourceGroup: "library"; title: string })
  | (LibraryMcpServer & { sourceGroup: "library"; title: string; description?: string })
  | (CatalogSearchResult & { sourceGroup: "catalog" });

export interface SearchResponse {
  results: SearchResult[];
  warnings: string[];
}

function matches(query: string, ...values: Array<string | undefined>) {
  const normalized = query.toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

export async function searchSkills(options: {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  config: CanonicalConfig;
  query: string;
  libraryOnly?: boolean;
  catalogOnly?: boolean;
  env?: Record<string, string | undefined>;
}): Promise<SearchResponse> {
  const results: SearchResult[] = [];
  const warnings: string[] = [];

  if (!options.catalogOnly) {
    const local = await listLibrarySkills(options.repoRoot, options.agentsDir, options.homeDir);
    results.push(
      ...local
        .filter((skill) => matches(options.query, skill.id, skill.sourceId))
        .map((skill) => ({ ...skill, sourceGroup: "library" as const, title: skill.id })),
    );
  }

  if (!options.libraryOnly) {
    const catalog = await searchNpmSkillCatalog(options.query, options.config, options.env);
    results.push(...catalog.results.map((result) => ({ ...result, sourceGroup: "catalog" as const })));
    warnings.push(...catalog.warnings);
  }

  return { results, warnings };
}

export async function searchMcp(options: {
  repoRoot: string;
  agentsDir?: string;
  config: CanonicalConfig;
  query: string;
  libraryOnly?: boolean;
  catalogOnly?: boolean;
}): Promise<SearchResponse> {
  const results: SearchResult[] = [];
  const warnings: string[] = [];

  if (!options.catalogOnly) {
    const local = await listLibraryMcpServers(options.repoRoot, options.agentsDir);
    results.push(
      ...local
        .filter((server) => matches(options.query, server.id, server.server.description))
        .map((server) => ({
          ...server,
          sourceGroup: "library" as const,
          title: server.id,
          description: server.server.description,
        })),
    );
  }

  if (!options.libraryOnly) {
    const catalog = await searchMcpCatalog(options.query, options.config);
    results.push(...catalog.results.map((result) => ({ ...result, sourceGroup: "catalog" as const })));
    warnings.push(...catalog.warnings);
  }

  return { results, warnings };
}
