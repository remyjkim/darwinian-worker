// ABOUTME: Provides canonical hashing and drift checks for drwn-managed settings fields.
// ABOUTME: Keeps drift detection independent from formatting and key ordering.

import { createHash } from "node:crypto";

export interface DrwnMetaBlock {
  version: 1;
  managedKeys?: string[];
  fieldHashes?: Record<string, string>;
  ownedHooks?: OwnedHookEntries;
  lastWriteAt: string;
}

export type OwnedHookEntries = Record<string, Record<string, string>>;

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

export function readDrwnMetaBlock(parsed: Record<string, unknown>): DrwnMetaBlock | null {
  const meta = parsed._drwn;
  if (!meta || typeof meta !== "object") return null;
  const candidate = meta as Partial<DrwnMetaBlock>;
  if (candidate.version !== 1) return null;
  return candidate as DrwnMetaBlock;
}

export function hookEntryIdentity(_event: string, entry: { matcher?: unknown; hooks?: unknown[] }): string {
  if (typeof entry.matcher === "string" && entry.matcher.length > 0) {
    return `m:${entry.matcher}`;
  }
  const commandHook = entry.hooks?.[0] as { command?: unknown; args?: unknown } | undefined;
  const command = typeof commandHook?.command === "string" ? commandHook.command : "";
  const args = Array.isArray(commandHook?.args) ? ` ${commandHook.args.join(" ")}` : "";
  return `c:${command}${args}`;
}

export function hookEntryHash(entry: unknown) {
  return canonicalJsonHash(entry);
}

export function buildDrwnMetaBlock(
  fields: string[],
  values: Record<string, unknown>,
  ownedHooks?: OwnedHookEntries,
): DrwnMetaBlock {
  return {
    version: 1,
    managedKeys: fields,
    fieldHashes: Object.fromEntries(fields.map((field) => [field, canonicalJsonHash(values[field])])),
    ...(ownedHooks && Object.keys(ownedHooks).length > 0 ? { ownedHooks } : {}),
    lastWriteAt: new Date().toISOString(),
  };
}
