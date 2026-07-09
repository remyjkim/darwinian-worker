// ABOUTME: Path conventions for minds and the shared memory pool in the owner filesystem.
// ABOUTME: Pool entries are date-sharded with HHmm-ulid filenames; memory views mirror pool filenames under the mind.

import { ulid } from "ulid";
import type { MemoryLayerName } from "../card-manifest";

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

export function memoryLayerRoot(mindId: string, layer: MemoryLayerName) {
  return `${mindRoot(mindId)}/memory/${layer}`;
}

const LAYER_EXTENSIONS: Partial<Record<MemoryLayerName, string>> = { l4: "md", l5: "jsonl" };

export function newEntryId() {
  return ulid();
}

export function poolEntryPath(options: { layer: MemoryLayerName; now: Date; entryId: string }) {
  const iso = options.now.toISOString();
  const day = iso.slice(0, 10);
  const hhmm = `${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  const extension = LAYER_EXTENSIONS[options.layer] ?? "md";
  return `/pool/${options.layer}/${day}/${hhmm}-${options.entryId}.${extension}`;
}

export function memoryViewPath(mindId: string, layer: MemoryLayerName, poolPath: string) {
  const parts = poolPath.split("/");
  const filename = parts.at(-1)!;
  const day = parts.at(-2)!;
  const dateDir = layer === "l5" ? `by-date/${day}` : day;
  return `${memoryLayerRoot(mindId, layer)}/${dateDir}/${filename}`;
}
