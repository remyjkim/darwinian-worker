// ABOUTME: Verifies append-only audit logging and hash-chain integrity.
// ABOUTME: Ensures command attempts are recorded before execution outcomes.

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, verifyAuditLog } from "../src/audit/log";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "drwn-command-bridge-audit-"));
  roots.push(root);
  return root;
}

describe("AuditLog", () => {
  test("beginAttempt creates a mode 600 audit file and appends an attempt", async () => {
    const root = await tempRoot();
    const path = join(root, "logs", "audit.jsonl");
    const audit = new AuditLog(path);

    const auditId = await audit.beginAttempt({
      rawCommand: "git status",
      parsedArgv: ["git", "status"],
      cwd: root,
      envKeys: ["CI"],
      reason: "check repo",
      shell: false,
    });

    const info = await stat(path);
    if (process.platform !== "win32") {
      expect(info.mode & 0o777).toBe(0o600);
    }
    const records = (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(auditId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ recordType: "attempt", auditId, sequence: 1 });
    expect(records[0].payload.envKeys).toEqual(["CI"]);
    expect(records[0].hash).toStartWith("sha256-");
  });

  test("finish appends an outcome with the same audit id", async () => {
    const root = await tempRoot();
    const path = join(root, "audit.jsonl");
    const audit = new AuditLog(path);
    const auditId = await audit.beginAttempt({ rawCommand: "git status", cwd: root, envKeys: [], shell: false });

    await audit.finish(auditId, { outcome: "completed", exitCode: 0, timedOut: false });

    const records = (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ recordType: "outcome", auditId, sequence: 2 });
    expect(records[1].prevHash).toBe(records[0].hash);
  });

  test("verifies hash chains and detects tampering", async () => {
    const root = await tempRoot();
    const path = join(root, "audit.jsonl");
    const audit = new AuditLog(path);
    const auditId = await audit.beginAttempt({ rawCommand: "git status", cwd: root, envKeys: [], shell: false });
    await audit.finish(auditId, { outcome: "completed", exitCode: 0, timedOut: false });

    await expect(verifyAuditLog(path)).resolves.toEqual({ ok: true, records: 2 });

    const lines = (await readFile(path, "utf8")).trim().split("\n");
    const first = JSON.parse(lines[0]!);
    first.payload.rawCommand = "git push";
    await writeFile(path, `${JSON.stringify(first)}\n${lines[1]}\n`);

    await expect(verifyAuditLog(path)).resolves.toMatchObject({ ok: false });
  });

  test("throws when the audit path cannot be created", async () => {
    const root = await tempRoot();
    const parentFile = join(root, "not-a-dir");
    await writeFile(parentFile, "x");
    await chmod(parentFile, 0o600);
    const audit = new AuditLog(join(parentFile, "audit.jsonl"));

    await expect(audit.beginAttempt({ rawCommand: "git status", cwd: root, envKeys: [], shell: false })).rejects.toThrow();
  });
});
