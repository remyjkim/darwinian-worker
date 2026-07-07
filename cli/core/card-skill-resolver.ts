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
  contentRoots?: Record<string, string>,
): Promise<ResolvedSkillSource> {
  for (let index = lockedCards.length - 1; index >= 0; index -= 1) {
    const card = lockedCards[index]!;
    if (!card.skills.includes(name)) {
      continue;
    }
    const root = contentRoots ? contentRoots[card.name] : card.path;
    if (!root) {
      return {
        layer: "missing",
        reason: contentRoots
          ? `no content root resolved for ${card.name} in project scope`
          : `card store is corrupt for ${card.name}@${card.version}: missing content root. Re-run \`drwn card update\` after republishing the card.`,
      };
    }
    const path = join(root, "skills", name);
    if (!existsSync(path)) {
      return {
        layer: "missing",
        reason: `card store is corrupt for ${card.name}@${card.version}: missing skills/${name}. Re-run \`drwn card update\` after republishing the card.`,
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
