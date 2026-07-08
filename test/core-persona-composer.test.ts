// ABOUTME: Verifies stack-ordered persona composition with provenance fences and fence-aware parsing.
// ABOUTME: Protects the compose/parse round-trip that seed, diff, and checkpoint depend on.

import { expect, test } from "bun:test";
import { composePersona, parsePersona } from "../cli/core/mind-content/persona-composer";

const cards = [
  {
    card: "@team/base-mind",
    entries: [
      { entry: "voice", content: "# voice\n\nSpeak plainly.\n" },
      { entry: "pace", content: "# pace\n\nSlow is smooth.\n" },
    ],
  },
  {
    card: "@team/reviewer-mind",
    entries: [{ entry: "review-style", content: "# review-style\n\nEvidence first.\n" }],
  },
];

test("composePersona concatenates entries in stack order with provenance fences", () => {
  const document = composePersona(cards);

  expect(document).not.toBeNull();
  const voice = document!.indexOf('<!-- drwn:persona:start card="@team/base-mind" entry="voice" -->');
  const pace = document!.indexOf('<!-- drwn:persona:start card="@team/base-mind" entry="pace" -->');
  const review = document!.indexOf('<!-- drwn:persona:start card="@team/reviewer-mind" entry="review-style" -->');
  expect(voice).toBeGreaterThanOrEqual(0);
  expect(pace).toBeGreaterThan(voice);
  expect(review).toBeGreaterThan(pace);
  expect(document).toContain("Speak plainly.");
  expect(document).toContain('<!-- drwn:persona:end card="@team/reviewer-mind" entry="review-style" -->');
});

test("composePersona returns null when no entries exist", () => {
  expect(composePersona([])).toBeNull();
  expect(composePersona([{ card: "@team/empty", entries: [] }])).toBeNull();
});

test("parsePersona recovers per-entry sections from a composed document", () => {
  const document = composePersona(cards)!;

  const parsed = parsePersona(document);

  expect(parsed.sections.map((section) => `${section.card}#${section.entry}`)).toEqual([
    "@team/base-mind#voice",
    "@team/base-mind#pace",
    "@team/reviewer-mind#review-style",
  ]);
  expect(parsed.sections[0]?.content).toBe("# voice\n\nSpeak plainly.\n");
  expect(parsed.outsideFences).toEqual([]);
});

test("compose then parse is an identity on section content", () => {
  const document = composePersona(cards)!;
  const parsed = parsePersona(document);

  const recomposed = composePersona(
    [
      {
        card: "@team/base-mind",
        entries: parsed.sections.filter((s) => s.card === "@team/base-mind").map((s) => ({ entry: s.entry, content: s.content })),
      },
      {
        card: "@team/reviewer-mind",
        entries: parsed.sections.filter((s) => s.card === "@team/reviewer-mind").map((s) => ({ entry: s.entry, content: s.content })),
      },
    ],
  );

  expect(recomposed).toBe(document);
});

test("parsePersona captures edits outside any fence", () => {
  const document = composePersona(cards)!;
  const edited = `A stray preamble line.\n${document}\nA trailing note.\n`;

  const parsed = parsePersona(edited);

  expect(parsed.sections).toHaveLength(3);
  expect(parsed.outsideFences.join("\n")).toContain("A stray preamble line.");
  expect(parsed.outsideFences.join("\n")).toContain("A trailing note.");
});

test("parsePersona reflects in-section edits in the recovered content", () => {
  const document = composePersona(cards)!;
  const edited = document.replace("Speak plainly.", "Speak plainly and kindly.");

  const parsed = parsePersona(edited);

  expect(parsed.sections[0]?.content).toContain("Speak plainly and kindly.");
});
