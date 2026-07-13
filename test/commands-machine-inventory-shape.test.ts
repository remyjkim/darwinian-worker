// ABOUTME: Pins the first supported machine inventory command grammar.
// ABOUTME: Ensures prototype Library, Store, and skill-package paths have no compatibility aliases.

import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { initializeMachineConfig } from "../cli/core/machine-config";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

async function topLevelHelp() {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", "--help"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { stdout, stderr, exitCode: await proc.exited };
}

const requiredPaths = [
  "drwn machine skill list",
  "drwn machine skill show",
  "drwn machine skill references",
  "drwn machine skill install",
  "drwn machine skill update",
  "drwn machine skill uninstall",
  "drwn machine skill enable",
  "drwn machine skill disable",
  "drwn machine mcp list",
  "drwn machine mcp show",
  "drwn machine mcp references",
  "drwn machine mcp add",
  "drwn machine mcp update",
  "drwn machine mcp remove",
  "drwn machine mcp enable",
  "drwn machine mcp disable",
  "drwn machine inventory export",
  "drwn machine inventory verify",
  "drwn machine inventory bundle",
  "drwn machine inventory sync",
  "drwn machine inventory gc",
  "drwn catalog list",
  "drwn catalog add",
  "drwn catalog refresh",
  "drwn catalog remove",
] as const;

const removedPaths = [
  "drwn library ",
  "drwn store ",
  "drwn skills ",
] as const;

async function snapshotTree(root: string) {
  const snapshot: Array<[string, string]> = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true }).then((entries) => entries.sort((a, b) => a.name.localeCompare(b.name)))) {
      const path = join(directory, entry.name);
      const name = relative(root, path).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        snapshot.push([`${name}/`, ""]);
        await walk(path);
      } else if (entry.isFile()) {
        snapshot.push([name, Buffer.from(await readFile(path)).toString("base64")]);
      } else {
        snapshot.push([name, entry.isSymbolicLink() ? "symlink" : "other"]);
      }
    }
  }
  await walk(root);
  return snapshot;
}

describe("machine inventory command grammar", () => {
  test("registers only the approved machine inventory and catalog paths", async () => {
    const result = await topLevelHelp();

    expect(result.exitCode).toBe(0);
    for (const path of requiredPaths) expect(result.stdout).toContain(path);
    for (const path of removedPaths) expect(result.stdout).not.toContain(path);
  });

  test("obsolete namespaces are ordinary unknown syntax without state mutation", async () => {
    const fixture = await scaffoldCliFixture();
    const machinePath = resolveMachineConfigPath(fixture.agentsDir);
    await initializeMachineConfig(machinePath);
    const before = await snapshotTree(fixture.agentsDir);
    try {
      for (const args of [
        ["library", "list"],
        ["store", "status"],
        ["skills", "list"],
        ["skills", "packages", "list"],
      ]) {
        const result = await runAgentsCli(args, {
          AGENTS_REPO_ROOT: fixture.repoRoot,
          AGENTS_HOME_DIR: fixture.homeDir,
          AGENTS_DIR: fixture.agentsDir,
        });
        expect(result.exitCode).not.toBe(0);
        expect(`${result.stdout}\n${result.stderr}`).toMatch(/Unknown Syntax Error|Command not found/i);
        expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/COMMAND_MOVED|deprecated|renamed/i);
      }
      expect(await snapshotTree(fixture.agentsDir)).toEqual(before);
    } finally {
      await cleanupTempRoots([fixture.root]);
    }
  });

  test("pins explicit selectors and options without force or replacement escape hatches", async () => {
    const fixture = await scaffoldCliFixture();
    try {
      const env = {
        AGENTS_REPO_ROOT: fixture.repoRoot,
        AGENTS_HOME_DIR: fixture.homeDir,
        AGENTS_DIR: fixture.agentsDir,
      };
      const transferForbidden = [
        "--force", "--replace", "--delete", "--activate", "--enable", "--prune", "--project",
        "--include", "--exclude", "--unsafe", "--stdin", "--stdout", "--url",
      ];
      const expectations: Array<{ args: string[]; includes: string[]; excludes?: string[] }> = [
        { args: ["machine", "skill", "show", "--help"], includes: ["<skill-id>", "--package"] },
        { args: ["machine", "skill", "references", "--help"], includes: ["<skill-id>", "--package", "--project"] },
        { args: ["machine", "skill", "install", "--help"], includes: ["--as", "--scope", "--package-name", "--version", "--dry-run"], excludes: ["--replace", "--force"] },
        { args: ["machine", "skill", "update", "--help"], includes: ["--from", "--as", "--scope", "--version", "--project", "--dry-run"], excludes: ["--package-name", "--replace", "--force"] },
        { args: ["machine", "skill", "uninstall", "--help"], includes: ["--project", "--dry-run"], excludes: ["--replace", "--force"] },
        { args: ["machine", "mcp", "references", "--help"], includes: ["<server-id>", "--project"] },
        { args: ["machine", "mcp", "update", "--help"], includes: ["--from", "--project", "--dry-run"], excludes: ["--replace", "--force"] },
        { args: ["machine", "mcp", "remove", "--help"], includes: ["--project", "--dry-run"], excludes: ["--replace", "--force"] },
        { args: ["machine", "inventory", "export", "--help"], includes: ["--output", "--json"], excludes: ["--from", ...transferForbidden] },
        { args: ["machine", "inventory", "verify", "--help"], includes: ["--from", "--json"], excludes: ["--output", ...transferForbidden] },
        { args: ["machine", "inventory", "bundle", "--help"], includes: ["--output", "--json"], excludes: ["--from", ...transferForbidden] },
        { args: ["machine", "inventory", "sync", "--help"], includes: ["--from", "--dry-run", "--json"], excludes: ["--output", ...transferForbidden] },
        { args: ["machine", "inventory", "gc", "--help"], includes: ["--prune", "--json"], excludes: ["--project", "--force"] },
      ];

      for (const expectation of expectations) {
        const result = await runAgentsCli(expectation.args, env);
        expect(result.exitCode).toBe(0);
        const output = `${result.stdout}\n${result.stderr}`;
        for (const snippet of expectation.includes) expect(output).toContain(snippet);
        for (const snippet of expectation.excludes ?? []) expect(output).not.toContain(snippet);
      }
    } finally {
      await cleanupTempRoots([fixture.root]);
    }
  });
});
