// ABOUTME: Regression guard for the mind substrate split (analysis 115): a composed mind's
// ABOUTME: persona must contain only the content card's fences — the substrate contributes
// ABOUTME: no voice of its own. Asserts criterion 2 of task 74 at the core (seed) tier.

import { afterEach, expect, test } from "bun:test";
import { composePersona, parsePersona } from "../cli/core/mind-content/persona-composer";
import { createMindDbClient } from "../cli/core/mind-store/client";
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

const toolsShaped: CardMindContent = {
  name: "@darwinian/mind-tools",
  version: "0.1.0",
  integrity: "sha256-tools",
  persona: [], // the substrate carries NO persona — this is the whole point of the split
  beliefs: [],
  memory: { l4: { format: "md" }, l5: { format: "jsonl" } },
};

const contentShaped: CardMindContent = {
  name: "@x/figure-mind",
  version: "1.0.0",
  integrity: "sha256-figure",
  persona: [{ entry: "voice", content: "# voice\n\nA distinctive, figure-specific voice.\n" }],
  beliefs: [{ entry: "skepticism", content: "# skepticism\n\nDefault to doubt; earn conviction.\n" }],
  memory: {},
};

test("a [mind-tools, content-card] stack composes a persona with only the content card's fences (no substrate pollution)", () => {
  const document = composePersona([toolsShaped, contentShaped].map((card) => ({ card: card.name, entries: card.persona })))!;
  const parsed = parsePersona(document);

  // Only the content card contributed fences.
  expect(parsed.sections).toHaveLength(1);
  expect(parsed.sections[0]?.card).toBe("@x/figure-mind");
  expect(parsed.sections[0]?.entry).toBe("voice");
  expect(parsed.outsideFences).toEqual([]);

  // No fence attributes a persona to the substrate.
  expect(document).not.toContain('card="@darwinian/mind-tools"');
});

test("the split is load-bearing: a substrate that still carries a persona WOULD pollute a composed mind", () => {
  // This is the pre-split shape — the regression we're guarding against.
  const pollutedTools: CardMindContent = {
    ...toolsShaped,
    name: "@darwinian/mind-card",
    persona: [{ entry: "voice", content: "# voice\n\nPlain speech.\n" }],
  };

  const document = composePersona([pollutedTools, contentShaped].map((card) => ({ card: card.name, entries: card.persona })))!;
  const parsed = parsePersona(document);

  // Both cards contributed fences — this is the pollution the split eliminates.
  expect(parsed.sections).toHaveLength(2);
  expect(parsed.sections.map((s) => s.card)).toEqual(["@darwinian/mind-card", "@x/figure-mind"]);
});

test("seedMind writes only the content card's persona fence for a [tools, content] stack", async () => {
  const { server, client } = start();

  await seedMind(client, "mind_1", [toolsShaped, contentShaped]);

  const persona = server.readFile("/minds/mind_1/persona.md")!;
  const parsed = parsePersona(persona);

  expect(parsed.sections).toHaveLength(1);
  expect(parsed.sections[0]?.card).toBe("@x/figure-mind");
  expect(persona).not.toContain('card="@darwinian/mind-tools"');
});
