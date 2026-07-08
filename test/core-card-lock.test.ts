// ABOUTME: Verifies Card lockfile v2 read/write helpers.
// ABOUTME: Protects origin metadata and Git commit persistence for project cards.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  cardLockPath,
  loadCardLock,
  writeCardLock,
  validateCardLockfile,
  persistCardLock,
  HOOKS_MIN_DRWN_VERSION,
  MINDS_MIN_DRWN_VERSION,
} from "../cli/core/card-lock";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

const TREE_SHA = "a".repeat(40);

test("writeCardLock creates a v5 project lockfile and loadCardLock reads it", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  const path = await writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      treeSha: TREE_SHA,
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
  expect(loaded?.lockfileVersion).toBe(5);
  expect(loaded?.store?.minDrwnVersion).toBeDefined();
  expect(loaded?.cards[0]?.name).toBe("@me/backend");
  expect(loaded?.cards[0]?.origin).toBe("store");
  expect(loaded?.cards[0]?.git?.commit).toBe("a".repeat(40));
  expect(loaded?.cards[0]?.treeSha).toBe(TREE_SHA);
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
      treeSha: TREE_SHA,
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
      treeSha: TREE_SHA,
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

  expect(raw.lockfileVersion).toBe(5);
  expect(loaded?.cards[0]?.hooks).toEqual(["audit"]);
  expect(loaded?.cards[0]?.hookConsent?.consentedRange).toBe("^1.0.0");
});

test("validateCardLockfile reads v3 entries with absent card content metadata", () => {
  const lock = validateCardLockfile({
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
        hooks: [],
        registry: null,
        origin: "store",
        git: { commit: "a".repeat(40) },
      },
    ],
  });

  expect(lock.lockfileVersion).toBe(3);
  expect(lock.cards[0]?.skills).toEqual([]);
  expect(lock.cards[0]?.hooks).toEqual([]);
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

  await expect(loadCardLock(root)).rejects.toThrow("lockfileVersion: 2, 3, 4, or 5");
});

test("loadCardLock returns null when no lockfile exists", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  expect(await loadCardLock(root)).toBeNull();
});

test("persistCardLock backfills treeSha before writing v5 lock", async () => {
  const { scaffoldCliFixture, cleanupTempRoots: _cleanup } = await import("./helpers");
  const { createLocalCardRepo } = await import("./fixtures/git-helpers");
  const { persistCardLock, loadCardLock } = await import("../cli/core/card-lock");
  const { resolveCardBareRepoPath } = await import("../cli/core/store-paths");
  const git = await import("../cli/core/git");
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/persist", version: "1.0.0", skills: ["alpha"] });
  tempRoots.push(remote.tempDir);
  const root = await createTempRoot("card-lock-persist-");
  tempRoots.push(root);
  const barePath = resolveCardBareRepoPath(fixture.agentsDir, "@team/persist");
  await git.cloneBare(remote.url, barePath);
  const commit = await git.revParse(barePath, "refs/tags/v1.0.0");
  const treeSha = await git.getCommitTree(barePath, commit);
  await persistCardLock(root, fixture.agentsDir, [
    {
      name: "@team/persist",
      requested: `git+${remote.url}#v1.0.0`,
      version: "1.0.0",
      path: join(fixture.agentsDir, "drwn", "extracted", treeSha),
      integrity: "sha256-test",
      manifest: { name: "@team/persist", version: "1.0.0" },
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: "git",
      git: { url: remote.url, ref: "v1.0.0", commit },
    },
  ]);
  const loaded = await loadCardLock(root);
  expect(loaded?.cards[0]?.treeSha).toBe(treeSha);
});

test("persistCardLock rejects when treeSha backfill is impossible", async () => {
  const root = await createTempRoot("card-lock-persist-fail-");
  tempRoots.push(root);
  await expect(
    persistCardLock(root, join(root, "agents"), [
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
      },
    ]),
  ).rejects.toThrow(/git\.commit|treeSha/i);
});

test("writeCardLock preserves mind content metadata and raises the version floor", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  await writeCardLock(root, [
    {
      name: "@me/mind",
      requested: "@me/mind@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/mind/1.0.0",
      integrity: "sha256-test",
      treeSha: TREE_SHA,
      manifest: {
        name: "@me/mind",
        version: "1.0.0",
        persona: { include: ["voice"], visibility: "internal" },
        beliefs: { include: ["engineering"], visibility: "public" },
        memory: { l5: { format: "jsonl" } },
      },
      skills: [],
      hooks: [],
      registry: null,
      origin: "store",
      git: { commit: "f".repeat(40) },
    },
  ]);

  const raw = JSON.parse(await readFile(cardLockPath(root), "utf8"));
  const loaded = await loadCardLock(root);

  expect(raw.lockfileVersion).toBe(5);
  expect(raw.store.minDrwnVersion).toBe(MINDS_MIN_DRWN_VERSION);
  expect(loaded?.cards[0]?.persona).toEqual({ include: ["voice"], visibility: "internal" });
  expect(loaded?.cards[0]?.beliefs).toEqual({ include: ["engineering"], visibility: "public" });
  expect(loaded?.cards[0]?.memory?.l5).toEqual({ format: "jsonl" });
});

test("writeCardLock keeps the hooks floor for cards without mind content", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  await writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      treeSha: TREE_SHA,
      manifest: { name: "@me/backend", version: "1.0.0" },
      skills: [],
      hooks: [],
      registry: null,
      origin: "store",
      git: { commit: "f".repeat(40) },
    },
  ]);

  const raw = JSON.parse(await readFile(cardLockPath(root), "utf8"));
  expect(raw.store.minDrwnVersion).toBe(HOOKS_MIN_DRWN_VERSION);
});

test("validateCardLockfile reads entries with absent mind content metadata", () => {
  const lock = validateCardLockfile({
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
        hooks: [],
        registry: null,
        origin: "store",
        git: { commit: "a".repeat(40) },
      },
    ],
  });

  expect(lock.cards[0]?.persona).toBeUndefined();
  expect(lock.cards[0]?.beliefs).toBeUndefined();
  expect(lock.cards[0]?.memory).toBeUndefined();
});

test("validateCardLockfile rejects unsupported memory layers and memory include", () => {
  const entry = {
    name: "@me/mind",
    requested: "@me/mind@^1.0.0",
    version: "1.0.0",
    path: "/cards/@me/mind/1.0.0",
    integrity: "sha256-test",
    treeSha: TREE_SHA,
    manifest: { name: "@me/mind", version: "1.0.0" },
    skills: [],
    hooks: [],
    registry: null,
    origin: "store",
    git: { commit: "a".repeat(40) },
  };

  expect(() =>
    validateCardLockfile({ lockfileVersion: 5, cards: [{ ...entry, memory: { l3: { format: "md" } } }] }),
  ).toThrow(/unsupported memory layer l3/);
  expect(() =>
    validateCardLockfile({ lockfileVersion: 5, cards: [{ ...entry, memory: { l5: { include: ["notes"] } } }] }),
  ).toThrow(/memory entries are DB-native/);
});
