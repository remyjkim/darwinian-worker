// ABOUTME: Constructs the drwn-command-bridge server and registers audited command tools.
// ABOUTME: Keeps side-effecting dependencies injectable for fail-closed tests.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseCommandString } from "./argv";
import type { AttemptPayload, OutcomePayload } from "./audit/log";
import type { ConsentGate } from "./consent/gate";
import type { RunCommandOptions, RunCommandResult } from "./exec/executor";
import { buildEnv } from "./exec/env";
import { executeInputShape, executeOutputShape, listAllowedOutputShape, type ExecuteInput } from "./schema";
import { decide } from "./policy/engine";
import { resolveCwdWithinRoots, validatePathArgsWithinRoots } from "./policy/paths";
import type { BridgePolicy } from "./policy/load";

export interface PolicyStore {
  current(): BridgePolicy;
}

export interface ServerAudit {
  beginAttempt(payload: AttemptPayload): Promise<string>;
  finish(auditId: string, payload: OutcomePayload): Promise<void>;
}

export interface ServerExecutor {
  run(options: RunCommandOptions): Promise<RunCommandResult>;
}

export interface ServerSandbox {
  assertAvailable(policy: BridgePolicy): Promise<void>;
  wrap?(argv: string[], cwd: string, policy: BridgePolicy): Promise<string[]>;
}

export interface ServerDependencies {
  policyStore: PolicyStore;
  audit: ServerAudit;
  consent: ConsentGate;
  executor: ServerExecutor;
  sandbox?: ServerSandbox;
}

function textResult(text: string, isError = false, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
    ...(isError ? { isError: true } : {}),
  };
}

function errorResult(message: string, auditId?: string) {
  return textResult(auditId ? `${message} (auditId: ${auditId})` : message, true);
}

function listAllowed(policy: BridgePolicy) {
  return {
    rules: policy.allow.map((rule) => ({
      program: rule.program ?? rule.programPath ?? rule.pattern ?? "unknown",
      risk: rule.risk,
      ...(rule.argsAllow ? { argsAllow: rule.argsAllow } : {}),
      ...(rule.pattern ? { pattern: rule.pattern } : {}),
    })),
    consentRequiredAbove: policy.consentRequiredAbove,
  };
}

async function handleExecute(input: ExecuteInput, deps: ServerDependencies) {
  const policy = deps.policyStore.current();
  const parsedCommand = parseCommandString(input.command);
  let auditId: string;
  try {
    auditId = await deps.audit.beginAttempt({
      rawCommand: input.command,
      parsedArgv: parsedCommand.ok ? parsedCommand.argv : undefined,
      cwd: input.cwd,
      envKeys: Object.keys(input.env ?? {}),
      reason: input.reason,
      shell: input.shell === true,
    });
  } catch (error) {
    return errorResult(`audit unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsedCommand.ok) {
    await deps.audit.finish(auditId, { outcome: "invalid_command_syntax", reason: parsedCommand.reason });
    return errorResult("invalid command syntax", auditId);
  }

  let cwd: string;
  try {
    cwd = await resolveCwdWithinRoots(input.cwd, policy);
    await validatePathArgsWithinRoots(parsedCommand.argv, cwd, policy);
  } catch (error) {
    await deps.audit.finish(auditId, { outcome: "path_denied", reason: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error.message : String(error), auditId);
  }

  const decision = decide(
    {
      rawCommand: input.command,
      argv: parsedCommand.argv,
      cwd,
      shell: input.shell === true,
      envKeys: Object.keys(input.env ?? {}),
    },
    policy,
  );

  if (decision.kind === "deny") {
    await deps.audit.finish(auditId, { outcome: "policy_denied", reason: decision.reason, matchedRule: decision.matchedRule });
    return errorResult(`${decision.reason}; call list_allowed_commands`, auditId);
  }

  if (decision.kind === "consent" || input.shell === true) {
    const approved = await deps.consent
      .request({
        auditId,
        program: decision.resolvedArgv[0] ?? "",
        argv: decision.resolvedArgv,
        cwd,
        reason: input.reason,
        risk: decision.risk,
      })
      .catch(() => false);
    if (!approved) {
      await deps.audit.finish(auditId, { outcome: "consent_denied", reason: "consent denied or unavailable" });
      return errorResult("consent denied or unavailable", auditId);
    }
  }

  let env: Record<string, string>;
  try {
    env = buildEnv(input.env ?? {}, policy);
  } catch (error) {
    await deps.audit.finish(auditId, { outcome: "policy_denied", reason: error instanceof Error ? error.message : String(error) });
    return errorResult(error instanceof Error ? error.message : String(error), auditId);
  }

  let argv = decision.resolvedArgv;
  if (deps.sandbox || policy.sandbox.required) {
    try {
      if (!deps.sandbox) {
        throw new Error("sandbox required but no sandbox adapter is configured");
      }
      await deps.sandbox.assertAvailable(policy);
      argv = deps.sandbox.wrap ? await deps.sandbox.wrap(decision.resolvedArgv, cwd, policy) : decision.resolvedArgv;
    } catch (error) {
      await deps.audit.finish(auditId, { outcome: "sandbox_unavailable", reason: error instanceof Error ? error.message : String(error) });
      return errorResult(error instanceof Error ? error.message : String(error), auditId);
    }
  }

  const result = await deps.executor.run({
    argv,
    cwd,
    env,
    timeoutMs: input.timeout ?? 30000,
  });

  await deps.audit.finish(auditId, {
    outcome: result.timedOut ? "timed_out" : result.spawnError ? "spawn_error" : "completed",
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    truncated: result.truncated,
    stdoutBytes: result.stdoutBytes,
    stderrBytes: result.stderrBytes,
    ...(result.spawnError ? { spawnError: result.spawnError } : {}),
  });

  const structuredContent = {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    truncated: result.truncated,
    decision: decision.kind === "auto" ? "auto" : "consented",
    auditId,
  };
  return textResult(JSON.stringify(structuredContent), false, structuredContent);
}

export function createServer(deps: ServerDependencies) {
  const server = new McpServer({ name: "drwn-command-bridge", version: "0.1.0" });

  server.registerTool(
    "execute_command",
    {
      description: "Execute an allowlisted, audited host command.",
      inputSchema: executeInputShape,
      outputSchema: executeOutputShape,
    },
    async (input) => handleExecute(input, deps),
  );

  server.registerTool(
    "list_allowed_commands",
    {
      description: "List active host command allow rules.",
      inputSchema: {},
      outputSchema: listAllowedOutputShape,
    },
    async () => {
      const output = listAllowed(deps.policyStore.current());
      return textResult(JSON.stringify(output), false, output);
    },
  );

  return server;
}
