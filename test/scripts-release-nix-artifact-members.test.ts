// ABOUTME: Executes the artifact member-parity predicate against real qualification shapes.
// ABOUTME: Optional omissions must fail even when the mandatory-member qualifier accepts a tar.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const predicate = join(import.meta.dir, "..", "scripts", "release", "nix-artifact-members.jq");
const commit = "f1626eadfd3388ba71bf3efabb51c94f7c4d9bca";
const canonical = {
  version: "1.4.2",
  sourceCommit: commit,
  members: ["cli/index.ts", "package.json", "skills/shared/optional/SKILL.md"],
};

function accepts(candidate: unknown, standard = canonical): boolean {
  const result = spawnSync("jq", [
    "-e",
    "--argjson",
    "canonical",
    JSON.stringify([standard]),
    "-f",
    predicate,
  ], { input: JSON.stringify(candidate), encoding: "utf8" });
  return result.status === 0;
}

describe("Nix artifact package-member parity", () => {
  test("accepts identical clean-source member inventories", () => {
    expect(accepts(canonical)).toBe(true);
  });

  test("rejects a missing optional member or an extra member", () => {
    expect(accepts({ ...canonical, members: canonical.members.slice(0, 2) })).toBe(false);
    expect(accepts({ ...canonical, members: [...canonical.members, "unexpected.txt"] })).toBe(false);
  });

  test("rejects a mismatched commit or version", () => {
    expect(accepts({ ...canonical, sourceCommit: "a".repeat(40) })).toBe(false);
    expect(accepts({ ...canonical, version: "1.4.3" })).toBe(false);
  });
});
