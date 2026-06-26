// ABOUTME: Verifies package and distribution readiness assumptions for the current release posture.
// ABOUTME: Confirms the package contract includes the hosted repository metadata expected for OSS staging.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("package readiness", () => {
  test("package has required metadata and repository wiring", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as Record<string, unknown>;

    for (const key of ["name", "version", "description", "license", "author", "keywords", "bin"]) {
      expect(pkg[key]).toBeDefined();
    }

    expect(existsSync(join(process.cwd(), "LICENSE"))).toBe(true);
    expect(existsSync(join(process.cwd(), "README.md"))).toBe(true);
    expect(existsSync(join(process.cwd(), "CONTRIBUTING.md"))).toBe(true);
    expect(pkg.name).toBe("darwinian-harness");
    expect((pkg.bin as Record<string, string>).drwn).toBe("cli/index.ts");
    expect((pkg.bin as Record<string, string>)["drwn-hx"]).toBe("cli/index.ts");
    expect((pkg.scripts as Record<string, string>).drwn).toBe("bun run cli/index.ts");
    expect((pkg.scripts as Record<string, string>).sync).toBeUndefined();
    expect(pkg.homepage).toBe("https://github.com/remyjkim/darwinian-harness");
    expect(pkg.bugs).toEqual({ url: "https://github.com/remyjkim/darwinian-harness/issues" });
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/remyjkim/darwinian-harness.git",
    });
  });

  test("release gate no longer reports repository metadata warnings", async () => {
    const proc = Bun.spawn(["bun", "run", "verify:release", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        QUALITY_GATE_TEST_MODE: "1",
      },
    });

    const stdout = await new Response(proc.stdout).text();
    const parsed = JSON.parse(stdout) as { ok: boolean; warnings: string[] };

    expect(await proc.exited).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings).not.toContain("repository metadata unresolved");
  });

  test("release gate reports schema package coupling", async () => {
    const proc = Bun.spawn(["bun", "run", "verify:release", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        QUALITY_GATE_TEST_MODE: "1",
      },
    });

    const stdout = await new Response(proc.stdout).text();
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      checks: Array<{ name: string; ok: boolean; details?: string }>;
    };
    const schemaCheck = parsed.checks.find((check) => check.name === "schema package coupling");

    expect(await proc.exited).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(schemaCheck?.ok).toBe(true);
    expect(schemaCheck?.details).toContain("drwn-catalog-schema@");
  });

  test("CLI CI workflow is required-check safe", () => {
    const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

    expect(workflow).toContain("name: CLI CI");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("name: Validate");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("bun run typecheck");
    expect(workflow).toContain("bun test");
    expect(workflow).toContain("bun run verify:release");
    expect(workflow).not.toContain("paths:");
    expect(workflow).not.toContain("paths-ignore:");
  });

  test("release workflow gates npm publish and keeps dry runs outside the protected environment", () => {
    const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "release.yml"), "utf8");

    expect(workflow).toContain("name: CLI Release");
    expect(workflow).toContain("tags:");
    expect(workflow).toContain("- 'v*'");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("dry_run:");
    expect(workflow).toContain("name: npm-publish");
    expect(workflow).toContain("NPM_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(workflow).toContain("if: ${{ github.event_name == 'push' || inputs.dry_run == false }}");
    expect(workflow).toContain("name: Dry run complete");
    expect(workflow).toContain("if: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run == true }}");
    expect(workflow).toContain("npm install -g \"darwinian-harness@${{ needs.validate.outputs.version }}\"");
    expect(workflow).toContain("runs-on: macos-latest");
    expect(workflow).toContain("gh release create \"$TAG\"");
    expect(workflow).toContain("--generate-notes");
  });

  test("npm pack excludes local secrets, planning docs, and tests", async () => {
    const proc = Bun.spawn(["npm", "pack", "--dry-run", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
      env: process.env,
    });

    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);

    const parsed = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
    const paths = parsed[0]?.files.map((file) => file.path) ?? [];

    expect(paths.some((path) => path === ".env" || path.startsWith(".ai/"))).toBe(false);
    expect(paths.some((path) => path.startsWith("test/"))).toBe(false);
    expect(paths).not.toContain("sync-mcp.ts");
    expect(paths).toContain("cli/commands/write.ts");
    expect(paths).toContain("cli/commands/mcp/write.ts");
    expect(paths).not.toContain("cli/commands/apply.ts");
    expect(paths).not.toContain("cli/commands/mcp/apply.ts");
    expect(paths).not.toContain("cli/commands/sync.ts");
    expect(paths).not.toContain("cli/commands/mcp/sync.ts");
    expect(paths).not.toContain("cli/commands/skills/sync.ts");
    expect(paths).not.toContain("config.json");
    expect(paths).not.toContain("mcp-servers.json");
    expect(paths).toContain("registry/config.json");
    expect(paths).toContain("registry/mcp-servers.json");
    expect(paths).toContain("docs/assets/darwinian-harness-logo.png");
    expect(paths).toContain("skills/shared/frontend-design/SKILL.md");
  });
});
