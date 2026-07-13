// ABOUTME: Verifies fail-closed behavior when bridge controls cannot be enforced.
// ABOUTME: Ensures missing policy, audit, consent, sandbox, timeout, and truncation paths stay bounded.

import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type ServerDependencies } from "../src/server";
import { FilePolicyStore } from "../src/policy/store";
import { parsePolicyText } from "../src/policy/load";
import type { ConsentRequest } from "../src/consent/gate";
import type { RunCommandResult } from "../src/exec/executor";
import type { AttemptPayload, OutcomePayload } from "../src/audit/log";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "drwn-command-bridge-failclosed-"));
  roots.push(root);
  return root;
}

class MemoryAudit {
  records: Array<{ type: "attempt"; auditId: string; payload: AttemptPayload } | { type: "outcome"; auditId: string; payload: OutcomePayload }> = [];

  async beginAttempt(payload: AttemptPayload) {
    this.records.push({ type: "attempt", auditId: "audit-1", payload });
    return "audit-1";
  }

  async finish(auditId: string, payload: OutcomePayload) {
    this.records.push({ type: "outcome", auditId, payload });
  }
}

function result(overrides: Partial<RunCommandResult> = {}): RunCommandResult {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    truncated: { stdout: false, stderr: false },
    stdoutBytes: 0,
    stderrBytes: 0,
    ...overrides,
  };
}

async function connect(deps: ServerDependencies) {
  const server = createServer(deps);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

function policy(root: string, sandboxRequired = false) {
  return parsePolicyText(
    `
version: 1
default: deny
allow:
  - program: git
    args_allow: ["status"]
    risk: low
consent_required_above: low
roots_allow: [${JSON.stringify(root)}]
sandbox:
  required: ${sandboxRequired}
`,
    { homeDir: root },
  );
}

describe("FilePolicyStore", () => {
  test("refuses missing startup policy", async () => {
    await expect(FilePolicyStore.load("/tmp/does-not-exist-drwn-command-bridge-policy.yaml")).rejects.toThrow();
  });

  test("refuses invalid startup policy", async () => {
    const root = await tempRoot();
    const path = join(root, "policy.yaml");
    await writeFile(path, "not: [valid");

    await expect(FilePolicyStore.load(path)).rejects.toThrow();
  });

  test("reload swaps valid policies and keeps prior policy on parse error", async () => {
    const root = await tempRoot();
    const path = join(root, "policy.yaml");
    await writeFile(path, `version: 1\ndefault: deny\nallow:\n  - program: git\n    risk: low\nroots_allow: [${JSON.stringify(root)}]\n`);
    const logs: string[] = [];
    const store = await FilePolicyStore.load(path, { logger: (message) => logs.push(message) });
    expect(store.current().allow[0]?.program).toBe("git");

    await writeFile(path, `version: 1\ndefault: deny\nallow:\n  - program: node\n    risk: low\nroots_allow: [${JSON.stringify(root)}]\n`);
    await expect(store.reload()).resolves.toBe(true);
    expect(store.current().allow[0]?.program).toBe("node");

    await writeFile(path, "not: [valid");
    await expect(store.reload()).resolves.toBe(false);
    expect(store.current().allow[0]?.program).toBe("node");
    expect(logs[0]).toContain("policy reload failed");
  });
});

describe("server fail-closed controls", () => {
  test("audit begin failure denies before spawn", async () => {
    const root = await tempRoot();
    let spawns = 0;
    const { client, server } = await connect({
      policyStore: { current: () => policy(root) },
      audit: {
        async beginAttempt() {
          throw new Error("disk full");
        },
        async finish() {},
      },
      consent: { async request() { return true; } },
      executor: { async run() { spawns += 1; return result(); } },
    });

    const output = await client.callTool({ name: "execute_command", arguments: { command: "git status", cwd: root } });

    expect(output.isError).toBe(true);
    expect(spawns).toBe(0);
    await client.close();
    await server.close();
  });

  test("consent unavailable denies before spawn", async () => {
    const root = await tempRoot();
    const audit = new MemoryAudit();
    let spawns = 0;
    const highRiskPolicy = parsePolicyText(
      `version: 1\ndefault: deny\nallow:\n  - program: git\n    args_allow: ["status"]\n    risk: medium\nconsent_required_above: low\nroots_allow: [${JSON.stringify(root)}]\nsandbox:\n  required: false\n`,
      { homeDir: root },
    );
    const { client, server } = await connect({
      policyStore: { current: () => highRiskPolicy },
      audit,
      consent: {
        async request(_req: ConsentRequest) {
          throw new Error("no channel");
        },
      },
      executor: { async run() { spawns += 1; return result(); } },
    });

    const output = await client.callTool({ name: "execute_command", arguments: { command: "git status", cwd: root } });

    expect(output.isError).toBe(true);
    expect(spawns).toBe(0);
    expect(audit.records[1]).toMatchObject({ type: "outcome", payload: { outcome: "consent_denied" } });
    await client.close();
    await server.close();
  });

  test("required sandbox unavailable denies before spawn", async () => {
    const root = await tempRoot();
    const audit = new MemoryAudit();
    let spawns = 0;
    const { client, server } = await connect({
      policyStore: { current: () => policy(root, true) },
      audit,
      consent: { async request() { return true; } },
      sandbox: {
        async assertAvailable() {
          throw new Error("sandbox unavailable");
        },
      },
      executor: { async run() { spawns += 1; return result(); } },
    });

    const output = await client.callTool({ name: "execute_command", arguments: { command: "git status", cwd: root } });

    expect(output.isError).toBe(true);
    expect(spawns).toBe(0);
    expect(audit.records[1]).toMatchObject({ type: "outcome", payload: { outcome: "sandbox_unavailable" } });
    await client.close();
    await server.close();
  });

  test("timeout and truncation return structured results, not tool errors", async () => {
    const root = await tempRoot();
    const audit = new MemoryAudit();
    const { client, server } = await connect({
      policyStore: { current: () => policy(root) },
      audit,
      consent: { async request() { return true; } },
      executor: {
        async run() {
          return result({ stdout: "partial", exitCode: null, timedOut: true, truncated: { stdout: true, stderr: false } });
        },
      },
    });

    const output = await client.callTool({ name: "execute_command", arguments: { command: "git status", cwd: root } });

    expect(output.isError).toBeUndefined();
    expect(output.structuredContent).toMatchObject({ timedOut: true, truncated: { stdout: true, stderr: false } });
    await client.close();
    await server.close();
  });
});
