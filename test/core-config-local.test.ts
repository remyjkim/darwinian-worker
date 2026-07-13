// ABOUTME: Verifies config.local.json overlay read/write behavior.
// ABOUTME: Ensures gitignore hygiene without touching committed config.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("writeConfigLocal creates gitignored overlay file", async () => {
  const root = await createTempRoot("config-local-");
  tempRoots.push(root);
  const { writeConfigLocal, loadConfigLocal } = await import("../cli/core/config-local");
  await writeConfigLocal(root, { overrides: { "@me/x": "file:/tmp/x" } });
  const loaded = await loadConfigLocal(root);
  expect(loaded?.overrides?.["@me/x"]).toBe("file:/tmp/x");
  const gitignore = await readFile(join(root, ".gitignore"), "utf8");
  expect(gitignore).toContain("config.local.json");
});

test("ensureCardLockLocalEntryFromSource writes file-origin local lock entries", async () => {
  const root = await createTempRoot("config-local-lock-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(root, "source");
  const { mkdir: mk, writeFile: wf } = await import("node:fs/promises");
  await mk(join(sourceDir, "skills", "alpha"), { recursive: true });
  await wf(join(sourceDir, "card.json"), `${JSON.stringify({ name: "@me/local", version: "0.1.0", skills: { include: ["alpha"] } }, null, 2)}\n`);
  await wf(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
  const { ensureCardLockLocalEntryFromSource, loadCardLockLocal } = await import("../cli/core/config-local");
  await ensureCardLockLocalEntryFromSource(root, agentsDir, "@me/local", sourceDir);
  const local = await loadCardLockLocal(root);
  expect(local?.[0]?.origin).toBe("file");
  expect(local?.[0]?.name).toBe("@me/local");
  expect(local?.[0]?.treeSha).toBeUndefined();
});

test("card.lock.local writes the v6 graph shape for a local-only Worker root", async () => {
  const root = await createTempRoot("config-local-v6-");
  tempRoots.push(root);
  const card = {
    name: "@me/local",
    requested: "file:/tmp/local",
    version: "0.1.0",
    path: "/tmp/local",
    integrity: "sha256-local",
    manifest: { name: "@me/local", version: "0.1.0" },
    skills: [],
    hooks: [],
    registry: null as null,
    origin: "file" as const,
  };
  const { writeCardLockLocal, loadCardLockLocalGraph } = await import("../cli/core/config-local");

  await writeCardLockLocal(root, {
    roots: [{ name: card.name, requested: card.requested, kind: "card", members: [] }],
    cards: [card],
  });

  const raw = JSON.parse(await readFile(join(root, ".agents", "drwn", "card.lock.local"), "utf8"));
  expect(raw.lockfileVersion).toBe(6);
  expect(raw.workerRoots).toHaveLength(1);
  expect(await loadCardLockLocalGraph(root)).toEqual({ roots: raw.workerRoots, cards: raw.cards });
});

test("a local replacement cannot change a committed member into a Blueprint", async () => {
  const root = await createTempRoot("config-local-identity-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const rootCard = {
    name: "@me/worker",
    requested: "file:/tmp/worker",
    version: "1.0.0",
    path: "/tmp/worker",
    integrity: "sha256-worker",
    manifest: { name: "@me/worker", version: "1.0.0", kind: "blueprint" as const, composedFrom: ["@me/member@1.0.0"] },
    skills: [],
    hooks: [],
    registry: null as null,
    origin: "file" as const,
  };
  const member = {
    name: "@me/member",
    requested: "file:/tmp/member",
    version: "1.0.0",
    path: "/tmp/member",
    integrity: "sha256-member",
    manifest: { name: "@me/member", version: "1.0.0" },
    skills: [],
    hooks: [],
    registry: null as null,
    origin: "file" as const,
  };
  const { writeCardLock } = await import("../cli/core/card-lock");
  await writeCardLock(root, {
    roots: [{ name: rootCard.name, requested: rootCard.requested, kind: "blueprint", members: [member.name] }],
    cards: [rootCard, member],
  });

  const sourceDir = join(root, "replacement");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({
    name: "@me/member",
    version: "2.0.0",
    kind: "blueprint",
    composedFrom: [],
  }, null, 2)}\n`);
  const { ensureCardLockLocalEntryFromSource } = await import("../cli/core/config-local");

  await expect(
    ensureCardLockLocalEntryFromSource(root, agentsDir, "@me/member", sourceDir),
  ).rejects.toThrow(/member.*Blueprint/i);
});
