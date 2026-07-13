// ABOUTME: Verifies sandbox profile availability and argv wrapping behavior.
// ABOUTME: Ensures required sandbox controls fail closed instead of running unsandboxed.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { parsePolicyText } from "../src/policy/load";
import { createSandboxProfile } from "../src/exec/sandbox/profile";
import { runCommand } from "../src/exec/executor";

const policyRequired = parsePolicyText(
  `
version: 1
default: deny
allow:
  - program: git
    risk: low
roots_allow: ["/tmp/project"]
sandbox:
  required: true
`,
  { homeDir: "/tmp/home" },
);

describe("createSandboxProfile", () => {
  test("macOS profile prefixes sandbox-exec when available", async () => {
    const sandbox = createSandboxProfile("darwin", { exists: (path) => path === "/usr/bin/sandbox-exec" });

    await expect(sandbox.assertAvailable(policyRequired)).resolves.toBeUndefined();
    await expect(sandbox.wrap(["git", "status"], "/tmp/project", policyRequired)).resolves.toEqual(
      expect.arrayContaining(["/usr/bin/sandbox-exec", "git", "status"]),
    );
  });

  test("macOS profile allows read-only system runtime paths needed to exec tools", async () => {
    const sandbox = createSandboxProfile("darwin", { exists: (path) => path === "/usr/bin/sandbox-exec" });
    const wrapped = await sandbox.wrap(["pwd"], "/tmp/project", policyRequired);
    const profile = wrapped[2] ?? "";

    expect(profile).toContain('(allow file-read* (subpath "/bin"))');
    expect(profile).toContain('(allow file-read* (subpath "/usr"))');
    expect(profile).toContain('(allow file-read* (subpath "/System"))');
  });

  test("macOS profile allows the null device for tools that redirect or spawn git", async () => {
    const sandbox = createSandboxProfile("darwin", { exists: (path) => path === "/usr/bin/sandbox-exec" });
    const wrapped = await sandbox.wrap(["git", "status"], "/tmp/project", policyRequired);
    const profile = wrapped[2] ?? "";

    expect(profile).toContain('(allow file-read* (literal "/dev/null"))');
    expect(profile).toContain('(allow file-write* (literal "/dev/null"))');
  });

  test.skipIf(process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec"))(
    "macOS wrapped argv can execute ordinary system tools",
    async () => {
      const sandbox = createSandboxProfile("darwin");
      const wrapped = await sandbox.wrap(["pwd"], "/tmp", parsePolicyText(
        `version: 1\ndefault: deny\nallow:\n  - program: pwd\n    risk: low\nroots_allow: ["/tmp"]\nsandbox:\n  required: true\n`,
      ));

      const result = await runCommand({ argv: wrapped, cwd: "/tmp", env: { PATH: "/usr/bin:/bin" } });

      expect(result.exitCode).toBe(0);
      expect(["/tmp", "/private/tmp"]).toContain(result.stdout.trim());
    },
  );

  test("sandbox unavailable plus required policy denies", async () => {
    const sandbox = createSandboxProfile("darwin", { exists: () => false });

    await expect(sandbox.assertAvailable(policyRequired)).rejects.toThrow(/sandbox-exec/);
  });

  test("Linux profile uses bwrap when available", async () => {
    const sandbox = createSandboxProfile("linux", { exists: (path) => path === "bwrap" });

    await expect(sandbox.wrap(["git", "status"], "/tmp/project", policyRequired)).resolves.toEqual(
      expect.arrayContaining(["bwrap", "--bind", "/tmp/project", "/tmp/project", "git", "status"]),
    );
  });

  test("Windows profile reports unsupported when required", async () => {
    const sandbox = createSandboxProfile("win32", { exists: () => false });

    await expect(sandbox.assertAvailable(policyRequired)).rejects.toThrow(/unsupported/);
  });
});
