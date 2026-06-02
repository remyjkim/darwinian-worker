// ABOUTME: Verifies the persistent Git URL to card-name cache used by Wave 2 resolution.
// ABOUTME: Keeps the cache an optimization that tolerates missing or corrupt files.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readUrlCardName, resolveUrlCardMapPath, writeUrlCardName } from "../cli/core/url-card-map";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("readUrlCardName returns null when the cache is absent", async () => {
  const root = await createTempRoot("url-card-map-");
  tempRoots.push(root);
  const agentsDir = join(root, ".agents");

  expect(await readUrlCardName(agentsDir, "file:///tmp/card.git")).toBeNull();
});

test("writeUrlCardName persists a versioned map entry atomically", async () => {
  const root = await createTempRoot("url-card-map-");
  tempRoots.push(root);
  const agentsDir = join(root, ".agents");

  await writeUrlCardName(agentsDir, "file:///tmp/card.git", "@team/card");

  const entry = await readUrlCardName(agentsDir, "file:///tmp/card.git");
  expect(entry?.name).toBe("@team/card");
  expect(entry?.url).toBe("file:///tmp/card.git");
  expect(entry?.discoveredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  const raw = JSON.parse(await readFile(resolveUrlCardMapPath(agentsDir), "utf8"));
  expect(raw.mapVersion).toBe(1);
  expect(Object.keys(raw.entries)).toEqual(["file:///tmp/card.git"]);
  const storeFiles = await readdir(join(agentsDir, "drwn"));
  expect(storeFiles.filter((name) => name.includes("url-card-map") && name.endsWith(".tmp"))).toEqual([]);
});

test("readUrlCardName ignores corrupt cache files", async () => {
  const root = await createTempRoot("url-card-map-");
  tempRoots.push(root);
  const agentsDir = join(root, ".agents");
  await mkdir(dirname(resolveUrlCardMapPath(agentsDir)), { recursive: true });
  await writeFile(resolveUrlCardMapPath(agentsDir), "{not json");

  expect(await readUrlCardName(agentsDir, "file:///tmp/card.git")).toBeNull();
});
