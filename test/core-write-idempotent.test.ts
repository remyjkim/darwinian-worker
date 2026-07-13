// ABOUTME: Verifies consecutive drwn write runs are no-ops on stable vendored projects.
// ABOUTME: Guards vendor reconcile and generated worker output from spurious change reporting.

import { afterEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { syncRepository } from "../cli/core/sync";
import { cleanupTempRoots, envFor, installProjectWorkers, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("two consecutive writes produce no material changes on a vendored project", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/backend@^1.0.0"], "@me/backend");

  const first = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);
  expect(first.exitCode).toBe(0);
  const second = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);
  expect(second.exitCode).toBe(0);

  const parsed = JSON.parse(second.stdout) as { changes: string[]; warnings: string[] };
  expect(parsed.changes.filter((change) => change.startsWith("vendor "))).toHaveLength(0);
  expect(parsed.changes.filter((change) => change.startsWith("prune vendor "))).toHaveLength(0);

  const workerJson = join(projectDir, ".agents", "drwn", "generated", "workers", "@me", "backend", "worker.json");
  const before = await readFile(workerJson, "utf8");
  const third = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(third.exitCode).toBe(0);
  const after = await readFile(workerJson, "utf8");
  expect(after).toBe(before);
});
