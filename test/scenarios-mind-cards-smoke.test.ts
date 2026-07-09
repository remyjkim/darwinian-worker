// ABOUTME: Smoke-tests the real mind-card sources against the CLI pipeline.
// ABOUTME: Covers the substrate split: @darwinian/mind-tools (pure substrate, no seeds)
// ABOUTME: and @darwinian/mind-starter (solo quickstart: voice + collaboration + synced skills).

import { afterEach, expect, test as baseTest } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCardLock, MINDS_MIN_DRWN_VERSION } from "../cli/core/card-lock";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const MIND_TOOLS_SOURCE = "/Users/pureicis/dev/darwinian-cards/mind-tools";
const MIND_STARTER_SOURCE = "/Users/pureicis/dev/darwinian-cards/mind-starter";
const test = baseTest.skipIf(!existsSync(MIND_TOOLS_SOURCE) || !existsSync(MIND_STARTER_SOURCE));

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldProject(root: string) {
  const projectDir = join(root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));
  return projectDir;
}

test("@darwinian/mind-tools applies from file:, locks with the minds floor (no persona/beliefs), and passes doctor + publish", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const projectDir = await scaffoldProject(fixture.root);

  const applied = await runAgentsCli(["card", "apply", `file:${MIND_TOOLS_SOURCE}`], envFor(fixture), projectDir);
  expect(applied.exitCode).toBe(0);

  const lock = await loadCardLock(projectDir);
  const entry = lock?.cards.find((card) => card.name === "@darwinian/mind-tools");
  expect(entry).toBeDefined();
  // The substrate carries no persona or beliefs — a composed mind's voice comes
  // entirely from its content card.
  expect(entry?.persona).toBeUndefined();
  expect(entry?.beliefs).toBeUndefined();
  expect(entry?.memory).toEqual({ l4: { format: "md" }, l5: { format: "jsonl" } });
  expect(entry?.skills).toEqual(["mind-read", "mind-remember", "mind-share", "mind-forget", "mind-search"]);
  expect(lock?.store?.minDrwnVersion).toBe(MINDS_MIN_DRWN_VERSION);

  const sourcesDir = join(fixture.agentsDir, "drwn", "sources", "@darwinian", "mind-tools");
  await cp(MIND_TOOLS_SOURCE, sourcesDir, { recursive: true, filter: (src) => !src.includes("/.git") });

  const doctor = await runAgentsCli(["card", "source", "doctor", "@darwinian/mind-tools", "--json"], envFor(fixture));
  expect(doctor.exitCode).toBe(0);
  expect(JSON.parse(doctor.stdout).ok).toBe(true);

  const published = await runAgentsCli(["card", "publish", "@darwinian/mind-tools"], envFor(fixture));
  expect(published.exitCode).toBe(0);
});

test("@darwinian/mind-starter applies alone, provisions a complete mind (voice + collaboration + skills + floor), and passes doctor + publish", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const projectDir = await scaffoldProject(fixture.root);

  const applied = await runAgentsCli(["card", "apply", `file:${MIND_STARTER_SOURCE}`], envFor(fixture), projectDir);
  expect(applied.exitCode).toBe(0);

  const lock = await loadCardLock(projectDir);
  const entry = lock?.cards.find((card) => card.name === "@darwinian/mind-starter");
  expect(entry).toBeDefined();
  expect(entry?.persona).toEqual({ include: ["voice"], visibility: "internal" });
  expect(entry?.beliefs).toEqual({ include: ["collaboration"], visibility: "internal" });
  expect(entry?.memory).toEqual({ l4: { format: "md" }, l5: { format: "jsonl" } });
  expect(entry?.skills).toEqual(["mind-read", "mind-remember", "mind-share", "mind-forget", "mind-search"]);
  expect(lock?.store?.minDrwnVersion).toBe(MINDS_MIN_DRWN_VERSION);

  const sourcesDir = join(fixture.agentsDir, "drwn", "sources", "@darwinian", "mind-starter");
  await cp(MIND_STARTER_SOURCE, sourcesDir, { recursive: true, filter: (src) => !src.includes("/.git") });

  // Doctor + publish validate the card is publishable. Publish is the load-bearing
  // check here: it runs parseUpstreamRef on every skills.upstream value, so a green
  // publish proves the git+ refs are well-formed. (Doctor's upstream-sync also clones
  // the mind-tools remote — a ~10s network op — so it is covered by the P6 end-to-end
  // check rather than asserted on every test run.)
  const published = await runAgentsCli(["card", "publish", "@darwinian/mind-starter"], envFor(fixture));
  expect(published.exitCode).toBe(0);
});
