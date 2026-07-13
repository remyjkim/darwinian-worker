// ABOUTME: Verifies project-side hook exclusion config survives card manifest merging.
// ABOUTME: Protects local policy opt-out declarations before sync-time filtering.

import { describe, expect, test } from "bun:test";
import { mergeCardManifestsIntoProjectConfig } from "../cli/core/card-project";

describe("mergeCardManifestsIntoProjectConfig hook config", () => {
  test("should preserve project hook exclusions", () => {
    const merged = mergeCardManifestsIntoProjectConfig(
      {
        version: 2,
        hooks: { exclude: ["@me/policy:audit", "audit"] },
      },
      [{ name: "@me/policy", version: "1.0.0", hooks: { include: ["audit"] } }],
    );

    expect(merged.hooks?.exclude).toEqual(["@me/policy:audit", "audit"]);
  });
});
