// ABOUTME: Resolves top-level Worker roots and their direct Card dependencies.
// ABOUTME: Preserves root/member order while rejecting ambiguous or recursive composition.

import type { CardLockEntry } from "./card-lock";
import { DrwnError } from "./errors";
import { resolveCard, type ResolveCardOptions } from "./card-store";
import { parseCardRef } from "./card-store";

export interface WorkerRootLockEntry {
  name: string;
  requested: string;
  kind: "card" | "blueprint";
  members: string[];
}

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

function sameLockedArtifact(left: CardLockEntry, right: CardLockEntry): boolean {
  return left.version === right.version && left.integrity === right.integrity && left.treeSha === right.treeSha;
}

export async function resolveWorkerGraph(
  agentsDir: string,
  specs: string[],
  options: ResolveCardOptions = {},
): Promise<ResolvedWorkerGraph> {
  const roots: WorkerRootLockEntry[] = [];
  const cards: CardLockEntry[] = [];
  const byName = new Map<string, CardLockEntry>();

  const addCard = (card: CardLockEntry) => {
    const previous = byName.get(card.name);
    if (!previous) {
      byName.set(card.name, card);
      cards.push(card);
      return;
    }
    if (!sameLockedArtifact(previous, card)) {
      throw new DrwnError(
        "WORKER_CARD_VERSION_CONFLICT",
        `Worker roots resolve ${card.name} to incompatible artifacts (${previous.version} and ${card.version})`,
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

export function graphFromCards(cards: CardLockEntry[]): ResolvedWorkerGraph {
  return {
    roots: cards.map((card) => ({
      name: card.name,
      requested: card.requested,
      kind: card.manifest.kind === "blueprint" ? "blueprint" : "card",
      members: [],
    })),
    cards,
  };
}

export function reconstructLegacyWorkerGraph(cards: CardLockEntry[], specs: string[]): ResolvedWorkerGraph {
  const byName = new Map(cards.map((card) => [card.name, card]));
  const roots: WorkerRootLockEntry[] = specs.map((spec) => {
    const name = parseCardRef(spec).name;
    const card = byName.get(name);
    if (!card) {
      throw new DrwnError("WORKER_ROOT_LOCK_MISSING", `Legacy lockfile does not contain configured Worker root ${name}`);
    }
    const members = card.manifest.kind === "blueprint"
      ? (card.manifest.composedFrom ?? []).map((memberSpec) => parseCardRef(memberSpec).name)
      : [];
    for (const member of members) {
      if (!byName.has(member)) {
        throw new DrwnError("WORKER_MEMBER_LOCK_MISSING", `Legacy lockfile does not contain ${name} member ${member}`);
      }
    }
    return {
      name,
      requested: card.requested,
      kind: card.manifest.kind === "blueprint" ? "blueprint" : "card",
      members,
    };
  });
  return { roots, cards };
}

export function overlayWorkerGraph(
  committed: ResolvedWorkerGraph,
  local: ResolvedWorkerGraph | null,
): ResolvedWorkerGraph {
  if (!local) return committed;
  const roots = new Map(committed.roots.map((root) => [root.name, root]));
  const cards = new Map(committed.cards.map((card) => [card.name, card]));
  for (const root of local.roots) roots.set(root.name, root);
  for (const card of local.cards) cards.set(card.name, card);
  return { roots: [...roots.values()], cards: [...cards.values()] };
}
