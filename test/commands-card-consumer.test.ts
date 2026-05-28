// ABOUTME: Verifies project-side card consumption commands and lockfile updates.
// ABOUTME: Protects the user workflow for applying, updating, and removing cards.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, name = "@me/backend", version = "1.0.0") {
  await publishCardWithSkills(fixture, { name, version, skills: ["alpha"] });
}

test("card apply replaces project cards and writes a lockfile", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCard(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "bgng", "config.json"), JSON.stringify({ version: 1 }, null, 2));

  const result = await runAgentsCli(["card", "apply", "@me/backend@^1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  const config = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8"));
  expect(config.cards).toEqual(["@me/backend@^1.0.0"]);
  expect(existsSync(join(projectDir, ".agents", "bgng", "card.lock"))).toBe(true);
});

test("top-level apply alias works", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCard(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "bgng", "config.json"), JSON.stringify({ version: 1 }, null, 2));

  const result = await runAgentsCli(["apply", "@me/backend@^1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
});

test("card apply --write chains materialization after preserving mutation", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCard(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "bgng", "config.json"), JSON.stringify({ version: 1 }, null, 2));

  const result = await runAgentsCli(["card", "apply", "@me/backend@^1.0.0", "--write"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
});

test("card add, pin, remove, detach, and outdated mutate expected files", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCard(fixture, "@me/backend", "1.0.0");
  await publishCard(fixture, "@me/backend", "1.1.0");
  await publishCard(fixture, "@me/observability", "1.0.0");
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "bgng", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2));
  expect((await runAgentsCli(["card", "update"], envFor(fixture), projectDir)).exitCode).toBe(0);

  expect((await runAgentsCli(["card", "add", "@me/observability@^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(JSON.parse(await readFile(configPath, "utf8")).cards).toEqual(["@me/backend@^1.0.0", "@me/observability@^1.0.0"]);
  expect((await runAgentsCli(["card", "add", "@me/backend@^1.0.0"], envFor(fixture), projectDir)).exitCode).not.toBe(0);

  expect((await runAgentsCli(["card", "pin", "@me/backend@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(JSON.parse(await readFile(configPath, "utf8")).cards[0]).toBe("@me/backend@1.0.0");

  const outdated = await runAgentsCli(["card", "outdated", "--check"], envFor(fixture), projectDir);
  expect(outdated.exitCode).not.toBe(0);

  expect((await runAgentsCli(["card", "remove", "@me/observability"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(JSON.parse(await readFile(configPath, "utf8")).cards).toEqual(["@me/backend@1.0.0"]);
  expect((await runAgentsCli(["card", "remove", "@me/observability"], envFor(fixture), projectDir)).exitCode).not.toBe(0);

  expect((await runAgentsCli(["card", "detach"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(JSON.parse(await readFile(configPath, "utf8")).cards).toEqual([]);
});
