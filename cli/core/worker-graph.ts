// ABOUTME: Resolves top-level Worker roots and their direct Card dependencies.
// ABOUTME: Preserves root/member order while rejecting ambiguous or recursive composition.

import type { CardLockEntry, WorkerRootLockEntry } from "./card-lock";
import { resolveCard, type ResolveCardOptions } from "./card-store";
import { DrwnError } from "./errors";

export interface ResolvedWorkerGraph {
  roots: WorkerRootLockEntry[];
  cards: CardLockEntry[];
}

type ResolvedCard = Awaited<ReturnType<typeof resolveCard>>;

function toCardLockEntry(card: ResolvedCard): CardLockEntry {
  return {
    name: card.name,
    requested: card.requested,
    version: card.version,
    path: card.dir,
    integrity: card.integrity,
    ...(card.treeSha ? { treeSha: card.treeSha } : {}),
    manifest: card.manifest,
    skills: card.manifest.skills?.include ?? [],
    hooks: card.manifest.hooks?.include ?? [],
    ...(card.manifest.persona ? { persona: card.manifest.persona } : {}),
    ...(card.manifest.beliefs ? { beliefs: card.manifest.beliefs } : {}),
    ...(card.manifest.memory ? { memory: card.manifest.memory } : {}),
    registry: null,
    origin: card.origin,
    ...(card.git ? { git: card.git } : {}),
  };
}

function sameArtifact(left: CardLockEntry, right: CardLockEntry): boolean {
  return left.version === right.version && left.integrity === right.integrity && left.treeSha === right.treeSha;
}

export async function resolveWorkerGraph(
  agentsDir: string,
  specs: string[],
  options: ResolveCardOptions = {},
): Promise<ResolvedWorkerGraph> {
  const roots: WorkerRootLockEntry[] = [];
  const cards: CardLockEntry[] = [];
  const cardsByName = new Map<string, CardLockEntry>();

  const addCard = (card: CardLockEntry) => {
    const existing = cardsByName.get(card.name);
    if (!existing) {
      cardsByName.set(card.name, card);
      cards.push(card);
      return;
    }
    if (!sameArtifact(existing, card)) {
      throw new DrwnError(
        "WORKER_CARD_VERSION_CONFLICT",
        `Worker roots resolve ${card.name} to incompatible artifacts (${existing.version} and ${card.version})`,
      );
    }
  };

  for (const spec of specs) {
    const rootCard = toCardLockEntry(await resolveCard(agentsDir, spec, options));
    if (roots.some((root) => root.name === rootCard.name)) {
      throw new DrwnError("WORKER_ROOT_DUPLICATE", `Worker root ${rootCard.name} is declared more than once`);
    }
    addCard(rootCard);

    const members: string[] = [];
    if (rootCard.manifest.kind === "blueprint") {
      for (const memberSpec of rootCard.manifest.composedFrom ?? []) {
        const member = toCardLockEntry(await resolveCard(agentsDir, memberSpec, options));
        if (member.manifest.kind === "blueprint") {
          throw new DrwnError(
            "BLUEPRINT_MEMBER_IS_BLUEPRINT",
            `Blueprint ${rootCard.name} cannot compose Blueprint ${member.name}; only plain Cards may be members`,
          );
        }
        if (members.includes(member.name)) {
          throw new DrwnError(
            "WORKER_MEMBER_DUPLICATE",
            `Blueprint ${rootCard.name} declares member ${member.name} more than once`,
          );
        }
        addCard(member);
        members.push(member.name);
      }
    }

    roots.push({
      name: rootCard.name,
      requested: rootCard.requested,
      kind: rootCard.manifest.kind === "blueprint" ? "blueprint" : "card",
      members,
    });
  }

  return { roots, cards };
}
