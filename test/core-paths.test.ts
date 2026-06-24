// ABOUTME: Validates the shared path resolution helpers used by the CLI and sync wrapper.
// ABOUTME: Keeps low-level path semantics stable while higher-level modules are refactored.

import { describe, expect, test } from "bun:test";

describe("path resolution", () => {
  test("expandHomePath replaces leading ~", async () => {
    const { expandHomePath } = await import("../cli/core/paths");

    expect(expandHomePath("~/foo/bar", "/home/test")).toBe("/home/test/foo/bar");
    expect(expandHomePath("~", "/home/test")).toBe("/home/test");
    expect(expandHomePath("/absolute/path", "/home/test")).toBe("/absolute/path");
  });

  test("resolveAgentsDir defaults to homeDir/.agents", async () => {
    const { resolveAgentsDir } = await import("../cli/core/paths");

    expect(resolveAgentsDir("/home/test")).toBe("/home/test/.agents");
  });

  test("resolveToolPaths returns expected tool directories", async () => {
    const { resolveToolPaths } = await import("../cli/core/paths");
    const paths = resolveToolPaths("/home/test");

    expect(paths.claudeSkills).toBe("/home/test/.claude/skills");
    expect(paths.claudeMcp).toBe("/home/test/.mcp.json");
    expect(paths.codexSkills).toBe("/home/test/.codex/skills");
    expect(paths.claudeSettings).toBe("/home/test/.claude/settings.json");
  });

  test("resolveSkillScopeDirs returns all four scope directories", async () => {
    const { resolveSkillScopeDirs } = await import("../cli/core/paths");
    const dirs = resolveSkillScopeDirs("/repo");

    expect(dirs.shared).toBe("/repo/skills/shared");
    expect(dirs.claudeOnly).toBe("/repo/skills/claude-only");
    expect(dirs.codexOnly).toBe("/repo/skills/codex-only");
    expect(dirs.experimental).toBe("/repo/skills/experimental");
  });

  test("resolveSkillPackagesRoot returns the managed package cache root", async () => {
    const { resolveSkillPackagesRoot } = await import("../cli/core/paths");
    expect(resolveSkillPackagesRoot("/home/test/.agents")).toBe("/home/test/.agents/packages/skills");
  });

  test("resolveSkillPackageRoot supports scoped package names as nested paths", async () => {
    const { resolveSkillPackageRoot } = await import("../cli/core/paths");
    expect(resolveSkillPackageRoot("/home/test/.agents", "@acme/skills-core")).toBe(
      "/home/test/.agents/packages/skills/@acme/skills-core",
    );
  });

  test("resolveSkillPackageVersionRoot appends the version under the package root", async () => {
    const { resolveSkillPackageVersionRoot } = await import("../cli/core/paths");
    expect(resolveSkillPackageVersionRoot("/home/test/.agents", "@acme/skills-core", "1.2.0")).toBe(
      "/home/test/.agents/packages/skills/@acme/skills-core/1.2.0",
    );
  });

  test("resolveSkillPackageCurrentLink returns the current symlink path", async () => {
    const { resolveSkillPackageCurrentLink } = await import("../cli/core/paths");
    expect(resolveSkillPackageCurrentLink("/home/test/.agents", "@acme/skills-core")).toBe(
      "/home/test/.agents/packages/skills/@acme/skills-core/current",
    );
  });
});
