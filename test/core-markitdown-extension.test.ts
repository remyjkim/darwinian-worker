// ABOUTME: Verifies MarkItDown extension setup planning without invoking real uv or markitdown.
// ABOUTME: Protects install planning semantics and project config output.

import { describe, expect, test } from "bun:test";

describe("markitdown extension setup planner", () => {
  test("builds default project config with skills enabled", async () => {
    const { buildMarkitdownProjectConfig } = await import("../cli/core/extensions/markitdown");

    expect(buildMarkitdownProjectConfig({})).toEqual({ enabled: true, skills: true });
    expect(buildMarkitdownProjectConfig({ skills: false })).toEqual({ enabled: true, skills: false });
  });

  test("plans uv install only when runtime is missing and install is approved", async () => {
    const { planMarkitdownSetup } = await import("../cli/core/extensions/markitdown");

    const plan = planMarkitdownSetup({
      projectDir: "/tmp/project",
      markitdownAvailable: false,
      uvAvailable: true,
      installApproved: true,
      skills: true,
    });

    expect(plan.commands.map((command) => command.cmd)).toEqual([
      ["uv", "tool", "install", "--python", "3.12", "markitdown[all]"],
    ]);
    expect(plan.projectConfigChange.config).toEqual({ enabled: true, skills: true });
  });

  test("does not plan install when markitdown already exists", async () => {
    const { planMarkitdownSetup } = await import("../cli/core/extensions/markitdown");

    const plan = planMarkitdownSetup({
      projectDir: "/tmp/project",
      markitdownAvailable: true,
      uvAvailable: false,
      installApproved: false,
      skills: true,
    });

    expect(plan.commands).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  test("reports missing uv when install is approved but uv is unavailable", async () => {
    const { planMarkitdownSetup } = await import("../cli/core/extensions/markitdown");

    const plan = planMarkitdownSetup({
      projectDir: "/tmp/project",
      markitdownAvailable: false,
      uvAvailable: false,
      installApproved: true,
      skills: true,
    });

    expect(plan.commands).toEqual([]);
    expect(plan.warnings).toContain("uv command is required to install MarkItDown.");
  });
});
