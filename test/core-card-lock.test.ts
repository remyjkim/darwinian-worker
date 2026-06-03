// ABOUTME: Verifies Harness Card lockfile v2 read/write helpers.
// ABOUTME: Protects origin metadata and Git commit persistence for project cards.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cardLockPath, loadCardLock, writeCardLock, validateCardLockfile } from "../cli/core/card-lock";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("writeCardLock creates a v2 project lockfile and loadCardLock reads it", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  const path = await writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      manifest: { name: "@me/backend", version: "1.0.0" },
      skills: [],
      registry: null,
      origin: "store",
      git: { commit: "a".repeat(40) },
    },
  ]);

  expect(path).toBe(cardLockPath(root));
  expect(existsSync(path)).toBe(true);
  const loaded = await loadCardLock(root);
  expect(loaded?.lockfileVersion).toBe(2);
  expect(loaded?.cards[0]?.name).toBe("@me/backend");
  expect(loaded?.cards[0]?.origin).toBe("store");
  expect(loaded?.cards[0]?.git?.commit).toBe("a".repeat(40));
});

test("writeCardLock persists the skills[] attribution field per card entry", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  await writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      manifest: { name: "@me/backend", version: "1.0.0", skills: { include: ["alpha", "beta"] } },
      skills: ["alpha", "beta"],
      registry: null,
      origin: "git",
      git: { url: "file:///tmp/backend.git", ref: "v1.0.0", commit: "b".repeat(40) },
    },
  ]);

  const loaded = await loadCardLock(root);
  expect(loaded?.cards[0]?.skills).toEqual(["alpha", "beta"]);
  expect(loaded?.cards[0]?.registry).toBeNull();
  expect(loaded?.cards[0]?.origin).toBe("git");
  expect(loaded?.cards[0]?.git?.url).toBe("file:///tmp/backend.git");
});

test("validateCardLockfile rejects git origin entries without git metadata", () => {
  expect(() =>
    validateCardLockfile({
      lockfileVersion: 2,
      cards: [
        {
          name: "@me/backend",
          requested: "git+file:///tmp/backend.git#v1.0.0",
          version: "1.0.0",
          path: "/cards/@me/backend",
          integrity: "sha256-test",
          manifest: { name: "@me/backend", version: "1.0.0" },
          skills: [],
          registry: null,
          origin: "git",
        },
      ],
    }),
  ).toThrow("git metadata");
});

test("validateCardLockfile rejects file origin entries with git metadata", () => {
  expect(() =>
    validateCardLockfile({
      lockfileVersion: 2,
      cards: [
        {
          name: "@me/backend",
          requested: "file:../backend",
          version: "1.0.0",
          path: "/cards/@me/backend",
          integrity: "sha256-test",
          manifest: { name: "@me/backend", version: "1.0.0" },
          skills: [],
          registry: null,
          origin: "file",
          git: { commit: "c".repeat(40) },
        },
      ],
    }),
  ).toThrow("git metadata");
});

test("loadCardLock rejects v1 lockfiles", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);
  const v1Payload = {
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
  await writeFile(cardLockPath(root), JSON.stringify(v1Payload, null, 2));

  await expect(loadCardLock(root)).rejects.toThrow("lockfileVersion: 2");
});

test("loadCardLock returns null when no lockfile exists", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  expect(await loadCardLock(root)).toBeNull();
});
