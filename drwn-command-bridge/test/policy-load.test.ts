// ABOUTME: Verifies bridge policy parsing and normalization fail closed.
// ABOUTME: Protects malformed operator configuration from starting permissively.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolicyFile, parsePolicyText } from "../src/policy/load";

const fixtureUrl = (name: string) => new URL(`./fixtures/policies/${name}`, import.meta.url);

describe("parsePolicyText", () => {
  test("loads valid policy YAML and expands home roots", async () => {
    const text = await readFile(fixtureUrl("good.yaml"), "utf8");
    const policy = parsePolicyText(text, { homeDir: "/Users/operator" });

    expect(policy.version).toBe(1);
    expect(policy.allow[0]?.program).toBe("git");
    expect(policy.allow[0]?.argsAllow).toEqual(["status", "log"]);
    expect(policy.denyAlways[0]?.regex).toBeInstanceOf(RegExp);
    expect(policy.rootsAllow).toEqual([resolve("/Users/operator", "projects")]);
    expect(policy.consentCacheTtlMs).toBe(0);
    expect(policy.sandbox.required).toBe(true);
  });

  test("throws on malformed YAML", async () => {
    const text = await readFile(fixtureUrl("malformed.yaml"), "utf8");

    expect(() => parsePolicyText(text, { homeDir: "/tmp/home" })).toThrow();
  });

  test("throws on unsupported version", () => {
    expect(() =>
      parsePolicyText(
        `
version: 2
default: deny
allow:
  - program: git
    risk: low
roots_allow: ["/tmp"]
`,
        { homeDir: "/tmp/home" },
      ),
    ).toThrow(/version/i);
  });

  test("throws on empty allowlist", () => {
    expect(() =>
      parsePolicyText(
        `
version: 1
default: deny
allow: []
roots_allow: ["/tmp"]
`,
        { homeDir: "/tmp/home" },
      ),
    ).toThrow(/allow/i);
  });

  test("throws on invalid risk", () => {
    expect(() =>
      parsePolicyText(
        `
version: 1
default: deny
allow:
  - program: git
    risk: severe
roots_allow: ["/tmp"]
`,
        { homeDir: "/tmp/home" },
      ),
    ).toThrow(/risk/i);
  });

  test("throws on invalid deny regex", () => {
    expect(() =>
      parsePolicyText(
        `
version: 1
default: deny
allow:
  - program: git
    risk: low
deny_always:
  - pattern: "["
roots_allow: ["/tmp"]
`,
        { homeDir: "/tmp/home" },
      ),
    ).toThrow(/regex/i);
  });

  test("throws when roots_allow is missing", () => {
    expect(() =>
      parsePolicyText(
        `
version: 1
default: deny
allow:
  - program: git
    risk: low
`,
        { homeDir: "/tmp/home" },
      ),
    ).toThrow(/roots/i);
  });
});

describe("loadPolicyFile", () => {
  test("loads a policy file from disk", async () => {
    const policy = await loadPolicyFile(fileURLToPath(fixtureUrl("good.yaml")), { homeDir: "/Users/operator" });

    expect(policy.allow.map((entry) => entry.program)).toEqual(["git", "dotnet"]);
  });
});
