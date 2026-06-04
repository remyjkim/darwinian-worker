// ABOUTME: Exercises a full team catalog collaboration lifecycle for dh-card-base.
// ABOUTME: Covers follow, discovery, install, catalog refresh, fetch, update, and pinned behavior.

import { afterEach, expect, test } from "bun:test";
import { existsSync, readlinkSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { loadCardLock } from "../cli/core/card-lock";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import {
  createDhCardBaseCatalogRemote,
  createDhCardBaseRemote,
  DH_CARD_BASE_NAME,
  DH_CARD_BASE_SKILLS,
  tagDhCardBaseVersion,
} from "./fixtures/dh-card-base-fixture";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("team follows a dh-card-base catalog, installs it, refreshes catalog updates, and updates range-tracked projects", async () => {
  const producer = await scaffoldCliFixture();
  const consumer = await scaffoldCliFixture();
  const freshConsumer = await scaffoldCliFixture();
  const cardRemote = await createDhCardBaseRemote();
  const catalog = await createDhCardBaseCatalogRemote("@remyjkim");
  tempRoots.push(producer.root, consumer.root, freshConsumer.root, cardRemote.tempDir, catalog.tempDir);

  const initialPublish = await runAgentsCli(
    [
      "card",
      "catalog",
      "publish",
      `git+${cardRemote.url}#v0.1.0`,
      "--catalog",
      catalog.url,
      "--mode",
      "direct",
      "--name",
      "dh-card-base",
      "--tag",
      "base",
      "--tag",
      "skills",
      "--json",
    ],
    envFor(producer),
  );
  expect(initialPublish.exitCode, initialPublish.stderr).toBe(0);
  expect(JSON.parse(initialPublish.stdout).entry).toMatchObject({
    name: "dh-card-base",
    url: `git+${cardRemote.url}#v0.1.0`,
    tags: ["base", "skills"],
  });

  expect((await runAgentsCli(["library", "catalog", "add", catalog.url], envFor(consumer))).exitCode).toBe(0);
  const discovered = await searchDhCardBase(consumer);
  expect(discovered).toEqual(
    expect.objectContaining({
      name: "dh-card-base",
      scope: "@remyjkim",
      url: `git+${cardRemote.url}#v0.1.0`,
    }),
  );

  const pinnedProject = join(consumer.root, "pinned-project");
  await initProject(consumer, pinnedProject);
  const pinnedApply = await runAgentsCli(["card", "apply", discovered.url, "--write"], envFor(consumer), pinnedProject);
  expect(pinnedApply.exitCode, pinnedApply.stderr).toBe(0);
  const initialPinnedLock = await expectLockVersion(pinnedProject, "0.1.0");
  expectMaterializedSkills(pinnedProject, ["bootstrap-project", "author-harness-card", "share-harness-card"]);

  await rm(join(pinnedProject, ".claude"), { recursive: true, force: true });
  await rm(join(pinnedProject, ".codex"), { recursive: true, force: true });
  await rm(join(pinnedProject, ".cursor"), { recursive: true, force: true });
  await rm(initialPinnedLock.cards[0]!.path, { recursive: true, force: true });
  const freshCatalogs = await runAgentsCli(["library", "catalog", "list", "--json"], envFor(freshConsumer));
  expect(JSON.parse(freshCatalogs.stdout).catalogs).toEqual([]);
  const noApply = await runAgentsCli(["install", "--no-apply"], envFor(freshConsumer), pinnedProject);
  expect(noApply.exitCode, noApply.stderr).toBe(0);
  expect(existsSync(join(pinnedProject, ".claude", "skills", "bootstrap-project"))).toBe(false);
  const freshInstall = await runAgentsCli(["install"], envFor(freshConsumer), pinnedProject);
  expect(freshInstall.exitCode, freshInstall.stderr).toBe(0);
  await expectLockVersion(pinnedProject, "0.1.0");
  expectMaterializedSkills(pinnedProject, ["bootstrap-project", "author-harness-card", "share-harness-card"]);

  const rangeProject = join(consumer.root, "range-project");
  await initProject(consumer, rangeProject);
  const rangeApply = await runAgentsCli(["card", "apply", `git+${cardRemote.url}@^0.1.0`, "--write"], envFor(consumer), rangeProject);
  expect(rangeApply.exitCode, rangeApply.stderr).toBe(0);
  await expectLockVersion(rangeProject, "0.1.0");

  await tagDhCardBaseVersion(cardRemote, "0.1.1");
  const updateCatalog = await runAgentsCli(
    [
      "card",
      "catalog",
      "publish",
      `git+${cardRemote.url}#v0.1.1`,
      "--catalog",
      catalog.url,
      "--mode",
      "direct",
      "--name",
      "dh-card-base",
      "--replace",
      "--json",
    ],
    envFor(producer),
  );
  expect(updateCatalog.exitCode, updateCatalog.stderr).toBe(0);

  expect((await searchDhCardBase(consumer)).url).toBe(`git+${cardRemote.url}#v0.1.0`);
  const refreshed = await runAgentsCli(["library", "catalog", "refresh", "@remyjkim"], envFor(consumer));
  expect(refreshed.exitCode, refreshed.stderr).toBe(0);
  expect((await searchDhCardBase(consumer)).url).toBe(`git+${cardRemote.url}#v0.1.1`);

  const outdated = await runAgentsCli(["card", "outdated", "--fetch", "--json"], envFor(consumer), rangeProject);
  expect(outdated.exitCode, outdated.stderr).toBe(0);
  expect(JSON.parse(outdated.stdout).outdated).toEqual([
    { name: DH_CARD_BASE_NAME, current: "0.1.0", latest: "0.1.1" },
  ]);
  const check = await runAgentsCli(["card", "outdated", "--fetch", "--check"], envFor(consumer), rangeProject);
  expect(check.exitCode).not.toBe(0);

  const updateRange = await runAgentsCli(["card", "update", "--write"], envFor(consumer), rangeProject);
  expect(updateRange.exitCode, updateRange.stderr).toBe(0);
  const rangeLock = await expectLockVersion(rangeProject, "0.1.1");
  expectMaterializedSkills(rangeProject, ["bootstrap-project", "support-harness"]);
  expect(readlinkSync(join(rangeProject, ".claude", "skills", "bootstrap-project")))
    .toBe(join(rangeLock.cards[0]!.path, "skills", "bootstrap-project"));
  const cleanCheck = await runAgentsCli(["card", "outdated", "--fetch", "--check"], envFor(consumer), rangeProject);
  expect(cleanCheck.exitCode, cleanCheck.stdout + cleanCheck.stderr).toBe(0);

  const pinnedOutdated = await runAgentsCli(["card", "outdated", "--fetch", "--json"], envFor(freshConsumer), pinnedProject);
  expect(pinnedOutdated.exitCode, pinnedOutdated.stderr).toBe(0);
  const pinnedUpdate = await runAgentsCli(["card", "update", "--write"], envFor(freshConsumer), pinnedProject);
  expect(pinnedUpdate.exitCode, pinnedUpdate.stderr).toBe(0);
  const pinnedLock = await expectLockVersion(pinnedProject, "0.1.0");
  expect(readlinkSync(join(pinnedProject, ".claude", "skills", "bootstrap-project")))
    .toBe(join(pinnedLock.cards[0]!.path, "skills", "bootstrap-project"));
});

async function initProject(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, projectDir: string) {
  await mkdir(projectDir, { recursive: true });
  const result = await runAgentsCli(["init", "--non-interactive", "--no-default-catalogs"], envFor(fixture), projectDir);
  expect(result.exitCode, result.stderr).toBe(0);
}

async function searchDhCardBase(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const result = await runAgentsCli(["search", "card", "dh-card-base", "--scope", "@remyjkim", "--json"], envFor(fixture));
  expect(result.exitCode, result.stderr).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.results).toHaveLength(1);
  return parsed.results[0] as { name: string; scope: string; url: string };
}

async function expectLockVersion(projectDir: string, version: string) {
  const lock = await loadCardLock(projectDir);
  expect(lock?.cards).toHaveLength(1);
  expect(lock!.cards[0]).toMatchObject({
    name: DH_CARD_BASE_NAME,
    version,
  });
  return lock!;
}

function expectMaterializedSkills(projectDir: string, skills: string[]) {
  for (const skill of skills) {
    expect(DH_CARD_BASE_SKILLS).toContain(skill);
    expect(existsSync(join(projectDir, ".claude", "skills", skill))).toBe(true);
  }
}
