// ABOUTME: Seeds a mind's subtree from the composed card stack: fenced persona, belief copies, memory scaffolding.
// ABOUTME: Seeding happens once per mind (atomic creates); later card updates flow through sync, never re-seed.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MemoryManifest } from "../card-manifest";
import type { CardLockEntry } from "../card-lock";
import { DRWN_VERSION } from "../version";
import { composePersona } from "../mind-content/persona-composer";
import type { MindDbClient } from "./client";
import { readMindIndex, writeMindIndex, type LedgerRow, type MindIndex } from "./ledger";
import { beliefSeedPath, memoryLayerRoot, personaSeedPath } from "./paths";

export interface CardMindContent {
  name: string;
  version: string;
  integrity: string;
  persona: Array<{ entry: string; content: string }>;
  beliefs: Array<{ entry: string; content: string }>;
  memory: MemoryManifest;
}

export async function loadCardMindContent(card: CardLockEntry, contentRoot: string): Promise<CardMindContent> {
  const persona: CardMindContent["persona"] = [];
  for (const entry of card.manifest.persona?.include ?? []) {
    const path = join(contentRoot, "persona", entry, "PERSONA.md");
    if (existsSync(path)) {
      persona.push({ entry, content: await readFile(path, "utf8") });
    }
  }
  const beliefs: CardMindContent["beliefs"] = [];
  for (const entry of card.manifest.beliefs?.include ?? []) {
    const path = join(contentRoot, "beliefs", entry, "BELIEF.md");
    if (existsSync(path)) {
      beliefs.push({ entry, content: await readFile(path, "utf8") });
    }
  }
  return {
    name: card.name,
    version: card.version,
    integrity: card.integrity,
    persona,
    beliefs,
    memory: card.manifest.memory ?? {},
  };
}

export interface SeedResult {
  alreadyProvisioned: boolean;
  created: string[];
}

export async function seedMind(client: MindDbClient, mindId: string, cards: CardMindContent[]): Promise<SeedResult> {
  const existing = await readMindIndex(client, mindId);
  if (existing) {
    return { alreadyProvisioned: true, created: [] };
  }

  const created: string[] = [];
  const ledger: LedgerRow[] = [];

  const personaDocument = composePersona(cards.map((card) => ({ card: card.name, entries: card.persona })));
  let personaPath: string | null = null;
  if (personaDocument !== null) {
    personaPath = personaSeedPath(mindId);
    const { etag } = await client.put(personaPath, personaDocument, { ifNoneMatch: "*" });
    created.push(personaPath);
    // The composed persona spans cards; drift attribution uses index.sources, so card/version are wildcards here.
    ledger.push({ path: personaPath, card: "*", cardVersion: "*", section: "persona", entry: "*", etag });
  }

  const beliefEntries: MindIndex["beliefs"]["entries"] = [];
  for (const card of cards) {
    for (const { entry, content } of card.beliefs) {
      const path = beliefSeedPath(mindId, card.name, entry);
      const { etag } = await client.put(path, content, { ifNoneMatch: "*" });
      created.push(path);
      beliefEntries.push({ card: card.name, entry, path });
      ledger.push({ path, card: card.name, cardVersion: card.version, section: "beliefs", entry, etag });
    }
  }

  const memory: MemoryManifest = {};
  for (const card of cards) {
    for (const [layer, section] of Object.entries(card.memory) as Array<[keyof MemoryManifest, { format?: string }]>) {
      memory[layer] = { ...(section.format ? { format: section.format as never } : {}), ...memory[layer] };
      await client.mkdir(memoryLayerRoot(mindId, layer));
    }
  }

  const index: MindIndex = {
    schemaVersion: 1,
    mindId,
    activeWorkers: cards.map((card) => card.name),
    persona: {
      path: personaPath ? "persona.md" : null,
      entries: cards.flatMap((card) => card.persona.map(({ entry }) => ({ card: card.name, entry }))),
    },
    beliefs: { entries: beliefEntries },
    memory,
    ledger,
    sources: cards.map((card) => ({ card: card.name, version: card.version, integrity: card.integrity })),
    drwnVersion: DRWN_VERSION,
  };
  await writeMindIndex(client, index);
  return { alreadyProvisioned: false, created };
}
