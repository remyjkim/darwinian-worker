// ABOUTME: Exercises the production Node bundle through a real MCP stdio client on macOS.
// ABOUTME: Verifies native sandbox execution, policy denial, and audit-chain integrity.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAuditLog } from "../src/audit/log";

if (process.platform !== "darwin") {
  throw new Error(`native macOS smoke requires darwin, received ${process.platform}`);
}

await access("/usr/bin/sandbox-exec");

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(join(tmpdir(), "drwn-command-bridge-native-"));
const policyPath = join(tempRoot, "policy.yaml");
const auditPath = join(tempRoot, "audit.jsonl");
const bundlePath = join(packageRoot, "dist", "index.js");
const policy = `version: 1
default: deny
allow:
  - program: node
    args_allow: ["--version"]
    risk: low
deny_always:
  - pattern: '\\bsudo\\b'
consent_required_above: low
roots_allow:
  - ${JSON.stringify(tempRoot)}
sandbox:
  required: true
`;

await writeFile(policyPath, policy, { mode: 0o600 });

const client = new Client({ name: "drwn-command-bridge-native-smoke", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [bundlePath, "--policy", policyPath, "--audit", auditPath],
  cwd: packageRoot,
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += String(chunk);
});

try {
  await client.connect(transport);

  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    ["execute_command", "list_allowed_commands"],
  );

  const allowed = await client.callTool({
    name: "execute_command",
    arguments: { command: "node --version", cwd: tempRoot, reason: "native macOS release smoke" },
  });
  assert.equal(allowed.isError, undefined);
  assert.match(String((allowed.structuredContent as { stdout?: string } | undefined)?.stdout), /^v\d+\./);
  assert.equal((allowed.structuredContent as { decision?: string } | undefined)?.decision, "auto");

  const denied = await client.callTool({
    name: "execute_command",
    arguments: { command: "sudo whoami", cwd: tempRoot, reason: "verify denylist precedence" },
  });
  assert.equal(denied.isError, true);

  await client.close();
  const audit = await verifyAuditLog(auditPath);
  assert.deepEqual(audit, { ok: true, records: 4 });

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      platform: process.platform,
      transport: "mcp-stdio",
      bundleRuntime: "node",
      sandbox: "/usr/bin/sandbox-exec",
      tools: listed.tools.map((tool) => tool.name).sort(),
      allowed: "node --version",
      denied: "sudo whoami",
      auditRecords: 4,
    })}\n`,
  );
} catch (error) {
  await client.close().catch(() => undefined);
  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
  throw error;
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
