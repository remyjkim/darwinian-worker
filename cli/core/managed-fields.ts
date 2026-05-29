// ABOUTME: Provides canonical hashing and drift checks for drwn-managed settings fields.
// ABOUTME: Keeps drift detection independent from formatting and key ordering.

import { createHash } from "node:crypto";

export interface BgngMetaBlock {
  version: 1;
  managedKeys?: string[];
  fieldHashes?: Record<string, string>;
  lastWriteAt: string;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function canonicalJsonHash(value: unknown) {
  return `sha256-${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

export function detectManagedFieldDrift(
  current: Record<string, unknown>,
  fields: string[],
  recordedHashes: Record<string, string>,
) {
  return fields.filter((field) => recordedHashes[field] && canonicalJsonHash(current[field]) !== recordedHashes[field]);
}

export function readBgngMetaBlock(parsed: Record<string, unknown>): BgngMetaBlock | null {
  const meta = parsed._bgng;
  if (!meta || typeof meta !== "object") return null;
  const candidate = meta as Partial<BgngMetaBlock>;
  if (candidate.version !== 1) return null;
  return candidate as BgngMetaBlock;
}

export function buildBgngMetaBlock(fields: string[], values: Record<string, unknown>): BgngMetaBlock {
  return {
    version: 1,
    managedKeys: fields,
    fieldHashes: Object.fromEntries(fields.map((field) => [field, canonicalJsonHash(values[field])])),
    lastWriteAt: new Date().toISOString(),
  };
}
