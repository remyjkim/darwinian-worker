// ABOUTME: Verifies resolveScopeForCardNew dependency-resolution logic.
// ABOUTME: Pure function so probe + prompt are injected and TTY behavior is unit-testable.

import { describe, expect, test } from "bun:test";
import { resolveScopeForCardNew } from "../cli/core/authoring-scope";

describe("resolveScopeForCardNew", () => {
  test("returns explicit scope when provided", async () => {
    const result = await resolveScopeForCardNew({
      explicit: "@override",
      isInteractive: true,
      probe: async () => ({ ghLogin: "from-gh" }),
      prompt: async () => true,
    });
    expect(result).toEqual({ kind: "ok", scope: "@override", source: "explicit" });
  });

  test("explicit scope wins even when saved scope is also present", async () => {
    const result = await resolveScopeForCardNew({
      explicit: "@override",
      savedScope: "@saved",
      isInteractive: true,
      probe: async () => ({ ghLogin: "from-gh" }),
      prompt: async () => true,
    });
    expect(result).toEqual({ kind: "ok", scope: "@override", source: "explicit" });
  });

  test("uses saved scope when no explicit is provided", async () => {
    const result = await resolveScopeForCardNew({
      savedScope: "@saved",
      isInteractive: true,
      probe: async () => ({ ghLogin: "from-gh" }),
      prompt: async () => true,
    });
    expect(result).toEqual({ kind: "ok", scope: "@saved", source: "saved" });
  });

  test("non-interactive with no explicit and no saved returns error even when probe succeeds", async () => {
    const result = await resolveScopeForCardNew({
      isInteractive: false,
      probe: async () => ({ ghLogin: "from-gh" }),
      prompt: async () => true,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("--scope");
      expect(result.message).toContain("non-interactive");
      expect(result.message).toContain("@from-gh");
    }
  });

  test("non-interactive with no probe result returns plain --scope-required error", async () => {
    const result = await resolveScopeForCardNew({
      isInteractive: false,
      probe: async () => ({ ghLogin: null }),
      prompt: async () => true,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("--scope");
      expect(result.message).not.toContain("Detected");
    }
  });

  test("interactive with probe result and accepted prompt returns derived scope", async () => {
    const result = await resolveScopeForCardNew({
      isInteractive: true,
      probe: async () => ({ ghLogin: "junggyu" }),
      prompt: async () => true,
    });
    expect(result).toEqual({ kind: "ok", scope: "@junggyu", source: "derived" });
  });

  test("interactive with probe result and declined prompt returns cancellation error", async () => {
    const result = await resolveScopeForCardNew({
      isInteractive: true,
      probe: async () => ({ ghLogin: "junggyu" }),
      prompt: async () => false,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message.toLowerCase()).toContain("cancel");
    }
  });

  test("interactive with no probe result returns error pointing at --scope", async () => {
    const result = await resolveScopeForCardNew({
      isInteractive: true,
      probe: async () => ({ ghLogin: null, githubUser: null, gitEmail: null }),
      prompt: async () => true,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("--scope");
    }
  });

  test("prompt receives the suggested derived scope as argument", async () => {
    const seen: string[] = [];
    await resolveScopeForCardNew({
      isInteractive: true,
      probe: async () => ({ ghLogin: "junggyu" }),
      prompt: async (suggested) => {
        seen.push(suggested);
        return true;
      },
    });
    expect(seen).toEqual(["@junggyu"]);
  });
});
