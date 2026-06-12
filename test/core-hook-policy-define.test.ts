// ABOUTME: Verifies defineToolPolicy preserves policy specs unchanged.
// ABOUTME: Protects author-facing inference while keeping the helper trivial.

import { describe, expect, it } from "bun:test";
import { defineToolPolicy } from "../cli/core/hook-policy/define-tool-policy";

describe("defineToolPolicy", () => {
  it("returns its input untouched for type inference", () => {
    const policy = defineToolPolicy({
      policyKind: "observer",
      async afterToolCall() {},
    });

    expect(policy.policyKind).toBe("observer");
    expect(typeof policy.afterToolCall).toBe("function");
  });
});
