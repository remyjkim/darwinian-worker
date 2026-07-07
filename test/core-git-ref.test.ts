// ABOUTME: Verifies upstream git ref parsing for card source provenance sync.
// ABOUTME: Guards against local-path upstream values that cannot be shared across machines.

import { describe, expect, test } from "bun:test";
import { DrwnError } from "../cli/core/errors";
import { formatUpstreamRef, parseUpstreamRef } from "../cli/core/git-ref";

describe("parseUpstreamRef", () => {
  test("parses git URL with subpath and rev", () => {
    expect(parseUpstreamRef("git+https://h/r.git#skills/x@v1.2.0")).toEqual({
      gitUrl: "https://h/r.git",
      subpath: "skills/x",
      rev: "v1.2.0",
    });
  });

  test("parses git URL with subpath and no rev", () => {
    expect(parseUpstreamRef("git+https://h/r.git#skills/x")).toEqual({
      gitUrl: "https://h/r.git",
      subpath: "skills/x",
      rev: null,
    });
  });

  test("rejects bare local paths", () => {
    expect(() => parseUpstreamRef("/tmp/local/skills/x")).toThrow(DrwnError);
    expect(() => parseUpstreamRef("file:../cards/x")).toThrow(DrwnError);
    try {
      parseUpstreamRef("/tmp/local/skills/x");
    } catch (error) {
      expect((error as DrwnError).code).toBe("UPSTREAM_LOCAL_PATH_REJECTED");
    }
  });
});

describe("formatUpstreamRef", () => {
  test("round-trips parsed refs with rev", () => {
    const parsed = parseUpstreamRef("git+https://h/r.git#skills/x@v1.2.0");
    expect(formatUpstreamRef(parsed)).toBe("git+https://h/r.git#skills/x@v1.2.0");
  });

  test("round-trips parsed refs without rev", () => {
    const parsed = parseUpstreamRef("git+https://h/r.git#skills/x");
    expect(formatUpstreamRef(parsed)).toBe("git+https://h/r.git#skills/x");
  });
});
