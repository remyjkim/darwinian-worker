// ABOUTME: Reads and writes the mind.json index and computes per-file drift states.
// ABOUTME: The ledger records what was seeded from which card version under which ETag; drift compares it to live state.

import { DrwnError } from "../errors";
import type { MindDbClient } from "./client";
import type { MindCardProvenance, MindIndex } from "./mind-index";
export { readMindIndex, writeMindIndex } from "./mind-index";
export type { LedgerRow, MindCardProvenance, MindIndex } from "./mind-index";

export function mindCardProvenance(
  cards: Array<{ name: string; version: string; integrity: string }>,
): { worker: MindCardProvenance; cards: MindCardProvenance[] } {
  const ordered = cards.map((card) => ({ card: card.name, version: card.version, integrity: card.integrity }));
  const worker = ordered[0];
  if (!worker) {
    throw new DrwnError("MIND_WORKER_REQUIRED", "Mind operations require one selected Worker closure");
  }
  return { worker, cards: ordered };
}

export type DriftState = "in-sync" | "db-edited" | "card-updated" | "missing";

export interface DriftRow {
  path: string;
  card: string;
  section: "persona" | "beliefs";
  entry: string;
  state: DriftState;
}

export async function computeDrift(
  client: MindDbClient,
  index: MindIndex,
  currentCards: Array<{ name: string; version: string }>,
): Promise<DriftRow[]> {
  const versions = new Map(currentCards.map((card) => [card.name, card.version]));
  const anySourceChanged = index.cards.some(
    (source) => versions.get(source.card) !== undefined && versions.get(source.card) !== source.version,
  );
  const rows: DriftRow[] = [];
  for (const row of index.ledger) {
    const live = await client.stat(row.path);
    let state: DriftState;
    const cardUpdated =
      row.card === "*" ? anySourceChanged : versions.get(row.card) !== undefined && versions.get(row.card) !== row.cardVersion;
    if (!live) {
      state = "missing";
    } else if (live.etag !== row.etag) {
      state = "db-edited";
    } else if (cardUpdated) {
      state = "card-updated";
    } else {
      state = "in-sync";
    }
    rows.push({ path: row.path, card: row.card, section: row.section, entry: row.entry, state });
  }
  return rows;
}
