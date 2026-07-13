// ABOUTME: Verifies drwn-command-bridge exposes real MCP tools over an in-memory transport.
// ABOUTME: Protects audit ordering and denial semantics across the handler pipeline.

import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ServerDependencies } from "../src/server";
import { parsePolicyText } from "../src/policy/load";
import type { AttemptPayload, OutcomePayload } from "../src/audit/log";
import type { ConsentRequest } from "../src/consent/gate";
import type { RunCommandResult } from "../src/exec/executor";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "drwn-command-bridge-server-"));
  roots.push(root);
  return root;
}

class MemoryAudit {
  records: Array<{ type: "attempt"; auditId: string; payload: AttemptPayload } | { type: "outcome"; auditId: string; payload: OutcomePayload }> = [];
  next = 1;

  async beginAttempt(payload: AttemptPayload) {
    const auditId = `audit-${this.next}`;
    this.next += 1;
    this.records.push({ type: "attempt", auditId, payload });
    return auditId;
  }

  async finish(auditId: string, payload: OutcomePayload) {
    this.records.push({ type: "outcome", auditId, payload });
  }
}

class MemoryConsent {
  calls: ConsentRequest[] = [];
  constructor(private readonly approved: boolean) {}

  async request(req: ConsentRequest) {
    this.calls.push(req);
    return this.approved;
  }
}

function okResult(stdout = "ok\n"): RunCommandResult {
  return {
    stdout,
    stderr: "",
    exitCode: 0,
    timedOut: false,
    truncated: { stdout: false, stderr: false },
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: 0,
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

async function deps(root: string, consent = new MemoryConsent(false), result = okResult()) {
  const audit = new MemoryAudit();
  const policy = parsePolicyText(
    `
version: 1
default: deny
allow:
  - program: git
    args_allow: ["status"]
    risk: low
  - program: dotnet
    args_allow: ["build"]
    risk: medium
deny_always:
  - pattern: "\\bsudo\\b"
consent_required_above: low
roots_allow: [${JSON.stringify(root)}]
sandbox:
  required: false
`,
    { homeDir: root },
  );
  let spawns = 0;
  return {
    policyStore: { current: () => policy },
    audit,
    consent,
    executor: {
      async run() {
        spawns += 1;
        return result;
      },
    },
    get spawnCount() {
      return spawns;
    },
  };
}

describe("MCP server integration", () => {
  test("lists exactly the bridge tools", async () => {
    const root = await tempRoot();
    const setup = await deps(root);
    const { client, server } = await connect(setup);

    const listed = await client.listTools();

    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(["execute_command", "list_allowed_commands"]);
    await client.close();
    await server.close();
  });

  test("executes auto commands and returns structured content with an audit id", async () => {
    const root = await tempRoot();
    const setup = await deps(root);
    const { client, server } = await connect(setup);

    const result = await client.callTool({ name: "execute_command", arguments: { command: "git status", cwd: root } });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ stdout: "ok\n", decision: "auto", auditId: "audit-1" });
    expect(setup.audit.records.map((record) => record.type)).toEqual(["attempt", "outcome"]);
    await client.close();
    await server.close();
  });

  test("audits policy-denied commands without spawning", async () => {
    const root = await tempRoot();
    const setup = await deps(root);
    const { client, server } = await connect(setup);

    const result = await client.callTool({ name: "execute_command", arguments: { command: "sudo whoami", cwd: root } });

    expect(result.isError).toBe(true);
    expect(setup.spawnCount).toBe(0);
    expect(setup.audit.records).toHaveLength(2);
    expect(setup.audit.records[1]).toMatchObject({ type: "outcome", payload: { outcome: "policy_denied" } });
    await client.close();
    await server.close();
  });

  test("audits invalid argv syntax without spawning", async () => {
    const root = await tempRoot();
    const setup = await deps(root);
    const { client, server } = await connect(setup);

    const result = await client.callTool({ name: "execute_command", arguments: { command: 'git "unterminated', cwd: root } });

    expect(result.isError).toBe(true);
    expect(setup.spawnCount).toBe(0);
    expect(setup.audit.records[1]).toMatchObject({ type: "outcome", payload: { outcome: "invalid_command_syntax" } });
    await client.close();
    await server.close();
  });

  test("audits consent denial without spawning", async () => {
    const root = await tempRoot();
    const consent = new MemoryConsent(false);
    const setup = await deps(root, consent);
    const { client, server } = await connect(setup);

    const result = await client.callTool({ name: "execute_command", arguments: { command: "dotnet build", cwd: root } });

    expect(result.isError).toBe(true);
    expect(consent.calls).toHaveLength(1);
    expect(setup.spawnCount).toBe(0);
    expect(setup.audit.records[1]).toMatchObject({ type: "outcome", payload: { outcome: "consent_denied" } });
    await client.close();
    await server.close();
  });

  test("does not write console.log in source files", async () => {
    async function sourceFiles(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const path = join(dir, entry.name);
          return entry.isDirectory() ? await sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
        }),
      );
      return files.flat();
    }

    const offenders = [];
    for (const file of await sourceFiles(fileURLToPath(new URL("../src", import.meta.url)))) {
      if ((await readFile(file, "utf8")).includes("console.log")) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
