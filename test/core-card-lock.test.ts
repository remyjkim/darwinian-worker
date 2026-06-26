// ABOUTME: Verifies Mind Card lockfile v2 read/write helpers.
// ABOUTME: Protects origin metadata and Git commit persistence for project cards.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cardLockPath, loadCardLock, writeCardLock, validateCardLockfile } from "../cli/core/card-lock";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("writeCardLock creates a v3 project lockfile and loadCardLock reads it", async () => {
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
      hooks: [],
      registry: null,
      origin: "store",
      git: { commit: "a".repeat(40) },
    },
  ]);

  expect(path).toBe(cardLockPath(root));
  expect(existsSync(path)).toBe(true);
  const loaded = await loadCardLock(root);
  expect(loaded?.lockfileVersion).toBe(3);
  expect(loaded?.store?.minDrwnVersion).toBeDefined();
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
      hooks: [],
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

test("validateCardLockfile reads v2 entries with empty hooks", () => {
  const lock = validateCardLockfile({
    lockfileVersion: 2,
    cards: [
      {
        name: "@me/backend",
        requested: "@me/backend@^1.0.0",
        version: "1.0.0",
        path: "/cards/@me/backend/1.0.0",
        integrity: "sha256-test",
        manifest: { name: "@me/backend", version: "1.0.0" },
        skills: ["alpha"],
        registry: null,
        origin: "store",
        git: { commit: "a".repeat(40) },
      },
    ],
  });

  expect(lock.lockfileVersion).toBe(2);
  expect(lock.cards[0]?.hooks).toEqual([]);
  expect(lock.cards[0]?.hookConsent).toBeUndefined();
});

test("writeCardLock preserves hooks and consent in v3", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  await writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      manifest: { name: "@me/backend", version: "1.0.0", hooks: { include: ["audit"] } },
      skills: [],
      hooks: ["audit"],
      hookConsent: { consentedAt: "2026-06-12T00:00:00.000Z", consentedRange: "^1.0.0" },
      registry: null,
      origin: "store",
      git: { commit: "d".repeat(40) },
    },
  ]);

  const raw = JSON.parse(await readFile(cardLockPath(root), "utf8"));
  const loaded = await loadCardLock(root);

  expect(raw.lockfileVersion).toBe(3);
  expect(loaded?.cards[0]?.hooks).toEqual(["audit"]);
  expect(loaded?.cards[0]?.hookConsent?.consentedRange).toBe("^1.0.0");
});

test("validateCardLockfile rejects invalid hookConsent", () => {
  expect(() =>
    validateCardLockfile({
      lockfileVersion: 3,
      cards: [
        {
          name: "@me/backend",
          requested: "@me/backend@^1.0.0",
          version: "1.0.0",
          path: "/cards/@me/backend/1.0.0",
          integrity: "sha256-test",
          manifest: { name: "@me/backend", version: "1.0.0" },
          skills: [],
          hooks: ["audit"],
          hookConsent: { consentedAt: "not-a-date", consentedRange: "^1.0.0" },
          registry: null,
          origin: "store",
          git: { commit: "e".repeat(40) },
        },
      ],
    }),
  ).toThrow("hookConsent.consentedAt must be an ISO timestamp");
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
          hooks: [],
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
          hooks: [],
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

  await expect(loadCardLock(root)).rejects.toThrow("lockfileVersion: 2 or 3");
});

test("loadCardLock returns null when no lockfile exists", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  expect(await loadCardLock(root)).toBeNull();
});
