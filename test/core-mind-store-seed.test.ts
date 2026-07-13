// ABOUTME: Verifies the mind seed engine: fenced persona composition, belief copies, ledger index, idempotency.
// ABOUTME: Protects the provision path and the drift states that sync/diff/checkpoint build on.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeCardLock, type CardLockEntry } from "../cli/core/card-lock";
import { createMindDbClient } from "../cli/core/mind-store/client";
import { computeDrift, readMindIndex } from "../cli/core/mind-store/ledger";
import { loadProjectMindCards } from "../cli/core/mind-store/project";
import { seedMind, type CardMindContent } from "../cli/core/mind-store/seed";
import { cleanupTempRoots, createTempRoot, writeSupportedProjectConfig } from "./helpers";
import { startFakeBgdb, type FakeBgdb } from "./fixtures/fake-bgdb";

let servers: FakeBgdb[] = [];
const tempRoots: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.stop();
  }
  await cleanupTempRoots(tempRoots);
});

function start() {
  const server = startFakeBgdb();
  servers.push(server);
  return { server, client: createMindDbClient({ baseUrl: server.baseUrl, token: server.token }) };
}

const cards: CardMindContent[] = [
  {
    name: "@team/seeded-mind",
    version: "0.1.0",
    integrity: "sha256-mind",
    persona: [{ entry: "voice", content: "# voice\n\nPlain speech.\n" }],
    beliefs: [{ entry: "collaboration", content: "# collaboration\n\nMemory over scrollback.\n" }],
    memory: { l4: { format: "md" }, l5: { format: "jsonl" } },
  },
  {
    name: "@team/overlay",
    version: "1.2.0",
    integrity: "sha256-overlay",
    persona: [{ entry: "review", content: "# review\n\nEvidence first.\n" }],
    beliefs: [],
    memory: {},
  },
];

test("seedMind writes fenced persona, belief copies, and a ledger index", async () => {
  const { server, client } = start();

  const result = await seedMind(client, "mind_1", cards);

  expect(result.alreadyProvisioned).toBe(false);
  expect(result.created).toContain("/minds/mind_1/persona.md");
  expect(result.created).toContain("/minds/mind_1/beliefs/@team/seeded-mind/collaboration/BELIEF.md");

  const persona = server.readFile("/minds/mind_1/persona.md")!;
  expect(persona).toContain('<!-- drwn:persona:start card="@team/seeded-mind" entry="voice" -->');
  expect(persona.indexOf("Plain speech.")).toBeLessThan(persona.indexOf("Evidence first."));

  const index = await readMindIndex(client, "mind_1");
  expect(index?.mindId).toBe("mind_1");
  expect(index?.worker).toEqual({ card: "@team/seeded-mind", version: "0.1.0", integrity: "sha256-mind" });
  expect(index?.memory).toEqual({ l4: { format: "md" }, l5: { format: "jsonl" } });
  expect(index?.ledger.map((row) => row.path)).toEqual([
    "/minds/mind_1/persona.md",
    "/minds/mind_1/beliefs/@team/seeded-mind/collaboration/BELIEF.md",
  ]);
  expect(index?.ledger.every((row) => row.etag.startsWith('W/"'))).toBe(true);
  expect(index?.cards).toEqual([
    { card: "@team/seeded-mind", version: "0.1.0", integrity: "sha256-mind" },
    { card: "@team/overlay", version: "1.2.0", integrity: "sha256-overlay" },
  ]);
  const persisted = JSON.parse(server.readFile("/minds/mind_1/mind.json")!);
  expect(persisted).not.toHaveProperty("activeWorkers");
  expect(persisted).not.toHaveProperty("sources");
});

test("seedMind rejects an empty Worker closure", async () => {
  const { client } = start();

  await expect(seedMind(client, "mind_empty", [])).rejects.toMatchObject({ code: "MIND_WORKER_REQUIRED" });
});

test("loadProjectMindCards returns the selected root followed by its ordered members", async () => {
  const projectRoot = await createTempRoot("mind-project-");
  tempRoots.push(projectRoot);
  const contentRoot = join(projectRoot, "content");
  const rootCard = cardEntry(contentRoot, "@team/worker", {
    kind: "blueprint",
    composedFrom: ["@team/member@1.0.0"],
  });
  const memberCard = cardEntry(contentRoot, "@team/member", {
    persona: { include: ["voice"], visibility: "internal" },
  });
  const inactiveCard = cardEntry(contentRoot, "@team/inactive");
  await mkdir(join(memberCard.path, "persona", "voice"), { recursive: true });
  await writeFile(join(memberCard.path, "persona", "voice", "PERSONA.md"), "# voice\n\nMember voice.\n");
  await writeSupportedProjectConfig(projectRoot, {
    workers: ["@team/worker@1.0.0", "@team/inactive@1.0.0"],
    activeWorker: "@team/worker",
  });
  await writeCardLock(projectRoot, {
    workerRoots: [
      { name: rootCard.name, requested: rootCard.requested, kind: "blueprint", members: [memberCard.name] },
      { name: inactiveCard.name, requested: inactiveCard.requested, kind: "card", members: [] },
    ],
    cards: [rootCard, memberCard, inactiveCard],
  });

  const loaded = await loadProjectMindCards(projectRoot);

  expect(loaded.map((card) => card.name)).toEqual(["@team/worker", "@team/member"]);
  expect(loaded.map((card) => card.integrity)).toEqual(["sha256-@team/worker", "sha256-@team/member"]);
  expect(loaded[1]?.persona).toEqual([{ entry: "voice", content: "# voice\n\nMember voice.\n" }]);
});

test("seedMind is idempotent: a provisioned mind reports alreadyProvisioned with no writes", async () => {
  const { server, client } = start();
  await seedMind(client, "mind_1", cards);
  const before = server.readFile("/minds/mind_1/mind.json");

  const second = await seedMind(client, "mind_1", cards);

  expect(second.alreadyProvisioned).toBe(true);
  expect(second.created).toEqual([]);
  expect(server.readFile("/minds/mind_1/mind.json")).toBe(before);
});

test("computeDrift distinguishes in-sync, db-edited, and card-updated files", async () => {
  const { client } = start();
  await seedMind(client, "mind_1", cards);
  const index = (await readMindIndex(client, "mind_1"))!;

  const clean = await computeDrift(client, index, cards);
  expect(clean.every((row) => row.state === "in-sync")).toBe(true);

  await client.put("/minds/mind_1/persona.md", "edited live\n");
  const edited = await computeDrift(client, index, cards);
  expect(edited.find((row) => row.path.endsWith("persona.md"))?.state).toBe("db-edited");

  const bumped = cards.map((card) =>
    card.name === "@team/seeded-mind" ? { ...card, version: "0.2.0" } : card,
  );
  const pending = await computeDrift(client, index, bumped);
  const beliefRow = pending.find((row) => row.path.includes("/beliefs/"));
  expect(beliefRow?.state).toBe("card-updated");
});

function cardEntry(
  contentRoot: string,
  name: string,
  manifest: Partial<CardLockEntry["manifest"]> = {},
): CardLockEntry {
  return {
    name,
    requested: `${name}@1.0.0`,
    version: "1.0.0",
    path: join(contentRoot, name.replace("/", "--")),
    integrity: `sha256-${name}`,
    manifest: {
      name,
      version: "1.0.0",
      description: "fixture",
      ...manifest,
    },
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
  };
}
