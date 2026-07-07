// ABOUTME: Resolves per-card materialization mode for vendored vs linked vs overlay paths.
// ABOUTME: Implements analysis 97 precedence including explicit project materialization.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import type { ConfigLocal } from "./config-local";
import { splitCardName } from "./store-paths";
import type { ProjectConfig } from "./types";

export type CardMaterializationMode = "vendored" | "linked" | "overlay";

export interface ModeResolutionContext {
  projectConfig?: ProjectConfig | null;
  configLocal?: ConfigLocal | null;
  cardsSourcePath?: string | null;
  invocationOverride?: CardMaterializationMode;
}

export interface ResolvedCardMode {
  mode: CardMaterializationMode;
  reason: string;
  vendorEligible: boolean;
  sourcePath?: string;
}

export function resolveCardSourcePath(cardsSourceRoot: string | null | undefined, cardName: string): string | null {
  if (!cardsSourceRoot || !existsSync(cardsSourceRoot)) {
    return null;
  }
  const parts = splitCardName(cardName);
  const candidate =
    parts.length === 2 ? join(cardsSourceRoot, parts[0]!, parts[1]!) : join(cardsSourceRoot, parts[0]!);
  if (existsSync(join(candidate, "card.json"))) {
    return candidate;
  }
  return null;
}

export function resolveMode(card: CardLockEntry, ctx: ModeResolutionContext): ResolvedCardMode {
  if (ctx.invocationOverride) {
    return {
      mode: ctx.invocationOverride,
      reason: "invocation override",
      vendorEligible: ctx.invocationOverride === "vendored",
    };
  }

  const overridePath = ctx.configLocal?.overrides?.[card.name];
  if (overridePath) {
    return {
      mode: "overlay",
      reason: `dev-linked override → ${overridePath}`,
      vendorEligible: false,
      sourcePath: overridePath.replace(/^file:/, ""),
    };
  }

  if (card.origin === "file") {
    return {
      mode: "overlay",
      reason: "file-origin card",
      vendorEligible: false,
      sourcePath: card.path,
    };
  }

  const explicit = ctx.projectConfig?.materialization;
  if (explicit === "vendored") {
    return { mode: "vendored", reason: "project materialization: vendored", vendorEligible: true };
  }
  if (explicit === "linked") {
    const sourcePath = resolveCardSourcePath(ctx.cardsSourcePath, card.name);
    if (sourcePath) {
      return {
        mode: "linked",
        reason: "project materialization: linked",
        vendorEligible: false,
        sourcePath,
      };
    }
    return {
      mode: "vendored",
      reason: "project materialization: linked but source absent; using vendored",
      vendorEligible: true,
    };
  }

  const autoSourcePath = resolveCardSourcePath(ctx.cardsSourcePath, card.name);
  if (autoSourcePath) {
    return {
      mode: "linked",
      reason: "CARDS_SOURCE_PATH present",
      vendorEligible: false,
      sourcePath: autoSourcePath,
    };
  }

  return { mode: "vendored", reason: "default vendored", vendorEligible: true };
}
