// ABOUTME: Verifies hook consent validation for locked card entries.
// ABOUTME: Protects sync gating from materializing untrusted policy code.

import { describe, expect, test } from "bun:test";
import { isHookConsentValid } from "../cli/core/hook-consent";
import type { CardLockEntry } from "../cli/core/card-lock";

function entry(overrides: Partial<CardLockEntry> = {}): CardLockEntry {
  return {
    name: "@me/policy",
    requested: "@me/policy@^1.0.0",
    version: "1.0.0",
    path: "/tmp/card",
    integrity: "sha256-test",
    manifest: { name: "@me/policy", version: "1.0.0" },
    skills: [],
    hooks: ["guard"],
    registry: null,
    origin: "store",
    git: { commit: "a".repeat(40) },
    ...overrides,
  };
}

describe("isHookConsentValid", () => {
  test("cards without hooks are valid without consent", () => {
    expect(isHookConsentValid(entry({ hooks: [] }))).toBe(true);
  });

  test("cards with hooks require consent and matching version range", () => {
    expect(isHookConsentValid(entry())).toBe(false);
    expect(isHookConsentValid(entry({
      hookConsent: { consentedAt: "2026-06-11T00:00:00.000Z", consentedRange: "^1.0.0" },
    }))).toBe(true);
    expect(isHookConsentValid(entry({
      version: "2.0.0",
      hookConsent: { consentedAt: "2026-06-11T00:00:00.000Z", consentedRange: "^1.0.0" },
    }))).toBe(false);
  });

  test("includes prerelease versions in consent range checks", () => {
    expect(isHookConsentValid(entry({
      version: "1.1.0-beta.1",
      hookConsent: { consentedAt: "2026-06-11T00:00:00.000Z", consentedRange: "^1.0.0" },
    }))).toBe(true);
  });
});
