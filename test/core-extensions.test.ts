// ABOUTME: Verifies extension registry metadata for built-in capability extensions.
// ABOUTME: Keeps Beads and Parallel modeled as extensions rather than ad hoc command branches.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getExtension, listExtensions } from "../cli/core/extensions/registry";

describe("extension registry", () => {
  test("lists built-in extension definitions", () => {
    expect(listExtensions().map((extension) => extension.id)).toEqual(["beads", "parallel", "markitdown"]);
  });

  test("defines beads as project-scoped CLI-first extension", () => {
    const beads = getExtension("beads");
    expect(beads?.displayName).toBe("Beads");
    expect(beads?.scopes).toContain("project");
    expect(beads?.defaultModes).toContain("cli");
    expect(beads?.defaultModes).toContain("hooks");
    expect(beads?.commands.some((command) => command.name === "bd" && command.required)).toBe(true);
    expect(beads?.commands.some((command) => command.name === "beads-mcp" && !command.required)).toBe(true);
    expect(beads?.skills.map((skill) => skill.name)).toContain("beads-task-tracking");
  });

  test("defines parallel as global CLI skill extension", () => {
    const parallel = getExtension("parallel");
    expect(parallel?.displayName).toBe("Parallel");
    expect(parallel?.scopes).toContain("global");
    expect(parallel?.defaultModes).toContain("cli");
    expect(parallel?.defaultModes).toContain("skills");
    expect(parallel?.commands.some((command) => command.name === "parallel-cli")).toBe(true);
    expect(parallel?.skills.map((skill) => skill.name)).toContain("parallel-web-search");
    expect(parallel?.mcpServers.map((server) => server.name)).toEqual(["parallel-search", "parallel-task"]);
  });

  test("defines markitdown as a CLI-first document conversion extension", () => {
    const markitdown = getExtension("markitdown");
    expect(markitdown?.displayName).toBe("MarkItDown");
    expect(markitdown?.scopes).toEqual(["global", "project"]);
    expect(markitdown?.defaultModes).toEqual(["cli", "skills"]);
    expect(markitdown?.commands.some((command) => command.name === "markitdown" && command.required)).toBe(true);
    expect(markitdown?.commands.some((command) => command.name === "uv" && !command.required)).toBe(true);
    expect(markitdown?.commands.find((command) => command.name === "markitdown")?.purpose).toBe("runtime");
    expect(markitdown?.commands.find((command) => command.name === "uv")?.purpose).toBe("installer");
    expect(markitdown?.skills.map((skill) => skill.name)).toEqual(["markitdown-document-conversion"]);
    expect(markitdown?.mcpServers).toEqual([]);
  });

  test("returns null for unknown extensions", () => {
    expect(getExtension("missing")).toBeNull();
  });

  test("beads task tracking skill exists", () => {
    const skillPath = join(process.cwd(), "skills", "shared", "beads-task-tracking", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
  });
});
