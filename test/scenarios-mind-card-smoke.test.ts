// ABOUTME: Smoke-tests the real @darwinian/mind-card source against the CLI pipeline.
// ABOUTME: Applies the card from its authoring repo, checks lock metadata, doctor health, and publishability.

import { afterEach, expect, test as baseTest } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCardLock, MINDS_MIN_DRWN_VERSION } from "../cli/core/card-lock";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const MIND_CARD_SOURCE = "/Users/pureicis/dev/darwinian-cards/mind-card";
const test = baseTest.skipIf(!existsSync(MIND_CARD_SOURCE));

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("the mind card applies from file:, locks with the minds floor, and passes doctor + publish", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));

  const applied = await runAgentsCli(["card", "apply", `file:${MIND_CARD_SOURCE}`], envFor(fixture), projectDir);
  expect(applied.exitCode).toBe(0);

  const lock = await loadCardLock(projectDir);
  const entry = lock?.cards.find((card) => card.name === "@darwinian/mind-card");
  expect(entry).toBeDefined();
  expect(entry?.persona).toEqual({ include: ["voice"], visibility: "internal" });
  expect(entry?.beliefs).toEqual({ include: ["collaboration"], visibility: "internal" });
  expect(entry?.memory).toEqual({ l4: { format: "md" }, l5: { format: "jsonl" } });
  expect(entry?.skills).toEqual(["mind-read", "mind-remember", "mind-share", "mind-forget", "mind-search"]);
  expect(lock?.store?.minDrwnVersion).toBe(MINDS_MIN_DRWN_VERSION);

  const sourcesDir = join(fixture.agentsDir, "drwn", "sources", "@darwinian", "mind-card");
  await cp(MIND_CARD_SOURCE, sourcesDir, { recursive: true, filter: (src) => !src.includes("/.git") });

  const doctor = await runAgentsCli(["card", "source", "doctor", "@darwinian/mind-card", "--json"], envFor(fixture));
  expect(doctor.exitCode).toBe(0);
  expect(JSON.parse(doctor.stdout).ok).toBe(true);

  const published = await runAgentsCli(["card", "publish", "@darwinian/mind-card"], envFor(fixture));
  expect(published.exitCode).toBe(0);
});
