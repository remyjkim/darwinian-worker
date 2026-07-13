// ABOUTME: Defines canonical semantic paths for optional Worker Mind state.
// ABOUTME: Strictly parses pool files before destructive lifecycle operations.

import { ulid } from "ulid";
import type { MemoryKind } from "../card-manifest";
import { DrwnError } from "../errors";

export const MEMORY_EXTENSIONS: Readonly<Record<MemoryKind, "jsonl" | "md">> = {
  observations: "jsonl",
  insights: "md",
};

export function mindRoot(mindId: string) {
  return `/minds/${mindId}`;
}

export function personaSeedPath(mindId: string) {
  return `${mindRoot(mindId)}/persona.md`;
}

export function beliefSeedPath(mindId: string, card: string, entry: string) {
  return `${mindRoot(mindId)}/beliefs/${card}/${entry}/BELIEF.md`;
}

export function mindIndexPath(mindId: string) {
  return `${mindRoot(mindId)}/mind.json`;
}

export function memoryKindRoot(mindId: string, kind: MemoryKind) {
  return `${mindRoot(mindId)}/memory/${kind}`;
}

export function newEntryId() {
  return ulid();
}

export function poolEntryPath(options: { kind: MemoryKind; now: Date; entryId: string }) {
  const iso = options.now.toISOString();
  const day = iso.slice(0, 10);
  const hhmm = `${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  return `/pool/${options.kind}/${day}/${hhmm}-${options.entryId}.${MEMORY_EXTENSIONS[options.kind]}`;
}

export interface CanonicalPoolPath {
  kind: MemoryKind;
  date: string;
  filename: string;
}

function isCalendarDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function invalidPoolPath(path: string): never {
  throw new DrwnError(
    "MIND_POOL_PATH_INVALID",
    `${path} is not a canonical semantic pool file`,
    ["Use /pool/observations or /pool/insights with a date-sharded HHmm-ULID filename."],
  );
}

export function parseCanonicalPoolPath(path: string): CanonicalPoolPath {
  const parts = path.split("/");
  if (parts.length !== 5 || parts[0] !== "" || parts[1] !== "pool") invalidPoolPath(path);
  const kind = parts[2];
  if (kind !== "observations" && kind !== "insights") invalidPoolPath(path);
  const date = parts[3]!;
  const filename = parts[4]!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isCalendarDate(date)) invalidPoolPath(path);
  const match = filename.match(/^(\d{2})(\d{2})-([0-9A-HJKMNP-TV-Z]{26})\.([a-z0-9]+)$/);
  if (!match) invalidPoolPath(path);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59 || match[4] !== MEMORY_EXTENSIONS[kind]) invalidPoolPath(path);
  return { kind, date, filename };
}

export function memoryViewPath(mindId: string, kind: MemoryKind, poolPath: string) {
  const parsed = parseCanonicalPoolPath(poolPath);
  if (parsed.kind !== kind) invalidPoolPath(poolPath);
  return `${memoryKindRoot(mindId, kind)}/by-date/${parsed.date}/${parsed.filename}`;
}
