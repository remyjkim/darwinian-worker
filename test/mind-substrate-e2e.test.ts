// ABOUTME: End-to-end provision verification for the substrate split (task 74 P6), using the
// ABOUTME: REAL card sources via loadCardMindContent — not fixture shapes. Proves criterion 3
// ABOUTME: (starter alone provisions a complete mind) and criterion 2 ([tools, content] → only
// ABOUTME: content fences) against the actual published card content.

import { afterEach, expect, test as baseTest } from "bun:test";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMindDbClient } from "../cli/core/mind-store/client";
import { loadCardMindContent, seedMind } from "../cli/core/mind-store/seed";
import type { CardLockEntry } from "../cli/core/card-lock";
import type { CardManifest } from "../cli/core/card-manifest";
import { startFakeBgdb, type FakeBgdb } from "./fixtures/fake-bgdb";

const MIND_TOOLS_SOURCE = "/Users/pureicis/dev/darwinian-cards/mind-tools";
const MIND_STARTER_SOURCE = "/Users/pureicis/dev/darwinian-cards/mind-starter";
const test = baseTest.skipIf(!existsSync(MIND_TOOLS_SOURCE) || !existsSync(MIND_STARTER_SOURCE));

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

function lockEntry(sourceDir: string, integrity: string): CardLockEntry {
  const manifest = JSON.parse(readFileSync(join(sourceDir, "card.json"), "utf8")) as CardManifest;
  return {
    name: manifest.name!,
    requested: `file:${sourceDir}`,
    version: manifest.version!,
    path: sourceDir,
    integrity,
    manifest,
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
    ...(manifest.persona ? { persona: manifest.persona } : {}),
    ...(manifest.beliefs ? { beliefs: manifest.beliefs } : {}),
    ...(manifest.memory ? { memory: manifest.memory } : {}),
  };
}

test("the real mind-starter, applied alone, provisions a complete mind (voice + collaboration + layers)", async () => {
  const { server, client } = start();

  const entry = lockEntry(MIND_STARTER_SOURCE, "sha256-starter-real");
  const [content] = await Promise.all([loadCardMindContent(entry, MIND_STARTER_SOURCE)]);

  const result = await seedMind(client, "mind_starter", [content]);

  expect(result.alreadyProvisioned).toBe(false);
  // persona seeded with the real voice content
  expect(result.created).toContain("/minds/mind_starter/persona.md");
  const persona = server.readFile("/minds/mind_starter/persona.md")!;
  expect(persona).toContain('card="@darwinian/mind-starter"');
  expect(persona).toContain("Speak plainly and directly");
  // belief seeded
  expect(result.created).toContain("/minds/mind_starter/beliefs/@darwinian/mind-starter/collaboration/BELIEF.md");
  const belief = server.readFile("/minds/mind_starter/beliefs/@darwinian/mind-starter/collaboration/BELIEF.md")!;
  expect(belief).toContain("Durable knowledge belongs in memory");
  // memory layers scaffolded — the seed index records the declared layers
  const { readMindIndex } = await import("../cli/core/mind-store/ledger");
  const index = await readMindIndex(client, "mind_starter");
  expect(index?.memory).toEqual({ l4: { format: "md" }, l5: { format: "jsonl" } });
});

test("the real [mind-tools, content] stack composes a persona with ONLY the content card's voice (no substrate pollution)", async () => {
  const { server, client } = start();

  // A synthetic content card carrying its own distinctive voice, composed under the real substrate.
  const toolsEntry = lockEntry(MIND_TOOLS_SOURCE, "sha256-tools-real");
  const toolsContent = await loadCardMindContent(toolsEntry, MIND_TOOLS_SOURCE);

  const figureEntry: CardLockEntry = {
    name: "@x/figure-mind",
    requested: "file:@x/figure-mind",
    version: "1.0.0",
    path: "@x/figure-mind",
    integrity: "sha256-figure",
    manifest: {
      name: "@x/figure-mind",
      version: "1.0.0",
      persona: { include: ["voice"], visibility: "internal" },
    } as CardManifest,
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
    persona: { include: ["voice"], visibility: "internal" },
  };
  // Point loadCardMindContent at a temp content root with the figure's persona.
  const figureRoot = `${MIND_TOOLS_SOURCE}/../.e2e-figure-tmp`;
  const { mkdir, writeFile, rm } = await import("node:fs/promises");
  await mkdir(join(figureRoot, "persona", "voice"), { recursive: true });
  await writeFile(join(figureRoot, "persona", "voice", "PERSONA.md"), "# voice\n\nA distinctive, figure-specific voice.\n");
  try {
    const figureContent = await loadCardMindContent(figureEntry, figureRoot);

    await seedMind(client, "mind_figure", [toolsContent, figureContent]);

    const persona = server.readFile("/minds/mind_figure/persona.md")!;
    // Only the figure's fence is present; the substrate contributed nothing.
    expect(persona).toContain('card="@x/figure-mind"');
    expect(persona).toContain("A distinctive, figure-specific voice");
    expect(persona).not.toContain('card="@darwinian/mind-tools"');
  } finally {
    await rm(figureRoot, { recursive: true, force: true });
  }
});
