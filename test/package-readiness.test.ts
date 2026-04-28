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
    expect(pkg.name).toBe("beginning-harness");
    expect((pkg.bin as Record<string, string>).bgng).toBe("cli/index.ts");
    expect((pkg.scripts as Record<string, string>).bgng).toBe("bun run cli/index.ts");
    expect(pkg.homepage).toBe("https://github.com/remyjkim/beginning-harness");
    expect(pkg.bugs).toEqual({ url: "https://github.com/remyjkim/beginning-harness/issues" });
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/remyjkim/beginning-harness.git",
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
    expect(paths).toContain("the-beginning-harness.png");
    expect(paths).toContain("skills/shared/frontend-design/SKILL.md");
  });
});
