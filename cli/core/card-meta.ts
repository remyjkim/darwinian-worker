// ABOUTME: Reads and writes distributable card metadata on refs/meta/cards.
// ABOUTME: Union-merges deprecations and successor pointers without force-clobber.

import * as git from "./git";

export const CARD_META_REF = "refs/meta/cards";
export const CARD_META_FILE = "metadata.json";

export interface CardMeta {
  deprecations?: Record<string, string>;
  successor?: string;
}

export function mergeCardMeta(base: CardMeta | null, incoming: CardMeta): CardMeta {
  const merged: CardMeta = {
    deprecations: { ...(base?.deprecations ?? {}) },
    ...(base?.successor ? { successor: base.successor } : {}),
  };
  if (incoming.deprecations) {
    merged.deprecations = { ...(merged.deprecations ?? {}), ...incoming.deprecations };
  }
  if (incoming.successor) {
    merged.successor = incoming.successor;
  }
  if (merged.deprecations && Object.keys(merged.deprecations).length === 0) {
    delete merged.deprecations;
  }
  return merged;
}

export async function readCardMeta(barePath: string): Promise<CardMeta | null> {
  try {
    await git.revParse(barePath, CARD_META_REF);
  } catch {
    return null;
  }
  try {
    const raw = await git.showBlob(barePath, `${CARD_META_REF}:${CARD_META_FILE}`);
    return JSON.parse(raw) as CardMeta;
  } catch {
    return null;
  }
}

export async function writeCardMeta(barePath: string, incoming: CardMeta): Promise<void> {
  const existing = await readCardMeta(barePath);
  const merged = mergeCardMeta(existing, incoming);
  const blobSha = await git.hashObject(barePath, `${JSON.stringify(merged, null, 2)}\n`);
  const treeSha = await git.mkTree(barePath, [{ mode: "100644", type: "blob", sha: blobSha, path: CARD_META_FILE }]);
  let parent: string | null = null;
  try {
    parent = await git.revParse(barePath, CARD_META_REF);
  } catch {
    parent = null;
  }
  const commitSha = await git.commitTree(barePath, treeSha, parent, "Update card metadata");
  await git.updateRef(barePath, CARD_META_REF, commitSha);
}

export function cardScopesMatch(left: string, right: string) {
  const leftScope = left.match(/^(@[^/]+)\//)?.[1];
  const rightScope = right.match(/^(@[^/]+)\//)?.[1];
  return leftScope !== undefined && leftScope === rightScope;
}

export function formatSuccessorSuggestion(cardName: string, meta: CardMeta | null, options?: { acceptSuccessor?: boolean }) {
  if (!meta?.successor) {
    return null;
  }
  if (cardScopesMatch(cardName, meta.successor)) {
    return `Successor available: ${meta.successor}. Run drwn apply ${meta.successor} to replace this Worker.`;
  }
  if (options?.acceptSuccessor) {
    return `Cross-scope successor accepted: ${meta.successor}. Run drwn apply ${meta.successor} to replace this Worker.`;
  }
  return `Successor claims ${meta.successor} (cross-scope). Re-run with --accept-successor or confirm via catalog before applying.`;
}

export async function readDeprecationMapFromMeta(barePath: string): Promise<Record<string, string>> {
  const meta = await readCardMeta(barePath);
  return meta?.deprecations ?? {};
}
