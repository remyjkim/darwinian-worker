// ABOUTME: Single mapping from card mode to on-disk content roots for skills and workers.
// ABOUTME: Prevents skill and worker materialization paths from drifting apart.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import type { ResolvedCardMode } from "./mode-resolution";
import { resolveExtractedPath } from "./store-paths";
import { resolveProjectVendorTree } from "./vendor";

export function resolveCardContentRoot(options: {
  projectRoot: string;
  agentsDir: string;
  card: CardLockEntry;
  mode: ResolvedCardMode;
  allowPlanningFallback?: boolean;
}) {
  const { card, mode, projectRoot, agentsDir, allowPlanningFallback = false } = options;
  if (mode.mode === "overlay") {
    if (mode.sourcePath && existsSync(join(mode.sourcePath, "card.json"))) {
      return mode.sourcePath;
    }
    if (card.treeSha) {
      return resolveExtractedPath(agentsDir, card.treeSha);
    }
    return mode.sourcePath ?? card.path;
  }
  if (mode.mode === "linked") {
    if (mode.sourcePath && existsSync(join(mode.sourcePath, "card.json"))) {
      return mode.sourcePath;
    }
    if (!card.treeSha) {
      throw new Error(`card ${card.name} is missing treeSha required for vendored fallback`);
    }
    const vendorDir = resolveProjectVendorTree(projectRoot, card.name, card.treeSha);
    if (allowPlanningFallback) {
      if (existsSync(join(vendorDir, "card.json"))) {
        return vendorDir;
      }
      const extractedDir = resolveExtractedPath(agentsDir, card.treeSha);
      if (existsSync(join(extractedDir, "card.json"))) {
        return extractedDir;
      }
      if (existsSync(join(card.path, "card.json"))) {
        return card.path;
      }
    }
    return vendorDir;
  }
  if (!card.treeSha) {
    throw new Error(`card ${card.name} is missing treeSha required for vendored materialization`);
  }
  const vendorDir = resolveProjectVendorTree(projectRoot, card.name, card.treeSha);
  if (allowPlanningFallback) {
    if (existsSync(join(vendorDir, "card.json"))) {
      return vendorDir;
    }
    const extractedDir = resolveExtractedPath(agentsDir, card.treeSha);
    if (existsSync(join(extractedDir, "card.json"))) {
      return extractedDir;
    }
    if (existsSync(join(card.path, "card.json"))) {
      return card.path;
    }
  }
  return vendorDir;
}
