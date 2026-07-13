// ABOUTME: Verifies CLI path argument expansion used by registry MCP entries.
// ABOUTME: Keeps machine-local policy paths configurable without shell wrappers.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { resolvePathArg } from "../src/index";

describe("resolvePathArg", () => {
  test("resolves exact environment placeholders", () => {
    expect(resolvePathArg("${DRWN_COMMAND_BRIDGE_POLICY}", { DRWN_COMMAND_BRIDGE_POLICY: "/tmp/policy.yaml" }, "/Users/example")).toBe(
      "/tmp/policy.yaml",
    );
  });

  test("throws when a placeholder environment value is absent", () => {
    expect(() => resolvePathArg("${DRWN_COMMAND_BRIDGE_POLICY}", {}, "/Users/example")).toThrow(/DRWN_COMMAND_BRIDGE_POLICY/);
  });

  test("expands home-relative paths", () => {
    expect(resolvePathArg("~/.drwn-command-bridge/policy.yaml", {}, "/Users/example")).toBe(
      join("/Users/example", ".drwn-command-bridge", "policy.yaml"),
    );
  });
});
