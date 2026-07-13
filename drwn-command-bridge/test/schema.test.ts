// ABOUTME: Verifies execute_command and list_allowed_commands schema contracts.
// ABOUTME: Keeps MCP tool inputs and outputs strict before server wiring exists.

import { describe, expect, test } from "bun:test";
import { executeInputSchema, executeOutputSchema, listAllowedOutputSchema } from "../src/schema";

describe("executeInputSchema", () => {
  test("accepts the minimal execute input", () => {
    const parsed = executeInputSchema.parse({ command: "git status" });

    expect(parsed).toEqual({ command: "git status" });
  });

  test("rejects timeout over the hard ceiling", () => {
    expect(() => executeInputSchema.parse({ command: "git status", timeout: 300001 })).toThrow();
  });

  test("rejects non-string env values", () => {
    expect(() => executeInputSchema.parse({ command: "git status", env: { TOKEN: 123 } })).toThrow();
  });

  test("rejects overlong reasons", () => {
    expect(() => executeInputSchema.parse({ command: "git status", reason: "x".repeat(2001) })).toThrow();
  });
});

describe("executeOutputSchema", () => {
  test("accepts structured execution output", () => {
    expect(() =>
      executeOutputSchema.parse({
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        truncated: { stdout: false, stderr: false },
        decision: "auto",
        auditId: "01J00000000000000000000000",
      }),
    ).not.toThrow();
  });
});

describe("listAllowedOutputSchema", () => {
  test("accepts a rule list with policy metadata", () => {
    expect(() =>
      listAllowedOutputSchema.parse({
        rules: [{ program: "git", risk: "low", argsAllow: ["status"] }],
        consentRequiredAbove: "low",
      }),
    ).not.toThrow();
  });
});
