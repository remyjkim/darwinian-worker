// ABOUTME: Builds human-readable content summaries for card apply and update flows.
// ABOUTME: Surfaces skills, MCP servers, and hook consent for operator trust review.

import type { CardLockEntry } from "./card-lock";
import { diffCards } from "./card-diff";
import type { CardManifest } from "./card-manifest";

function skillDescription(manifest: CardManifest, skillName: string) {
  return skillName;
}

export function buildApplyContentSummary(card: CardLockEntry, previous: CardLockEntry | null): string {
  const lines: string[] = ["Content summary:"];
  const manifest = card.manifest;
  const previousManifest = previous?.manifest ?? null;

  if (previousManifest) {
    const diff = diffCards(previousManifest, manifest);
    const skillChanges = diff.changes.filter((change) => change.path.startsWith("skills.include."));
    if (skillChanges.length > 0) {
      lines.push("Skills changed:");
      for (const change of skillChanges) {
        if (change.kind === "added") {
          lines.push(`  + ${String(change.after)}`);
        } else if (change.kind === "removed") {
          lines.push(`  - ${String(change.before)}`);
        }
      }
    }
  }

  const skills = manifest.skills?.include ?? card.skills;
  if (skills.length > 0 && !previousManifest) {
    lines.push("Skills:");
    for (const skill of skills) {
      lines.push(`  - ${skillDescription(manifest, skill)}`);
    }
  } else if (skills.length > 0 && previousManifest && !diffCards(previousManifest, manifest).changes.some((c) => c.path.startsWith("skills.include."))) {
    lines.push("Skills:");
    for (const skill of skills) {
      lines.push(`  - ${skillDescription(manifest, skill)}`);
    }
  }

  const serverNames = Object.keys(manifest.servers ?? {});
  if (serverNames.length > 0) {
    lines.push("MCP servers:");
    for (const name of serverNames.sort()) {
      lines.push(`  - ${name} (review headers/secrets in card source before trusting)`);
    }
  }

  if ((manifest.hooks?.include ?? card.hooks).length > 0) {
    lines.push(`Hooks: ${(manifest.hooks?.include ?? card.hooks).join(", ")}`);
    lines.push("Hook consent: review card hooks and run drwn card trust <card> --hooks before enabling.");
  }

  if (lines.length === 1) {
    lines.push("  (no bundled skills, servers, or hooks)");
  }

  return lines.join("\n");
}

export function buildApplySummaries(cards: CardLockEntry[], previousCards: CardLockEntry[]) {
  const previousByName = new Map(previousCards.map((card) => [card.name, card]));
  return cards.map((card) => buildApplyContentSummary(card, previousByName.get(card.name) ?? null));
}
