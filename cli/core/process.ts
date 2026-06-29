// ABOUTME: Provides Node-compatible process execution helpers for CLI integrations.
// ABOUTME: Keeps external command handling consistent across Git, npm, tar, and extension runtimes.

import { spawn } from "node:child_process";

export interface RunProcessOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: string;
  timeoutMs?: number;
}

export interface RunProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// Windows resolves npm through the npm.cmd shim; the bare "npm" name is not on PATH.
export function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function normalizeEnv(env?: Record<string, string | undefined>): Record<string, string> {
  const merged = { ...process.env, ...env };
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return normalized;
}

export async function runProcess(args: string[], options: RunProcessOptions = {}): Promise<RunProcessResult> {
  const [command, ...commandArgs] = args;
  if (!command) {
    throw new Error("runProcess requires a command");
  }

  return await new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: normalizeEnv(options.env),
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });

    const finish = (result: RunProcessResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve(result);
    };

    timer = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (error) => {
      finish({
        exitCode: 127,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: `${Buffer.concat(stderrChunks).toString("utf8")}${error.message}`,
      });
    });

    child.on("close", (code) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      finish({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: timedOut ? `${stderr}${stderr ? "\n" : ""}process timed out` : stderr,
      });
    });

    child.stdin?.end(options.stdin);
  });
}
