// ABOUTME: The card↔DB loop for seeded mind content: sync (rebase seeds onto pinned card versions),
// ABOUTME: diff (DB vs card per entry), and checkpoint (write DB edits back into card sources for review).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DrwnError } from "../errors";
import { composePersona, parsePersona } from "../mind-content/persona-composer";
import type { MindDbClient } from "./client";
import { mindCardProvenance, readMindIndex, writeMindIndex, type LedgerRow, type MindIndex } from "./ledger";
import { beliefSeedPath, personaSeedPath } from "./paths";
import type { CardMindContent } from "./seed";

function requireIndex(index: MindIndex | null, mindId: string): MindIndex {
  if (!index) {
    throw new DrwnError("MIND_NOT_PROVISIONED", `Mind ${mindId} is not provisioned; run: drwn worker mind provision`);
  }
  return index;
}

interface DesiredFile {
  path: string;
  content: string;
  card: string;
  cardVersion: string;
  section: "persona" | "beliefs";
  entry: string;
}

function ledgerRow(file: DesiredFile, etag: string): LedgerRow {
  return {
    path: file.path,
    card: file.card,
    cardVersion: file.cardVersion,
    section: file.section,
    entry: file.entry,
    etag,
  };
}

// Entries removed from a card are left in place in the DB (DB-wins philosophy); doctor surfaces staleness.
function desiredFiles(mindId: string, cards: CardMindContent[]): DesiredFile[] {
  const files: DesiredFile[] = [];
  const personaDocument = composePersona(cards.map((card) => ({ card: card.name, entries: card.persona })));
  if (personaDocument !== null) {
    files.push({ path: personaSeedPath(mindId), content: personaDocument, card: "*", cardVersion: "*", section: "persona", entry: "*" });
  }
  for (const card of cards) {
    for (const { entry, content } of card.beliefs) {
      files.push({ path: beliefSeedPath(mindId, card.name, entry), content, card: card.name, cardVersion: card.version, section: "beliefs", entry });
    }
  }
  return files;
}

export interface SyncResultMind {
  updated: string[];
  created: string[];
  skippedDrifted: string[];
  unchanged: string[];
}

export async function syncMind(
  client: MindDbClient,
  mindId: string,
  cards: CardMindContent[],
  options: { force?: boolean; dryRun?: boolean },
): Promise<SyncResultMind> {
  const provenance = mindCardProvenance(cards);
  const index = requireIndex(await readMindIndex(client, mindId), mindId);
  const ledgerByPath = new Map(index.ledger.map((row) => [row.path, row]));
  const result: SyncResultMind = { updated: [], created: [], skippedDrifted: [], unchanged: [] };
  const nextLedger: LedgerRow[] = [];

  for (const file of desiredFiles(mindId, cards)) {
    const row = ledgerByPath.get(file.path);
    if (!row) {
      if (!options.dryRun) {
        const { etag } = await client.put(file.path, file.content, { ifNoneMatch: "*" });
        nextLedger.push(ledgerRow(file, etag));
      }
      result.created.push(file.path);
      continue;
    }
    const live = await client.stat(file.path);
    const drifted = !live || live.etag !== row.etag;
    if (drifted && !options.force) {
      result.skippedDrifted.push(file.path);
      nextLedger.push(row);
      continue;
    }
    const current = await client.get(file.path);
    if (!drifted && current?.content === file.content) {
      result.unchanged.push(file.path);
      nextLedger.push(row);
      continue;
    }
    if (options.dryRun) {
      result.updated.push(file.path);
      nextLedger.push(row);
      continue;
    }
    const { etag } = options.force
      ? await client.put(file.path, file.content)
      : await client.put(file.path, file.content, { ifMatch: row.etag });
    result.updated.push(file.path);
    nextLedger.push(ledgerRow(file, etag));
  }

  if (!options.dryRun) {
    await writeMindIndex(client, {
      ...index,
      ...provenance,
      persona: {
        path: desiredFiles(mindId, cards).some((file) => file.section === "persona") ? "persona.md" : index.persona.path,
        entries: cards.flatMap((card) => card.persona.map(({ entry }) => ({ card: card.name, entry }))),
      },
      beliefs: {
        entries: cards.flatMap((card) => card.beliefs.map(({ entry }) => ({ card: card.name, entry, path: beliefSeedPath(mindId, card.name, entry) }))),
      },
      ledger: nextLedger,
    });
  }
  return result;
}

