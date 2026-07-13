// ABOUTME: Appends hash-chained JSONL audit records for bridge command attempts.
// ABOUTME: Verifies audit log integrity for operator review and tests.

import { chmod, mkdir, open, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ulid } from "ulid";
import { hashRecord, withHash, type AuditRecord, type AuditRecordWithoutHash } from "./record";

export interface AttemptPayload {
  rawCommand: string;
  parsedArgv?: string[];
  cwd?: string;
  envKeys: string[];
  reason?: string;
  shell: boolean;
}

export interface OutcomePayload {
  outcome: string;
  [key: string]: unknown;
}

function parseLines(text: string): AuditRecord[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AuditRecord);
}

async function readRecords(path: string): Promise<AuditRecord[]> {
  try {
    return parseLines(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export class AuditLog {
  constructor(private readonly path: string) {}

  private async ensureFile() {
    await mkdir(dirname(this.path), { recursive: true });
    const handle = await open(this.path, "a", 0o600);
    await handle.close();
    await chmod(this.path, 0o600);
  }

  private async append(recordType: "attempt" | "outcome", auditId: string, payload: Record<string, unknown>) {
    await this.ensureFile();
    const records = await readRecords(this.path);
    const last = records.at(-1);
    const record: AuditRecordWithoutHash = {
      recordType,
      auditId,
      timestamp: new Date().toISOString(),
      sequence: (last?.sequence ?? 0) + 1,
      prevHash: last?.hash ?? null,
      payload,
    };
    const hashed = withHash(record);
    await appendFile(this.path, `${JSON.stringify(hashed)}\n`, { mode: 0o600 });
    return hashed;
  }

  async beginAttempt(payload: AttemptPayload) {
    const auditId = ulid();
    await this.append("attempt", auditId, { ...payload });
    return auditId;
  }

  async finish(auditId: string, payload: OutcomePayload) {
    await this.append("outcome", auditId, { ...payload });
  }
}

export async function verifyAuditLog(path: string): Promise<{ ok: true; records: number } | { ok: false; records: number; reason: string }> {
  const records = await readRecords(path);
  let previousHash: string | null = null;
  let expectedSequence = 1;
  for (const record of records) {
    const { hash, ...withoutHash } = record;
    if (record.sequence !== expectedSequence) {
      return { ok: false, records: records.length, reason: `sequence mismatch at ${record.sequence}` };
    }
    if (record.prevHash !== previousHash) {
      return { ok: false, records: records.length, reason: `previous hash mismatch at ${record.sequence}` };
    }
    if (hashRecord(withoutHash) !== hash) {
      return { ok: false, records: records.length, reason: `hash mismatch at ${record.sequence}` };
    }
    previousHash = hash;
    expectedSequence += 1;
  }
  return { ok: true, records: records.length };
}
