// ABOUTME: Verifies argv-only command execution, timeout, truncation, and spawn errors.
// ABOUTME: Protects the bridge executor from shell interpretation and unbounded output.

import { describe, expect, test } from "bun:test";
import { runCommand } from "../src/exec/executor";

const runtimeBin = Bun.which("bun") ?? process.execPath;

describe("runCommand", () => {
  test("passes shell metacharacters as inert argv text", async () => {
    const result = await runCommand({
      argv: [runtimeBin, "-e", "console.log(process.argv.slice(1).join('|'))", "hi;", "rm", "x"],
      env: {},
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hi;|rm|x");
  });

  test("kills timed-out commands", async () => {
    const result = await runCommand({
      argv: [runtimeBin, "-e", "setTimeout(() => {}, 1000)"],
      env: {},
      timeoutMs: 25,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  test("truncates stdout and marks it visibly", async () => {
    const result = await runCommand({
      argv: [runtimeBin, "-e", "process.stdout.write('x'.repeat(64))"],
      env: {},
      outputLimitBytes: 16,
    });

    expect(result.truncated.stdout).toBe(true);
    expect(result.stdout).toContain("[stdout truncated at 1MB]");
  });

  test("truncates stderr and marks it visibly", async () => {
    const result = await runCommand({
      argv: [runtimeBin, "-e", "process.stderr.write('x'.repeat(64))"],
      env: {},
      outputLimitBytes: 16,
    });

    expect(result.truncated.stderr).toBe(true);
    expect(result.stderr).toContain("[stderr truncated at 1MB]");
  });

  test("returns structured spawn errors without shell fallback", async () => {
    const result = await runCommand({
      argv: ["definitely-not-drwn-command-bridge-command"],
      env: {},
    });

    expect(result.exitCode).toBe(127);
    expect(result.spawnError).toContain("definitely-not-drwn-command-bridge-command");
  });
});
