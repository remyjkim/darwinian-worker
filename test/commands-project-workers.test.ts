// ABOUTME: Verifies canonical project commands mutate Worker roots and singular selection atomically.
// ABOUTME: Protects root lifecycle semantics and project state transaction boundaries.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

async function projectFixture() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/one", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/two", skills: ["beta"] });
  const projectDir = join(fixture.root, "project");
  const stateDir = join(projectDir, ".agents", "drwn");
  await mkdir(stateDir, { recursive: true });
  await writeSupportedProjectConfig(projectDir);
  return { fixture, projectDir, stateDir };
}

async function readState(stateDir: string) {
  return {
    config: JSON.parse(await readFile(join(stateDir, "config.json"), "utf8")),
    lock: JSON.parse(await readFile(join(stateDir, "card.lock"), "utf8")),
  };
}

test("add selects the first root and preserves it when alternatives are appended", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();

  expect((await runAgentsCli(["add", "@me/one@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  let state = await readState(stateDir);
  expect(state.config).toMatchObject({
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: ["@me/one@1.0.0"],
    activeWorker: "@me/one",
  });

  expect((await runAgentsCli(["add", "@me/two@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  state = await readState(stateDir);
  expect(state.config.workers).toEqual(["@me/one@1.0.0", "@me/two@1.0.0"]);
  expect(state.config.activeWorker).toBe("@me/one");
  expect(state.lock).toMatchObject({ schema: "drwn.project-lock", schemaVersion: 1 });
  expect(state.lock.workerRoots.map((root: { name: string }) => root.name)).toEqual(["@me/one", "@me/two"]);
});

test("apply requires explicit selection for alternatives and selects a single root", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  const failed = await runAgentsCli(
    ["apply", "@me/one@1.0.0", "@me/two@1.0.0"],
    envFor(fixture),
    projectDir,
  );
  expect(failed.exitCode).toBe(1);
  expect(failed.stderr).toContain("--active");
  expect(await Bun.file(join(stateDir, "card.lock")).exists()).toBe(false);

  const single = await runAgentsCli(["apply", "@me/one@1.0.0"], envFor(fixture), projectDir);
  expect(single.exitCode, single.stderr).toBe(0);
  expect((await readState(stateDir)).config.activeWorker).toBe("@me/one");

  const applied = await runAgentsCli(
    ["apply", "@me/one@1.0.0", "@me/two@1.0.0", "--active", "@me/two"],
    envFor(fixture),
    projectDir,
  );
  expect(applied.exitCode, applied.stderr).toBe(0);
  expect((await readState(stateDir)).config.activeWorker).toBe("@me/two");

  const explicit = await runAgentsCli(
    ["apply", "@me/two@1.0.0", "@me/one@1.0.0"],
    envFor(fixture),
    projectDir,
  );
  expect(explicit.exitCode).toBe(1);
  expect(explicit.stderr).toContain("--active");
});

test("remove prunes unreachable roots and clears a removed active selection", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  expect((await runAgentsCli(
    ["apply", "@me/one@1.0.0", "@me/two@1.0.0", "--active", "@me/one"],
    envFor(fixture),
    projectDir,
  )).exitCode).toBe(0);

  const removed = await runAgentsCli(["remove", "@me/one"], envFor(fixture), projectDir);

  expect(removed.exitCode, removed.stderr).toBe(0);
  const state = await readState(stateDir);
  expect(state.config.workers).toEqual(["@me/two@1.0.0"]);
  expect(state.config.activeWorker).toBeNull();
  expect(state.lock.workerRoots.map((root: { name: string }) => root.name)).toEqual(["@me/two"]);
  expect(state.lock.cards.map((card: { name: string }) => card.name)).toEqual(["@me/two"]);
});

test("pin and update preserve selection by root name", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  expect((await runAgentsCli(["add", "@me/one@^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["pin", "@me/one@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["update", "@me/one"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const state = await readState(stateDir);
  expect(state.config.workers).toEqual(["@me/one@1.0.0"]);
  expect(state.config.activeWorker).toBe("@me/one");
});

test("failed resolution leaves config and lock bytes unchanged", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  expect((await runAgentsCli(["add", "@me/one@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const configBytes = await readFile(join(stateDir, "config.json"), "utf8");
  const lockBytes = await readFile(join(stateDir, "card.lock"), "utf8");

  const failed = await runAgentsCli(["add", "@me/missing@1.0.0"], envFor(fixture), projectDir);

  expect(failed.exitCode).toBe(1);
  expect(await readFile(join(stateDir, "config.json"), "utf8")).toBe(configBytes);
  expect(await readFile(join(stateDir, "card.lock"), "utf8")).toBe(lockBytes);
});

test("--write materializes only after a successful atomic mutation", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  const result = await runAgentsCli(["add", "@me/one@1.0.0", "--write"], envFor(fixture), projectDir);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(await Bun.file(join(stateDir, "card.lock")).exists()).toBe(true);
  expect(await Bun.file(join(projectDir, ".claude", "skills", "alpha", "SKILL.md")).exists()).toBe(true);
});

test("mutation dry-run reports next state without files, locks, journals, or staging", async () => {
  const { fixture, projectDir, stateDir } = await projectFixture();
  const configBytes = await readFile(join(stateDir, "config.json"), "utf8");

  const result = await runAgentsCli(["add", "@me/one@1.0.0", "--dry-run"], envFor(fixture), projectDir);

  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toContain("Would update");
  expect(await readFile(join(stateDir, "config.json"), "utf8")).toBe(configBytes);
  expect(await Bun.file(join(stateDir, "card.lock")).exists()).toBe(false);
  expect(await Bun.file(join(stateDir, ".state-transaction.lock")).exists()).toBe(false);
  expect(await Bun.file(join(stateDir, ".state-transaction.json")).exists()).toBe(false);
  expect(await Bun.file(join(stateDir, ".transactions")).exists()).toBe(false);
});
