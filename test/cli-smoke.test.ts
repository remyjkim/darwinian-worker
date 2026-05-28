// ABOUTME: Verifies the minimal Clipanion CLI entrypoint exists and responds to basic flags.
// ABOUTME: Protects the initial command shell while deeper command implementations are added.

import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("CLI entrypoint", () => {
  test("--help exits 0 and mentions 'bgng'", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();

    expect(await proc.exited).toBe(0);
    expect(stdout).toContain("bgng");
  });

  test("--help lists write and scan and omits removed apply and sync commands", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();

    expect(await proc.exited).toBe(0);
    expect(stdout).toContain("bgng write");
    expect(stdout).toContain("bgng mcp write");
    expect(stdout).toContain("bgng scan");
    expect(stdout).toContain("bgng apply");
    expect(stdout).not.toContain("bgng mcp apply");
    expect(stdout).not.toContain("bgng sync");
    expect(stdout).not.toContain("bgng mcp sync");
    expect(stdout).not.toContain("bgng skills sync");
  });

  test("--version exits 0", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(await proc.exited).toBe(0);
  });

  test("unknown command exits non-zero", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "nonexistent"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(await proc.exited).not.toBe(0);
  });

  test("exits with helpful error when run outside a repo", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "status"], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        AGENTS_REPO_ROOT: "/tmp/not-a-repo",
        AGENTS_HOME_DIR: "/tmp",
      },
    });
    const stderr = await new Response(proc.stderr).text();

    expect(await proc.exited).not.toBe(0);
    expect(stderr).toMatch(/config\.json|not.*repo|not found/i);
  });

  test("uses the packaged repo root when invoked outside a repo without AGENTS_REPO_ROOT", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bgng-outside-repo-"));
    const homeDir = await mkdtemp(join(tmpdir(), "bgng-home-"));
    const entrypoint = new URL("../cli/index.ts", import.meta.url).pathname;
    const proc = Bun.spawn(["bun", "run", entrypoint, "status", "--json"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        AGENTS_HOME_DIR: homeDir,
        AGENTS_DIR: join(homeDir, ".agents"),
      },
    });

    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);

    const parsed = JSON.parse(stdout) as { repoRoot: string };
    expect(resolve(parsed.repoRoot)).toBe(resolve(process.cwd()));
  });
});
