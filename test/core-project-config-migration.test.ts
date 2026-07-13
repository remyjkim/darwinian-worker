// ABOUTME: Verifies project config V1 is normalized safely into the singular-Worker V2 model.
// ABOUTME: Protects ambiguous legacy projects from silent reclassification or partial writes.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadProjectConfig } from "../cli/core/project";
import { normalizeProjectConfig } from "../cli/core/project-config-migration";
import { includeProjectSkill } from "../cli/core/project-writes";
import { mergeProjectWithLocal } from "../cli/core/config-local";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

test.each([
  [{ version: 1, cards: [] }, { version: 2, workers: [] }],
  [{ version: 1, cards: ["@me/a@^1.0.0"] }, { version: 2, workers: ["@me/a@^1.0.0"] }],
  [{ version: 1, cards: ["@me/a"], activeWorkers: [] }, { version: 2, workers: ["@me/a"], activeWorker: null }],
  [{ version: 1, cards: ["@me/a"], activeWorkers: ["@me/a"] }, { version: 2, workers: ["@me/a"], activeWorker: "@me/a" }],
] as const)("normalizes legacy config %o", (input, expected) => {
  expect(normalizeProjectConfig(input).config as unknown).toEqual(expected);
});

test("legacy cards without a selection refuse implicit multi-Card composition", () => {
  expect(() => normalizeProjectConfig({ version: 1, cards: ["@me/a", "@me/b"] })).toThrow(
    expect.objectContaining({ code: "LEGACY_MULTI_CARD_COMPOSITION_AMBIGUOUS" }),
  );
});

test("legacy active Worker stacks are unsupported", () => {
  expect(() => normalizeProjectConfig({
    version: 1,
    cards: ["@me/a", "@me/b"],
    activeWorkers: ["@me/a", "@me/b"],
  })).toThrow(expect.objectContaining({ code: "WORKER_STACK_UNSUPPORTED" }));
});

test("V2 selection must name an installed Worker root rather than a member", () => {
  expect(() => normalizeProjectConfig({
    version: 2,
    workers: ["@me/root@^1.0.0"],
    activeWorker: "@me/member",
  })).toThrow(expect.objectContaining({ code: "ACTIVE_WORKER_NOT_INSTALLED" }));
});

test("legacy local activation normalizes empty and singular selections", () => {
  expect(mergeProjectWithLocal(
    { version: 2, workers: ["@me/a"] },
    { activate: [] },
  ).activeWorker).toBeNull();
  expect(mergeProjectWithLocal(
    { version: 2, workers: ["@me/a"] },
    { activate: ["@me/a"] },
  ).activeWorker).toBe("@me/a");
});

test("legacy local activation refuses a Worker stack", () => {
  expect(() => mergeProjectWithLocal(
    { version: 2, workers: ["@me/a", "@me/b"] },
    { activate: ["@me/a", "@me/b"] },
  )).toThrow(expect.objectContaining({ code: "WORKER_STACK_UNSUPPORTED" }));
});

test("loading the darwinian-cards legacy shape fails without changing project-owned bytes", async () => {
  const root = await createTempRoot("project-migration-ambiguous-");
  tempRoots.push(root);
  const configPath = join(root, ".agents", "drwn", "config.json");
  const ownedFiles = [
    [configPath, JSON.stringify({
      version: 1,
      cards: ["@remyjkim/fal@^0.2.0", "@darwinian/operator@^1.0.0", "@leeminseung/notion@0.1.0"],
    }, null, 2) + "\n"],
    [join(root, ".agents", "drwn", "card.lock"), "legacy-lock\n"],
    [join(root, ".agents", "drwn", "vendor", "sentinel"), "vendor\n"],
    [join(root, ".agents", "drwn", "generated", "sentinel"), "generated\n"],
    [join(root, ".claude", "skills", "sentinel"), "downstream\n"],
  ] as const;
  for (const [path, bytes] of ownedFiles) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  await expect(loadProjectConfig(configPath)).rejects.toMatchObject({
    code: "LEGACY_MULTI_CARD_COMPOSITION_AMBIGUOUS",
  });
  for (const [path, bytes] of ownedFiles) {
    expect(await readFile(path, "utf8")).toBe(bytes);
  }
});

test("the next mutation persists normalized V2 instead of legacy fields", async () => {
  const root = await createTempRoot("project-migration-write-");
  tempRoots.push(root);
  const configPath = join(root, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ version: 1, cards: ["@me/a"] }, null, 2)}\n`);

  includeProjectSkill(root, "alpha");

  expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
    version: 2,
    workers: ["@me/a"],
    skills: { include: ["alpha"] },
  });
});
