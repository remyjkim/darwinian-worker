// ABOUTME: Verifies publish-time semver guardrail helpers independently of Git store plumbing.
// ABOUTME: Locks declared-bump ranking and audit config key formatting.

import { describe, expect, test } from "bun:test";
import { assertSemverBumpMatchesClassification, bumpOverrideConfigKey } from "../cli/core/card-publish-guardrail";

describe("assertSemverBumpMatchesClassification", () => {
  test("allows matching and larger-than-required bumps", () => {
    expect(() =>
      assertSemverBumpMatchesClassification({
        previousVersion: "1.0.0",
        nextVersion: "2.0.0",
        classification: "major",
      }),
    ).not.toThrow();
    expect(() =>
      assertSemverBumpMatchesClassification({
        previousVersion: "1.0.0",
        nextVersion: "2.0.0",
        classification: "patch",
      }),
    ).not.toThrow();
  });

  test("rejects declared patch for structural major change", () => {
    expect(() =>
      assertSemverBumpMatchesClassification({
        previousVersion: "1.0.0",
        nextVersion: "1.0.1",
        classification: "major",
      }),
    ).toThrow(/CARD_SEMVER_GUARDRAIL/);
  });

  test("rejects non-increasing versions", () => {
    expect(() =>
      assertSemverBumpMatchesClassification({
        previousVersion: "1.0.0",
        nextVersion: "1.0.0",
        classification: "patch",
      }),
    ).toThrow(/CARD_SEMVER_NOT_BUMPED/);
  });
});

describe("bumpOverrideConfigKey", () => {
  test("formats semver as a git-config-safe key", () => {
    expect(bumpOverrideConfigKey("1.2.3")).toBe("drwn.bumpOverride.v1-2-3");
  });
});
