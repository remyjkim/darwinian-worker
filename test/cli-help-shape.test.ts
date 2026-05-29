// ABOUTME: Asserts registered drwn commands render rich per-command help.
// ABOUTME: Protects against threadbare help and stale command-description regressions.

import { describe, expect, test } from "bun:test";

async function helpFor(args: string[]) {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", ...args, "--help"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

function extractCommandPaths(topLevelHelp: string) {
  return topLevelHelp
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("drwn "))
    .filter((line) => !line.startsWith("drwn -"))
    .map((line) =>
      line
        .replace(/^drwn\s+/, "")
        .replace(/\[[^\]]+\]/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\.\.\./g, "")
        .split(/\s+/)
        .filter(Boolean),
    )
    .filter((path) => path.length > 0);
}

const REQUIRED_SNIPPETS: Record<string, string[]> = {
  init: ["TTY", ".gitignore", "drwn init --non-interactive"],
  "add mcp": ["Prompts in a TTY", "safe no-op"],
  "add skill": ["Prompts in a TTY", "--all", "bundle"],
  "extensions setup": ["Beads only", "MarkItDown only", "--no-install"],
  "extensions doctor": ["all extensions"],
  "mcp list": ["Project-aware"],
  "library defaults add skill": ["curates it into"],
  "library defaults add mcp": ["safe no-op"],
};

describe("drwn command help", () => {
  test("every registered command renders Details and Examples sections", async () => {
    const topLevel = await helpFor([]);
    expect(topLevel.exitCode).toBe(0);

    const commands = extractCommandPaths(topLevel.stdout);
    expect(commands.length).toBeGreaterThan(0);

    for (const cmd of commands) {
      const result = await helpFor(cmd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^Details$/m);
      expect(result.stdout).toMatch(/^Examples$/m);
    }
  });

  test("high-leverage commands explain behavior hidden by terse descriptions", async () => {
    for (const [command, snippets] of Object.entries(REQUIRED_SNIPPETS)) {
      const result = await helpFor(command.split(" "));
      expect(result.exitCode).toBe(0);
      for (const snippet of snippets) {
        expect(result.stdout).toContain(snippet);
      }
    }
  });
});
