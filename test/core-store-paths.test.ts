// ABOUTME: Verifies drwn store path helpers for Git-backed card storage.
// ABOUTME: Protects the Wave 1 bare-repo and extraction directory layout.

import { describe, expect, test } from "bun:test";
import {
  assertSafePathPart,
  resolveCardBareRepoPath,
  resolveCatalogPath,
  resolveCatalogsDir,
  resolveCatalogsIndexPath,
  resolveExtractedPath,
  resolveGeneratedHooksDir,
} from "../cli/core/store-paths";

describe("Git-backed store paths", () => {
  test("resolveCardBareRepoPath maps scoped names to one bare repo", () => {
    expect(resolveCardBareRepoPath("/agents", "@me/foo")).toBe("/agents/drwn/cards/@me/foo.git");
  });

  test("resolveCardBareRepoPath maps unscoped names to one bare repo", () => {
    expect(resolveCardBareRepoPath("/agents", "foo")).toBe("/agents/drwn/cards/foo.git");
  });

  test("resolveExtractedPath validates tree SHA values", () => {
    expect(() => resolveExtractedPath("/agents", "not-a-sha")).toThrow("invalid tree sha");
    const validSha = "a".repeat(40);
    expect(resolveExtractedPath("/agents", validSha)).toBe(`/agents/drwn/extracted/${validSha}`);
  });

  test("resolveCatalogPath slugifies URLs into stable clone directories", () => {
    expect(resolveCatalogsDir("/agents")).toBe("/agents/drwn/catalogs");
    expect(resolveCatalogsIndexPath("/agents")).toBe("/agents/drwn/catalogs.json");
    expect(resolveCatalogPath("/agents", "https://github.com/team/cards.git"))
      .toBe("/agents/drwn/catalogs/github.com_team_cards");
  });

  test("assertSafePathPart rejects path traversal and separators", () => {
    expect(() => assertSafePathPart("policy-name", "hook policy")).not.toThrow();

    for (const value of ["", "..", ".hidden", "a/b", "a\\b", "/abs"]) {
      expect(() => assertSafePathPart(value, "hook policy")).toThrow(`Invalid hook policy: ${value}`);
    }
  });

  test("resolveGeneratedHooksDir maps hook runtimes into generated hook directories", () => {
    expect(resolveGeneratedHooksDir("/project/.agents/drwn/generated", "claude-code"))
      .toBe("/project/.agents/drwn/generated/hooks/claude");
    expect(resolveGeneratedHooksDir("/project/.agents/drwn/generated", "codex"))
      .toBe("/project/.agents/drwn/generated/hooks/codex");
    expect(resolveGeneratedHooksDir("/project/.agents/drwn/generated", "mastra"))
      .toBe("/project/.agents/drwn/generated/hooks/mastra");
    expect(() => resolveGeneratedHooksDir("/generated", "cursor" as never)).toThrow("Invalid hook runtime: cursor");
  });
});
