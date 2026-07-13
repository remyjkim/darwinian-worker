// ABOUTME: Live smoke test for the public remyjkim/dm-card-base card repo.
// ABOUTME: Verifies catalog discovery and lockfile bootstrap against GitHub when explicitly enabled.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { loadCardLock } from "../cli/core/card-lock";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import {
  createDmCardBaseCatalogRemote,
  DM_CARD_BASE_NAME,
  DM_CARD_BASE_REMOTE,
  DM_CARD_BASE_SKILLS,
  DM_CARD_BASE_VERSION,
} from "./fixtures/dm-card-base-fixture";

const tempRoots: string[] = [];
const liveTest = process.env.DRWN_LIVE_DM_CARD_BASE === "1" ? test : test.skip;

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

liveTest("publishes and consumes the live dm-card-base GitHub repo through a catalog", async () => {
  const producer = await scaffoldCliFixture();
  const consumer = await scaffoldCliFixture();
  const freshConsumer = await scaffoldCliFixture();
  const catalog = await createDmCardBaseCatalogRemote("@remyjkim");
  tempRoots.push(producer.root, consumer.root, freshConsumer.root, catalog.tempDir);
  const liveRef = `git+${DM_CARD_BASE_REMOTE}#v${DM_CARD_BASE_VERSION}`;

  const published = await runAgentsCli(
    [
      "card",
      "catalog",
      "publish",
      liveRef,
      "--catalog",
      catalog.url,
      "--mode",
      "direct",
      "--name",
      "dm-card-base",
      "--tag",
      "live-smoke",
      "--json",
    ],
    envFor(producer),
  );
  expect(published.exitCode, published.stderr).toBe(0);
  expect(JSON.parse(published.stdout).entry).toMatchObject({
    name: "dm-card-base",
    url: liveRef,
  });

  expect((await runAgentsCli(["catalog", "add", catalog.url], envFor(consumer))).exitCode).toBe(0);
  const search = await runAgentsCli(["search", "card", "dm-card-base", "--scope", "@remyjkim", "--json"], envFor(consumer));
  expect(search.exitCode, search.stderr).toBe(0);
  expect(JSON.parse(search.stdout).results).toEqual([
    expect.objectContaining({
      name: "dm-card-base",
      scope: "@remyjkim",
      url: liveRef,
    }),
  ]);

  const projectDir = join(consumer.root, "live-project");
  await mkdir(projectDir, { recursive: true });
  const initialized = await runAgentsCli(["init", "--non-interactive", "--no-default-catalogs"], envFor(consumer), projectDir);
  expect(initialized.exitCode, initialized.stderr).toBe(0);
  const applied = await runAgentsCli(["apply", liveRef, "--write"], envFor(consumer), projectDir);
  expect(applied.exitCode, applied.stderr).toBe(0);
  const initialLock = await expectLiveLock(projectDir);
  expectLiveSkill(projectDir, "bootstrap-project");
  expectLiveSkill(projectDir, "author-mind-card");

  const outdated = await runAgentsCli(["card", "outdated", "--fetch", "--json"], envFor(consumer), projectDir);
  expect(outdated.exitCode, outdated.stderr).toBe(0);
  expect(Array.isArray(JSON.parse(outdated.stdout).outdated)).toBe(true);

  await rm(join(projectDir, ".claude"), { recursive: true, force: true });
  await rm(join(projectDir, ".codex"), { recursive: true, force: true });
  await rm(join(projectDir, ".cursor"), { recursive: true, force: true });
  await rm(initialLock.cards[0]!.path, { recursive: true, force: true });
  const noWrite = await runAgentsCli(["install", "--no-write", "--json"], envFor(freshConsumer), projectDir);
  expect(noWrite.exitCode, noWrite.stderr).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "bootstrap-project"))).toBe(false);
  const installed = await runAgentsCli(["install", "--json"], envFor(freshConsumer), projectDir);
  expect(installed.exitCode, installed.stderr).toBe(0);
  await expectLiveLock(projectDir);
  expectLiveSkill(projectDir, "support-harness");
});

async function expectLiveLock(projectDir: string) {
  const lock = await loadCardLock(projectDir);
  expect(lock?.cards).toHaveLength(1);
  expect(lock!.cards[0]).toMatchObject({
    name: DM_CARD_BASE_NAME,
    version: DM_CARD_BASE_VERSION,
  });
  return lock!;
}

function expectLiveSkill(projectDir: string, skill: string) {
  expect(DM_CARD_BASE_SKILLS).toContain(skill);
  expect(existsSync(join(projectDir, ".claude", "skills", skill))).toBe(true);
}
