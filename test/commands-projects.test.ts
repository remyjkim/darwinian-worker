// ABOUTME: Verifies machine project index registration and bulk update commands.
// ABOUTME: Guards opt-in projects.json used by store GC root widening.

import { afterEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { registerProject, listRegisteredProjects, resolveProjectsIndexPath } from "../cli/core/project-registry";
import { cleanupTempRoots, createTempRoot, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("registerProject adds a project path to the machine index", async () => {
  const root = await createTempRoot("projects-registry-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const projectDir = join(root, "project-a");
  await registerProject(agentsDir, projectDir);
  expect(await listRegisteredProjects(agentsDir)).toEqual([projectDir]);
  const index = JSON.parse(await readFile(resolveProjectsIndexPath(agentsDir), "utf8"));
  expect(index.projects).toEqual([projectDir]);
});

test("registerProject is idempotent for the same project", async () => {
  const root = await createTempRoot("projects-registry-idem-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const projectDir = join(root, "project-a");
  await registerProject(agentsDir, projectDir);
  await registerProject(agentsDir, projectDir);
  expect(await listRegisteredProjects(agentsDir)).toEqual([projectDir]);
});

test("projects list prints registered projects", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "my-project");
  await registerProject(fixture.agentsDir, projectDir);
  const result = await runAgentsCli(["projects", "list"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(projectDir);
});

test("projects unregister repairs a stale registration and supports dry-run", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "deleted-project");
  await registerProject(fixture.agentsDir, projectDir);

  const dryRun = await runAgentsCli(["projects", "unregister", projectDir, "--dry-run", "--json"], envFor(fixture));
  expect(dryRun.exitCode).toBe(0);
  expect(JSON.parse(dryRun.stdout)).toMatchObject({ removed: true, dryRun: true, projectRoot: projectDir });
  expect(await listRegisteredProjects(fixture.agentsDir)).toEqual([projectDir]);

  const result = await runAgentsCli(["projects", "unregister", projectDir, "--json"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ removed: true, dryRun: false, projectRoot: projectDir });
  expect(await listRegisteredProjects(fixture.agentsDir)).toEqual([]);
});
