// ABOUTME: Verifies the package subpath export for hook policy helpers.
// ABOUTME: Protects card author imports from package metadata drift.

import { describe, expect, it } from "bun:test";

describe("darwinian-mind/hook-policy", () => {
  it("should expose author and composer helpers", async () => {
    const mod = await import("darwinian-mind/hook-policy");

    expect(typeof mod.defineToolPolicy).toBe("function");
    expect(typeof mod.composeToolHooks).toBe("function");
    expect(typeof mod.safeHook).toBe("function");
    expect(typeof mod.runWithTimeout).toBe("function");
    expect(typeof mod.HookTimeoutError).toBe("function");
  });
});
