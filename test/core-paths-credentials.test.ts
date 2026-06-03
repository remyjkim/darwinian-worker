// ABOUTME: Verifies auth credential path resolution under the drwn user store.
// ABOUTME: Keeps auth storage co-located with the existing ~/.agents/drwn layout.

import { describe, expect, test } from "bun:test";
import { resolveCredentialsPath } from "../cli/core/paths";

describe("resolveCredentialsPath", () => {
  test("returns join(agentsDir, 'drwn', 'credentials.json')", () => {
    expect(resolveCredentialsPath("/u/.agents")).toBe("/u/.agents/drwn/credentials.json");
  });
});
