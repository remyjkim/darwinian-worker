// ABOUTME: Verifies drwn card new auto-derives a scope from gh / git in non-interactive mode.
// ABOUTME: Non-interactive never silently auto-sets — it surfaces the derived value as a hint.

import { afterEach, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanupTempRoots,
  createExecutable,
  envFor,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("non-interactive error mentions the gh-derived scope as a hint when no --scope and no saved scope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const stubDir = await mkdtemp(join(tmpdir(), "drwn-autoderive-bins-"));
  tempRoots.push(stubDir);

  // Stub `gh` so the probe returns a deterministic handle even on machines
  // where the real `gh` is not authenticated.
  await createExecutable(stubDir, "gh", `printf "stubuser\n"`);
  // Real git is still needed by the CLI for unrelated operations; preserve it on PATH.
  const composedPath = `${stubDir}:${process.env.PATH ?? ""}`;

  const result = await runAgentsCli(
    ["card", "new", "backend", "--no-git"],
    {
      ...envFor(fixture),
      // Empty HOME so `git config --global` reads no file (no leftover github.user).
      HOME: fixture.homeDir,
      PATH: composedPath,
    },
  );

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("--scope");
  expect(result.stderr).toContain("@stubuser");
  expect(result.stderr.toLowerCase()).toContain("non-interactive");
});

test("non-interactive error has no derived-scope hint when neither gh nor git produce a handle", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const stubDir = await mkdtemp(join(tmpdir(), "drwn-autoderive-empty-"));
  tempRoots.push(stubDir);

  // Stubbed gh that exits non-zero so the probe returns null.
  await createExecutable(stubDir, "gh", `exit 1`);
  const composedPath = `${stubDir}:${process.env.PATH ?? ""}`;

  const result = await runAgentsCli(
    ["card", "new", "backend", "--no-git"],
    {
      ...envFor(fixture),
      HOME: fixture.homeDir,
      PATH: composedPath,
    },
  );

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("--scope");
  expect(result.stderr).not.toContain("Detected");
});
