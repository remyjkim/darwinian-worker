// ABOUTME: Validates upstream card catalog JSON against the shared schema package.
// ABOUTME: Powers drwn catalog validate and the reusable GitHub validation action.

import { UpstreamCatalogSchema, type UpstreamCatalog } from "drwn-catalog-schema";
import { ZodError } from "zod";
import { basename } from "node:path";
import { resolveCard, type ResolveCardOptions } from "./card-store";

export type CatalogValidationResult =
  | { ok: true; catalog: UpstreamCatalog; errors?: never }
  | { ok: false; errors: string[]; catalog?: never };

export interface CatalogDeepValidationOptions extends ResolveCardOptions {
  agentsDir: string;
}

export function validateCatalogJson(input: unknown): CatalogValidationResult {
  try {
    return { ok: true, catalog: UpstreamCatalogSchema.parse(input) };
  } catch (error) {
    return { ok: false, errors: formatCatalogValidationError(error) };
  }
}

export async function validateCatalogDeep(
  catalog: UpstreamCatalog,
  options: CatalogDeepValidationOptions,
): Promise<CatalogValidationResult> {
  const errors: string[] = [];
  for (const card of catalog.cards) {
    try {
      const resolved = await resolveCard(options.agentsDir, card.url, {
        allowUntrustedSource: options.allowUntrustedSource,
        repoRoot: options.repoRoot,
        cwd: options.cwd,
      });
      const resolvedName = basename(resolved.manifest.name);
      if (resolvedName !== card.name) {
        errors.push(
          `cards.${card.name}: resolved card name ${resolved.manifest.name} does not match catalog entry ${catalog.scope}/${card.name}`,
        );
      }
    } catch (error) {
      errors.push(
        `cards.${card.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, catalog };
}

function formatCatalogValidationError(error: unknown): string[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "catalog";
      return `${path}: ${issue.message}`;
    });
  }
  return [error instanceof Error ? error.message : String(error)];
}
