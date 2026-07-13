// ABOUTME: Defines and validates the first supported namespaced Mind index.
// ABOUTME: Classifies prototype identity separately from malformed persisted state.

import { z } from "zod";
import { DrwnError } from "../errors";
import { mindIndexPath } from "./paths";
import type { MindDbClient } from "./client";

const nonEmpty = z.string().min(1);
const provenanceSchema = z.object({
  card: nonEmpty,
  version: nonEmpty,
  integrity: nonEmpty,
}).strict();
const personaEntrySchema = z.object({ card: nonEmpty, entry: nonEmpty }).strict();
const beliefEntrySchema = z.object({ card: nonEmpty, entry: nonEmpty, path: nonEmpty }).strict();
const ledgerRowSchema = z.object({
  path: nonEmpty,
  card: nonEmpty,
  cardVersion: nonEmpty,
  section: z.enum(["persona", "beliefs"]),
  entry: nonEmpty,
  etag: nonEmpty,
}).strict();
const memorySchema = z.object({
  observations: z.object({ format: z.literal("jsonl") }).strict().optional(),
  insights: z.object({ format: z.literal("md") }).strict().optional(),
}).strict();
const mindIndexSchema = z.object({
  schema: z.literal("drwn.mind-index"),
  schemaVersion: z.literal(1),
  mindId: nonEmpty,
  worker: provenanceSchema,
  cards: z.array(provenanceSchema),
  persona: z.object({ path: nonEmpty.nullable(), entries: z.array(personaEntrySchema) }).strict(),
  beliefs: z.object({ entries: z.array(beliefEntrySchema) }).strict(),
  memory: memorySchema,
  ledger: z.array(ledgerRowSchema),
  drwnVersion: nonEmpty,
}).strict();

export type MindIndex = z.infer<typeof mindIndexSchema>;
export type LedgerRow = MindIndex["ledger"][number];
export type MindCardProvenance = MindIndex["worker"];

function indexError(code: "MIND_INDEX_INVALID" | "MIND_INDEX_UNSUPPORTED", source: string, cause?: unknown) {
  const adjective = code === "MIND_INDEX_UNSUPPORTED" ? "Unsupported" : "Invalid";
  return new DrwnError(
    code,
    `${adjective} Mind index at ${source}; reset the disposable Mind state and reprovision it with drwn 0.9.0 or newer.`,
    ["Do not edit or translate the persisted index manually."],
    cause,
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

export function parseMindIndex(input: unknown, source = "<memory>"): MindIndex {
  if (!isRecord(input) || input.schema !== "drwn.mind-index" || input.schemaVersion !== 1) {
    throw indexError("MIND_INDEX_UNSUPPORTED", source);
  }
  const parsed = mindIndexSchema.safeParse(input);
  if (!parsed.success) throw indexError("MIND_INDEX_INVALID", source, parsed.error);
  return parsed.data;
}

export function parseMindIndexText(text: string, source = "<memory>"): MindIndex {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    throw indexError("MIND_INDEX_INVALID", source, error);
  }
  return parseMindIndex(input, source);
}

export async function readMindIndex(client: MindDbClient, mindId: string): Promise<MindIndex | null> {
  const path = mindIndexPath(mindId);
  const file = await client.get(path);
  return file ? parseMindIndexText(file.content, path) : null;
}

export async function writeMindIndex(client: MindDbClient, index: MindIndex): Promise<void> {
  const path = mindIndexPath(index.mindId);
  const validated = parseMindIndex(index, path);
  await client.put(path, `${JSON.stringify(validated, null, 2)}\n`);
}
