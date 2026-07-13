// ABOUTME: Defines audit record shapes and canonical hashing helpers.
// ABOUTME: Keeps tamper-evident log records stable across appends and verification.

import { createHash } from "node:crypto";

export type AuditRecordType = "attempt" | "outcome";

export interface AuditRecord {
  recordType: AuditRecordType;
  auditId: string;
  timestamp: string;
  sequence: number;
  prevHash: string | null;
  payload: Record<string, unknown>;
  hash: string;
}

export type AuditRecordWithoutHash = Omit<AuditRecord, "hash">;

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortValue(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(sortValue(value));
}

export function hashRecord(record: AuditRecordWithoutHash) {
  return `sha256-${createHash("sha256").update(canonicalJson(record)).digest("hex")}`;
}

export function withHash(record: AuditRecordWithoutHash): AuditRecord {
  return { ...record, hash: hashRecord(record) };
}
