// ABOUTME: Resolves skill names to their authoritative source: card store first, user-defaults second.
// ABOUTME: Single attribution authority shared by syncSkills, diagnostics, and dry-run planning.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import { findAvailableSkill, type SkillScope } from "./skills";

export type ResolvedSkillSource =
  | {
      layer: "card";
      cardName: string;
      cardVersion: string;
      path: string;
    }
  | {
      layer: "user-default";
      path: string;
      scope: SkillScope;
    }
  | {
      layer: "missing";
      reason: string;
    };

export async function resolveSkillSource(
  name: string,
  lockedCards: CardLockEntry[],
  repoRoot: string,
  agentsDir: string,
): Promise<ResolvedSkillSource> {
  for (const card of lockedCards) {
    if (!card.skills.includes(name)) {
      continue;
    }
    const path = join(card.path, "skills", name);
    if (!existsSync(path)) {
      return {
        layer: "missing",
        reason: `card store is corrupt for ${card.name}@${card.version}: missing skills/${name}. Re-run \`bgng card update\` after republishing the card.`,
      };
    }
    return {
      layer: "card",
      cardName: card.name,
      cardVersion: card.version,
      path,
    };
  }

  const userDefault = await findAvailableSkill(repoRoot, agentsDir, name);
  if (userDefault) {
    return {
      layer: "user-default",
      path: userDefault.path,
      scope: userDefault.scope,
    };
  }

  return {
    layer: "missing",
    reason: `skill '${name}' is not provided by any applied card and is not available as a user-default; check spelling or add a card that provides it.`,
  };
}
