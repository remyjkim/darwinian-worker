// ABOUTME: Verifies pure archive input resolution for analyze sessions.
// ABOUTME: Protects --archive, --fresh, existing archive, inline, and dry-run branches.

import { describe, expect, test } from "bun:test";
import { resolveAnalyzeInput } from "../cli/core/analyze/resolve-input";

describe("resolveAnalyzeInput", () => {
  test("uses explicit archive first", async () => {
    const result = await resolveAnalyzeInput({
      archive: "/tmp/x.tar.gz",
      fresh: true,
      exportsDir: "/exports",
      inlineExport: async () => "/tmp/fresh.tar.gz",
      findNewest: async () => "/exports/existing.tar.gz",
    });
    expect(result).toEqual({ path: "/tmp/x.tar.gz", source: "explicit" });
  });

  test("fresh forces inline export", async () => {
    const result = await resolveAnalyzeInput({
      fresh: true,
      exportsDir: "/exports",
      inlineExport: async () => "/tmp/fresh.tar.gz",
      findNewest: async () => "/exports/existing.tar.gz",
    });
    expect(result).toEqual({ path: "/tmp/fresh.tar.gz", source: "fresh" });
  });

  test("uses existing newest before inline", async () => {
    const result = await resolveAnalyzeInput({
      exportsDir: "/exports",
      inlineExport: async () => "/tmp/fresh.tar.gz",
      findNewest: async () => "/exports/existing.tar.gz",
    });
    expect(result).toEqual({ path: "/exports/existing.tar.gz", source: "existing" });
  });

  test("falls back to inline", async () => {
    const result = await resolveAnalyzeInput({
      exportsDir: "/exports",
      inlineExport: async () => "/tmp/inline.tar.gz",
      findNewest: async () => null,
    });
    expect(result).toEqual({ path: "/tmp/inline.tar.gz", source: "inline" });
  });

  test("dry-run with no archive does not call inline export", async () => {
    let called = false;
    const result = await resolveAnalyzeInput({
      dryRun: true,
      exportsDir: "/exports",
      inlineExport: async () => {
        called = true;
        return "/tmp/inline.tar.gz";
      },
      findNewest: async () => null,
    });
    expect(called).toBe(false);
    expect(result).toEqual({ path: null, source: "would-inline" });
  });
});
