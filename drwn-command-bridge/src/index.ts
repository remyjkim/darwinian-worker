// ABOUTME: Entrypoint for the drwn-command-bridge stdio server package.
// ABOUTME: Parses CLI flags and wires production dependencies to stdio transport.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "./audit/log";
import { MacOsConsentGate } from "./consent/macos";
import { LinuxConsentGate } from "./consent/linux";
import { WindowsConsentGate } from "./consent/windows";
import { runCommand } from "./exec/executor";
import { createSandboxProfile } from "./exec/sandbox/profile";
import { loadPolicyFile } from "./policy/load";
import { createServer } from "./server";

function argValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

const envReferencePattern = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

export function resolvePathArg(value: string, env: Record<string, string | undefined> = process.env, homeDir = homedir()) {
  const envReference = value.match(envReferencePattern)?.[1];
  if (envReference) {
    const resolved = env[envReference];
    if (!resolved) {
      throw new Error(`Environment variable ${envReference} is required`);
    }
    return resolved;
  }
  if (value === "~") {
    return homeDir;
  }
  if (value.startsWith("~/")) {
    return join(homeDir, value.slice(2));
  }
  return value;
}

function consentGateForPlatform() {
  if (process.platform === "darwin") return new MacOsConsentGate();
  if (process.platform === "win32") return new WindowsConsentGate();
  return new LinuxConsentGate();
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    process.stdout.write("Usage: drwn-command-bridge --policy <path> [--audit <path>]\n");
    return;
  }
  const policyPath = argValue(argv, "--policy");
  if (!policyPath) {
    throw new Error("Missing required --policy <path>");
  }

  const policy = await loadPolicyFile(resolvePathArg(policyPath));
  const auditPath = resolvePathArg(argValue(argv, "--audit") ?? join(homedir(), ".drwn-command-bridge", "audit.jsonl"));
  const server = createServer({
    policyStore: { current: () => policy },
    audit: new AuditLog(auditPath),
    consent: consentGateForPlatform(),
    executor: { run: runCommand },
    sandbox: createSandboxProfile(process.platform),
  });
  await server.connect(new StdioServerTransport());
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
