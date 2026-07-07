// ABOUTME: Verifies projection vs merge surface classification from write-record kinds.
// ABOUTME: Guards PD-1 semantics for MCP and skill materialization surfaces.

import { describe, expect, test } from "bun:test";
import { surfaceKind, surfaceKindForPath } from "../cli/core/surface-kind";

describe("surfaceKind", () => {
  test("classifies managed-directory and managed-content as projection", () => {
    expect(surfaceKind({ path: ".claude/skills/x", kind: "managed-directory", contentHash: "x" })).toBe("projection");
    expect(surfaceKind({ path: ".mcp.json", kind: "managed-content", contentHash: "x" })).toBe("projection");
    expect(surfaceKind({ path: ".cursor/mcp.json", kind: "managed-content", contentHash: "x" })).toBe("projection");
  });

  test("classifies managed-fields as merge", () => {
    expect(
      surfaceKind({ path: ".claude.json", kind: "managed-fields", fields: ["context7"], fieldHashes: { context7: "x" } }),
    ).toBe("merge");
    expect(
      surfaceKind({ path: ".codex/config.toml", kind: "managed-fields", fields: ["context7"], fieldHashes: { context7: "x" } }),
    ).toBe("merge");
  });

  test("surfaceKindForPath mirrors kind-based classification", () => {
    expect(surfaceKindForPath(".codex/config.toml", "managed-fields")).toBe("merge");
    expect(surfaceKindForPath(".mcp.json", "managed-content")).toBe("projection");
  });
});
