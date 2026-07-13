// ABOUTME: Verifies partial writes select ownership by declared surface and target.
// ABOUTME: Prevents path naming from controlling retention or cleanup decisions.

import { describe, expect, test } from "bun:test";
import { retainUnselectedProjectionOwnership } from "../cli/core/projection-ownership";
import type { ManagedPath } from "../cli/core/write-record";

function entry(
  path: string,
  surface: ManagedPath["surface"],
  target?: ManagedPath["target"],
): Extract<ManagedPath, { kind: "managed-content" }> {
  return {
    path,
    kind: "managed-content",
    surface,
    ...(target ? { target } : {}),
    contentHash: `sha256-${"a".repeat(64)}`,
  };
}

const prior = [
  entry("generated/workers.json", "worker"),
  entry("arbitrary/one", "mcp", "claude"),
  entry("arbitrary/two", "mcp", "cursor"),
  entry("arbitrary/three", "skill", "codex"),
  entry("arbitrary/four", "hook", "claude"),
  entry("arbitrary/five", "hook", "mastra"),
];

describe("retainUnselectedProjectionOwnership", () => {
  test.each([
    [{}, []],
    [{ mcpOnly: true }, ["arbitrary/three", "arbitrary/four", "arbitrary/five"]],
    [{ skillsOnly: true }, ["arbitrary/one", "arbitrary/two", "arbitrary/four", "arbitrary/five"]],
    [{ target: "claude" as const }, ["arbitrary/two", "arbitrary/three", "arbitrary/five"]],
    [{ target: "cursor" as const }, ["arbitrary/one", "arbitrary/three", "arbitrary/four", "arbitrary/five"]],
    [{ mcpOnly: true, target: "claude" as const }, ["arbitrary/two", "arbitrary/three", "arbitrary/four", "arbitrary/five"]],
    [{ skillsOnly: true, target: "codex" as const }, ["arbitrary/one", "arbitrary/two", "arbitrary/four", "arbitrary/five"]],
  ])("retains only ownership outside selection %j", (selection, expectedPaths) => {
    expect(retainUnselectedProjectionOwnership(prior, [], selection).map((item) => item.path))
      .toEqual([...expectedPaths].sort((left, right) => left.localeCompare(right)));
  });

  test("desired ownership wins over retained ownership for the same path", () => {
    const desired = entry("arbitrary/two", "mcp", "cursor");
    desired.contentHash = `sha256-${"b".repeat(64)}`;

    expect(retainUnselectedProjectionOwnership(prior, [desired], { target: "claude" }))
      .toContainEqual(desired);
    expect(retainUnselectedProjectionOwnership(prior, [desired], { target: "claude" })
      .filter((item) => item.path === desired.path)).toHaveLength(1);
  });
});
