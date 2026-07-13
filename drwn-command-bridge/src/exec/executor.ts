// ABOUTME: Executes allowlisted commands through argv spawn with timeout and output caps.
// ABOUTME: Keeps shell interpretation disabled unless higher-level policy explicitly opts in.

import { spawn } from "node:child_process";

export interface RunCommandOptions {
  argv: string[];
  cwd?: string;
  env: Record<string, string>;
  timeoutMs?: number;
  outputLimitBytes?: number;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: { stdout: boolean; stderr: boolean };
  stdoutBytes: number;
  stderrBytes: number;
  spawnError?: string;
}

const defaultTimeoutMs = 30000;
const defaultOutputLimitBytes = 1048576;

function appendCapped(
  chunks: Buffer[],
  chunk: Buffer,
  state: { bytes: number; truncated: boolean },
  limit: number,
  marker: string,
) {
  if (state.truncated) {
    return;
  }
  const remaining = limit - state.bytes;
  if (chunk.length <= remaining) {
    chunks.push(chunk);
    state.bytes += chunk.length;
    return;
  }

  if (remaining > 0) {
    chunks.push(chunk.subarray(0, remaining));
    state.bytes += remaining;
  }
  chunks.push(Buffer.from(marker));
  state.truncated = true;
}

export async function runCommand(options: RunCommandOptions): Promise<RunCommandResult> {
  const [program, ...args] = options.argv;
  if (!program) {
    throw new Error("runCommand requires argv[0]");
  }
  const timeoutMs = Math.min(options.timeoutMs ?? defaultTimeoutMs, 300000);
  const outputLimitBytes = options.outputLimitBytes ?? defaultOutputLimitBytes;

  return await new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const stdoutState = { bytes: 0, truncated: false };
    const stderrState = { bytes: 0, truncated: false };
    let settled = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: Omit<RunCommandResult, "stdout" | "stderr" | "truncated" | "stdoutBytes" | "stderrBytes">) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        ...result,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        truncated: { stdout: stdoutState.truncated, stderr: stderrState.truncated },
        stdoutBytes: stdoutState.bytes,
        stderrBytes: stderrState.bytes,
      });
    };

    const child = spawn(program, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) =>
      appendCapped(stdoutChunks, chunk, stdoutState, outputLimitBytes, "[stdout truncated at 1MB]"),
    );
    child.stderr?.on("data", (chunk: Buffer) =>
      appendCapped(stderrChunks, chunk, stderrState, outputLimitBytes, "[stderr truncated at 1MB]"),
    );

    child.on("error", (error) => {
      finish({ exitCode: 127, timedOut: false, spawnError: error.message });
    });

    child.on("close", (code) => {
      finish({ exitCode: timedOut ? null : code ?? -1, timedOut });
    });
  });
}
