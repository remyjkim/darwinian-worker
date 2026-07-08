// ABOUTME: Verifies the mind seed engine: fenced persona composition, belief copies, ledger index, idempotency.
// ABOUTME: Protects the provision path and the drift states that sync/diff/checkpoint build on.

import { afterEach, expect, test } from "bun:test";
import { createMindDbClient } from "../cli/core/mind-store/client";
import { computeDrift, readMindIndex } from "../cli/core/mind-store/ledger";
import { seedMind, type CardMindContent } from "../cli/core/mind-store/seed";
import { startFakeBgdb, type FakeBgdb } from "./fixtures/fake-bgdb";

let servers: FakeBgdb[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.stop();
  }
});

function start() {
  const server = startFakeBgdb();
  servers.push(server);
  return { server, client: createMindDbClient({ baseUrl: server.baseUrl, token: server.token }) };
}

const cards: CardMindContent[] = [
  {
    name: "@darwinian/mind-card",
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
  expect(result.created).toContain("/minds/mind_1/beliefs/@darwinian/mind-card/collaboration/BELIEF.md");

  const persona = server.readFile("/minds/mind_1/persona.md")!;
  expect(persona).toContain('<!-- drwn:persona:start card="@darwinian/mind-card" entry="voice" -->');
  expect(persona.indexOf("Plain speech.")).toBeLessThan(persona.indexOf("Evidence first."));

  const index = await readMindIndex(client, "mind_1");
  expect(index?.mindId).toBe("mind_1");
  expect(index?.activeWorkers).toEqual(["@darwinian/mind-card", "@team/overlay"]);
  expect(index?.memory).toEqual({ l4: { format: "md" }, l5: { format: "jsonl" } });
  expect(index?.ledger.map((row) => row.path)).toEqual([
    "/minds/mind_1/persona.md",
    "/minds/mind_1/beliefs/@darwinian/mind-card/collaboration/BELIEF.md",
  ]);
  expect(index?.ledger.every((row) => row.etag.startsWith('W/"'))).toBe(true);
  expect(index?.sources).toEqual([
    { card: "@darwinian/mind-card", version: "0.1.0", integrity: "sha256-mind" },
    { card: "@team/overlay", version: "1.2.0", integrity: "sha256-overlay" },
  ]);
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
    card.name === "@darwinian/mind-card" ? { ...card, version: "0.2.0" } : card,
  );
  const pending = await computeDrift(client, index, bumped);
  const beliefRow = pending.find((row) => row.path.includes("/beliefs/"));
  expect(beliefRow?.state).toBe("card-updated");
});
