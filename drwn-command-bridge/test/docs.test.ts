// ABOUTME: Verifies operator documentation and example policy are packaged and useful.
// ABOUTME: Keeps manual setup guidance and denylist examples from drifting out of releases.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { parsePolicyText } from "../src/policy/load";

const legacyProductPrefix = ["co", "work"].join("");
const legacyPackageName = [legacyProductPrefix, "mcp"].join("-");
const legacyPolicyEnv = ["COWORK", "MCP", "POLICY"].join("_");

describe("operator docs", () => {
  test("README contains the required bridge operation checklist", async () => {
    const text = await readFile(new URL("../README.md", import.meta.url), "utf8");

    for (const required of [
      "Threat Model",
      "Egress Gap",
      "Policy Authoring",
      "Audit Log",
      "macOS Claude Desktop",
      "Windows Claude Desktop",
      "Linux Claude Desktop",
      "node /abs/path/drwn-command-bridge/dist/index.js",
      "npx -y drwn-command-bridge --policy /abs/path/bridge.policy.yaml",
      "\"drwn-command-bridge\"",
      "Platform Validation Matrix",
    ]) {
      expect(text).toContain(required);
    }
    expect(text).not.toContain(legacyPackageName);
    expect(text).not.toContain(legacyPolicyEnv);
    expect(text).not.toContain(`"${legacyPackageName}": {`);
    expect(text).not.toContain(`"${legacyProductPrefix}": {`);
  });

  test("example policy parses and denies shell operators and credential paths", async () => {
    const text = await readFile(new URL("../bridge.policy.example.yaml", import.meta.url), "utf8");
    const policy = parsePolicyText(text, { homeDir: "/Users/example" });
    const denyPatterns = policy.denyAlways.map((rule) => rule.regex);

    for (const blocked of [
      "git status > /tmp/out",
      "git status; rm -rf /tmp/x",
      "git status | cat",
      "git status ~/.ssh/id_rsa",
      "git status /Users/example/.aws/credentials",
      "sudo whoami",
    ]) {
      expect(denyPatterns.some((regex) => regex.test(blocked))).toBe(true);
    }
  });
});
