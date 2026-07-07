// ABOUTME: Verifies machine-scope drwn write requires explicit --scope machine.
// ABOUTME: Guards against silent writes to user home tool configs.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildEffectiveState } from "../cli/core/effective-state";
import { assertMachineWriteScopeAllowed } from "../cli/core/effective-state";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("buildEffectiveState without project uses machine write scope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const outsideDir = join(fixture.root, "outside");
  await mkdir(outsideDir, { recursive: true });
  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: outsideDir,
  });
  expect(state.scopedOptions.writeScope).toBe("machine");
});

test("assertMachineWriteScopeAllowed rejects machine write without explicit scope", () => {
  expect(() => assertMachineWriteScopeAllowed({ writeScope: "machine", forceMachineScope: false })).toThrow(
    /--scope machine/,
  );
});

test("assertMachineWriteScopeAllowed allows --scope machine", () => {
  expect(() =>
    assertMachineWriteScopeAllowed({ writeScope: "machine", forceMachineScope: true }),
  ).not.toThrow();
});

test("drwn write outside a project errors without --scope machine", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const outsideDir = join(fixture.root, "outside");
  await mkdir(outsideDir, { recursive: true });
  await writeFile(join(outsideDir, "README.md"), "# outside\n");
  const result = await runAgentsCli(["write", "--dry-run"], envFor(fixture), outsideDir, {
    skipWriteScopeAuto: true,
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toMatch(/--scope machine|--root/);
});

test("drwn write outside a project succeeds with --scope machine", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const outsideDir = join(fixture.root, "outside");
  await mkdir(outsideDir, { recursive: true });
  const result = await runAgentsCli(["write", "--scope", "machine", "--dry-run"], envFor(fixture), outsideDir);
  expect(result.exitCode).toBe(0);
});

test("drwn write inside a project does not require --scope machine", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2) + "\n");
  const result = await runAgentsCli(["write", "--dry-run"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);
});
