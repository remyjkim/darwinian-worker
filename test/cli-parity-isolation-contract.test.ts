// ABOUTME: Prevents the parity test from linking drwn into a user's Bun-global installation.
// ABOUTME: Both Bun registration and bin resolution must live in a cleanup-scoped temp root.

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("CLI parity isolates and cleans both Bun global link surfaces", () => {
  const source = readFileSync(join(import.meta.dir, "cli-parity.test.ts"), "utf8");
  expect(source).toContain("BUN_INSTALL_GLOBAL_DIR");
  expect(source).toContain("BUN_INSTALL_BIN");
  expect(source).toContain("linkOverrides");
  expect(source).toContain("tempRoots.push");
  expect(source).toContain("cleanupTempRoots(tempRoots)");
  expect(source).not.toContain("env: process.env,");
});
