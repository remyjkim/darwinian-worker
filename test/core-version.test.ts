// ABOUTME: Guards that the reported drwn version stays in sync with package.json and never lags an emitted lock floor.
// ABOUTME: Prevents the version-vs-feature drift that let drwn run below its own minDrwnVersion floor.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DRWN_VERSION } from "../cli/core/version";
import { HOOKS_MIN_DRWN_VERSION } from "../cli/core/card-lock";
import { gte } from "../cli/core/semver-utils";

describe("drwn version reconciliation", () => {
  test("DRWN_VERSION matches package.json version", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as { version: string };
    expect(DRWN_VERSION).toBe(pkg.version);
  });

  test("running version is at least the highest floor drwn can emit", () => {
    expect(gte(DRWN_VERSION, HOOKS_MIN_DRWN_VERSION)).toBe(true);
  });
});
