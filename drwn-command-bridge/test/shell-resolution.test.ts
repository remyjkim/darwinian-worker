// ABOUTME: Verifies shell mode never uses ambient or WSL bash resolution.
// ABOUTME: Protects Windows host execution from crossing into the wrong runtime.

import { describe, expect, test } from "bun:test";
import { resolveShellForPlatform } from "../src/exec/shell";

describe("resolveShellForPlatform", () => {
  test("does not resolve a shell for default argv execution", () => {
    expect(resolveShellForPlatform("darwin", { shell: false })).toBeNull();
  });

  test("never returns Windows System32 bash", () => {
    expect(() =>
      resolveShellForPlatform("win32", {
        shell: true,
        exists: (path) => path === "C:\\Windows\\System32\\bash.exe",
        env: { SystemRoot: "C:\\Windows" },
      }),
    ).toThrow(/Git Bash/);
  });

  test("returns known Git Bash path on Windows when present", () => {
    const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";

    expect(
      resolveShellForPlatform("win32", {
        shell: true,
        exists: (path) => path === gitBash,
        env: { ProgramFiles: "C:\\Program Files", SystemRoot: "C:\\Windows" },
      }),
    ).toBe(gitBash);
  });

  test("returns absolute bash path on macOS", () => {
    expect(resolveShellForPlatform("darwin", { shell: true, exists: (path) => path === "/bin/bash" })).toBe("/bin/bash");
  });
});