export interface MindDiffEntry {
  section: "persona" | "beliefs";
  card: string;
  entry: string;
  state: "same" | "changed" | "missing";
  dbContent?: string;
  cardContent?: string;
}

export interface MindDiff {
  entries: MindDiffEntry[];
  outsideFences: string[];
}

export async function diffMind(client: MindDbClient, mindId: string, cards: CardMindContent[]): Promise<MindDiff> {
  requireIndex(await readMindIndex(client, mindId), mindId);
  const entries: MindDiffEntry[] = [];
  let outsideFences: string[] = [];

  const livePersona = await client.get(personaSeedPath(mindId));
  const parsed = livePersona ? parsePersona(livePersona.content) : { sections: [], outsideFences: [] };
  outsideFences = parsed.outsideFences;
  for (const card of cards) {
    for (const { entry, content } of card.persona) {
      const section = parsed.sections.find((candidate) => candidate.card === card.name && candidate.entry === entry);
      if (!section) {
        entries.push({ section: "persona", card: card.name, entry, state: "missing", cardContent: content });
      } else {
        entries.push({
          section: "persona",
          card: card.name,
          entry,
          state: section.content === content ? "same" : "changed",
          ...(section.content === content ? {} : { dbContent: section.content, cardContent: content }),
        });
      }
    }
    for (const { entry, content } of card.beliefs) {
      const live = await client.get(beliefSeedPath(mindId, card.name, entry));
      if (!live) {
        entries.push({ section: "beliefs", card: card.name, entry, state: "missing", cardContent: content });
      } else {
        entries.push({
          section: "beliefs",
          card: card.name,
          entry,
          state: live.content === content ? "same" : "changed",
          ...(live.content === content ? {} : { dbContent: live.content, cardContent: content }),
        });
      }
    }
  }
  return { entries, outsideFences };
}

export interface CheckpointResult {
  written: string[];
  unchangedEntries: number;
}

export async function checkpointMind(
  client: MindDbClient,
  mindId: string,
  cards: CardMindContent[],
  options: { sourceDirs: Record<string, string> },
): Promise<CheckpointResult> {
  const diff = await diffMind(client, mindId, cards);
  if (diff.outsideFences.length > 0) {
    throw new DrwnError(
      "MIND_CHECKPOINT_UNMAPPED",
      `persona.md contains content outside provenance fences that cannot be attributed to a card entry:\n${diff.outsideFences.join("\n---\n")}`,
      ["Move the content inside an entry's fence (or remove it), then re-run checkpoint."],
    );
  }
  const written: string[] = [];
  let unchangedEntries = 0;
  for (const entry of diff.entries) {
    if (entry.state === "same" || entry.state === "missing" || entry.dbContent === undefined) {
      unchangedEntries += entry.state === "same" ? 1 : 0;
      continue;
    }
    const sourceDir = options.sourceDirs[entry.card];
    if (!sourceDir) {
      throw new DrwnError(
        "MIND_CHECKPOINT_NO_SOURCE",
        `No local card source for ${entry.card}; checkpoint needs the authoring source to write into.`,
        [`drwn card clone ${entry.card} (or fetch the source) and re-run checkpoint.`],
      );
    }
    const target =
      entry.section === "persona"
        ? join(sourceDir, "persona", entry.entry, "PERSONA.md")
        : join(sourceDir, "beliefs", entry.entry, "BELIEF.md");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, entry.dbContent);
    written.push(target);
  }
  return { written, unchangedEntries };
}
