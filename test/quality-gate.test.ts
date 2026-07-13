// ABOUTME: Verifies the release-quality gate script exists, is wired in package.json, and runs successfully.
// ABOUTME: Protects the single-entry verification workflow used for release-readiness checks.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("quality gate", () => {
  test("verify:release script exists and returns exit 0 in test mode", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["verify:release"]).toBeDefined();

    const proc = Bun.spawn(["bun", "run", "verify:release", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        QUALITY_GATE_TEST_MODE: "1",
      },
    });

    const stdout = await new Response(proc.stdout).text();
    const parsed = JSON.parse(stdout) as { ok: boolean; checks: Array<{ name: string }>; warnings: string[] };

    expect(await proc.exited).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.checks.some((check) => check.name === "package metadata")).toBe(true);
    expect(parsed.checks.some((check) => check.name === "store export security")).toBe(true);
  });
});
