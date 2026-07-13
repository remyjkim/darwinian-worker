// ABOUTME: Verifies pure allow/deny/consent decisions for parsed command requests.
// ABOUTME: Keeps policy classification free of filesystem and process side effects.

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
  - program: dotnet
    args_allow: ["build", "test"]
    risk: medium
  - program: sudo
    risk: low
deny_always:
  - pattern: "\\bsudo\\b"
consent_required_above: low
roots_allow: ["/tmp/project"]
sandbox:
  required: false
`,
  { homeDir: "/tmp/home" },
);

function request(argv: string[], rawCommand = argv.join(" ")): PolicyRequest {
  return { rawCommand, argv, cwd: "/tmp/project", shell: false, envKeys: [] };
}

describe("decide", () => {
  test("allows low-risk allowlisted commands automatically", () => {
    expect(decide(request(["git", "status"]), policy)).toMatchObject({
      kind: "auto",
      risk: "low",
      resolvedArgv: ["git", "status"],
    });
  });

  test("requires consent above the configured risk threshold", () => {
    expect(decide(request(["dotnet", "build"]), policy)).toMatchObject({
      kind: "consent",
      risk: "medium",
      resolvedArgv: ["dotnet", "build"],
    });
  });

  test("denies unknown programs", () => {
    expect(decide(request(["python", "-c", "print(1)"]), policy)).toMatchObject({
      kind: "deny",
      matchedRule: "default",
    });
  });

  test("denylist beats allowlist", () => {
    expect(decide(request(["sudo", "whoami"]), policy)).toMatchObject({
      kind: "deny",
      matchedRule: "deny_always",
    });
  });

  test("denies disallowed subcommands", () => {
    expect(decide(request(["git", "config"]), policy)).toMatchObject({
      kind: "deny",
      matchedRule: "allow.git.args_allow",
    });
  });
});
