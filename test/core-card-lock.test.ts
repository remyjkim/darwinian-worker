// ABOUTME: Verifies Harness Card lockfile read/write helpers.
// ABOUTME: Protects project card resolution persistence.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cardLockPath, loadCardLock, writeCardLock } from "../cli/core/card-lock";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("writeCardLock creates a project lockfile and loadCardLock reads it", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  const path = writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      manifest: { name: "@me/backend", version: "1.0.0" },
      skills: [],
      registry: null,
    },
  ]);

  expect(path).toBe(cardLockPath(root));
  expect(existsSync(path)).toBe(true);
  expect((await loadCardLock(root))?.cards[0]?.name).toBe("@me/backend");
});

test("writeCardLock persists the skills[] attribution field per card entry", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      manifest: { name: "@me/backend", version: "1.0.0", skills: { include: ["alpha", "beta"] } },
      skills: ["alpha", "beta"],
      registry: null,
    },
  ]);

  const loaded = await loadCardLock(root);
  expect(loaded?.cards[0]?.skills).toEqual(["alpha", "beta"]);
  expect(loaded?.cards[0]?.registry).toBeNull();
});

test("loadCardLock tolerates legacy entries without skills[] or registry by deriving skills from the manifest", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);
  const legacyPayload = {
    lockfileVersion: 1,
    cards: [
      {
        name: "@me/backend",
        requested: "@me/backend@^1.0.0",
        version: "1.0.0",
        path: "/cards/@me/backend/1.0.0",
        integrity: "sha256-test",
        manifest: { name: "@me/backend", version: "1.0.0", skills: { include: ["alpha"] } },
      },
    ],
  };
  await mkdir(dirname(cardLockPath(root)), { recursive: true });
  await writeFile(cardLockPath(root), JSON.stringify(legacyPayload, null, 2));

  const loaded = await loadCardLock(root);
  expect(loaded?.cards[0]?.skills).toEqual(["alpha"]);
  expect(loaded?.cards[0]?.registry).toBeNull();
});

test("loadCardLock returns null when no lockfile exists", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  expect(await loadCardLock(root)).toBeNull();
});
