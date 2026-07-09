// ABOUTME: Reads and writes the mind.json index and computes per-file drift states.
// ABOUTME: The ledger records what was seeded from which card version under which ETag; drift compares it to live state.

import type { MemoryManifest } from "../card-manifest";
import { mindIndexPath } from "./paths";
import type { MindDbClient } from "./client";

export interface LedgerRow {
  path: string;
  card: string;
  cardVersion: string;
  section: "persona" | "beliefs";
  entry: string;
  etag: string;
}

export interface MindIndex {
  schemaVersion: 1;
  mindId: string;
  activeWorkers: string[];
  persona: { path: string | null; entries: Array<{ card: string; entry: string }> };
  beliefs: { entries: Array<{ card: string; entry: string; path: string }> };
  memory: MemoryManifest;
  ledger: LedgerRow[];
  sources: Array<{ card: string; version: string; integrity: string }>;
  drwnVersion: string;
}

export type DriftState = "in-sync" | "db-edited" | "card-updated" | "missing";

export interface DriftRow {
  path: string;
  card: string;
  section: "persona" | "beliefs";
  entry: string;
  state: DriftState;
}

export async function readMindIndex(client: MindDbClient, mindId: string): Promise<MindIndex | null> {
  const file = await client.get(mindIndexPath(mindId));
  if (!file) {
    return null;
  }
  return JSON.parse(file.content) as MindIndex;
}

export async function writeMindIndex(client: MindDbClient, index: MindIndex): Promise<void> {
  await client.put(mindIndexPath(index.mindId), `${JSON.stringify(index, null, 2)}\n`);
}

export async function computeDrift(
  client: MindDbClient,
  index: MindIndex,
  currentCards: Array<{ name: string; version: string }>,
): Promise<DriftRow[]> {
  const versions = new Map(currentCards.map((card) => [card.name, card.version]));
  const anySourceChanged = index.sources.some(
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
