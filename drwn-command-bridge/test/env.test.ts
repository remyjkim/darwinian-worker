// ABOUTME: Verifies child-process environment construction is explicit and narrow.
// ABOUTME: Prevents host secrets from leaking into allowlisted command execution.

import { describe, expect, test } from "bun:test";
import { buildEnv } from "../src/exec/env";
import { parsePolicyText } from "../src/policy/load";

const policy = parsePolicyText(
  `
version: 1
default: deny
allow:
  - program: node
    risk: low
env_allow: ["ALLOWED_FLAG"]
roots_allow: ["/tmp"]
sandbox:
  required: false
`,
  { homeDir: "/tmp/home" },
);

describe("buildEnv", () => {
  test("does not inherit arbitrary parent secrets", () => {
    process.env.SECRET_TOKEN = "do-not-leak";

    const env = buildEnv({}, policy, "darwin");

    expect(env.SECRET_TOKEN).toBeUndefined();
  });

  test("includes policy-allowlisted request env values", () => {
    const env = buildEnv({ ALLOWED_FLAG: "1" }, policy, "darwin");

    expect(env.ALLOWED_FLAG).toBe("1");
  });

  test("rejects disallowed request env keys before spawn", () => {
    expect(() => buildEnv({ SECRET_TOKEN: "x" }, policy, "darwin")).toThrow(/not allowlisted/);
  });
});
