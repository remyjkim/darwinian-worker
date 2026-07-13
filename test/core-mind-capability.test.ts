// ABOUTME: Pins the one manifest predicate that declares optional Worker Mind capability.
// ABOUTME: Prevents skills or empty sections from creating implicit Mind state.

import { expect, test } from "bun:test";
import { cardDeclaresMind } from "../cli/core/mind-capability";

test("cardDeclaresMind recognizes each supported declaration", () => {
  expect(cardDeclaresMind({ name: "@me/x", version: "1.0.0", persona: { include: ["voice"], visibility: "private" } })).toBe(true);
  expect(cardDeclaresMind({ name: "@me/x", version: "1.0.0", beliefs: { include: ["quality"], visibility: "public" } })).toBe(true);
  expect(cardDeclaresMind({ name: "@me/x", version: "1.0.0", memory: { observations: { format: "jsonl" } } })).toBe(true);
  expect(cardDeclaresMind({ name: "@me/x", version: "1.0.0", memory: { insights: { format: "md" } } })).toBe(true);
});

test("cardDeclaresMind rejects skills and empty declarations", () => {
  expect(cardDeclaresMind({ name: "@me/x", version: "1.0.0", skills: { include: ["alpha"] } })).toBe(false);
  expect(cardDeclaresMind({ name: "@me/x", version: "1.0.0", persona: { include: [] }, beliefs: { include: [] }, memory: {} })).toBe(false);
});
