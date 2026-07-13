// ABOUTME: Pins the strict namespaced V1 Mind index parser and stable error classification.
// ABOUTME: Rejects prototype, numbered, reserved, and structurally ambiguous persisted state.

import { expect, test } from "bun:test";
import { parseMindIndexText, type MindIndex } from "../cli/core/mind-store/mind-index";

function validIndex(): MindIndex {
  return {
    schema: "drwn.mind-index",
    schemaVersion: 1,
    mindId: "mind_abc",
    worker: { card: "@team/worker", version: "1.0.0", integrity: "sha256-worker" },
    cards: [{ card: "@team/worker", version: "1.0.0", integrity: "sha256-worker" }],
    persona: { path: "persona.md", entries: [{ card: "@team/worker", entry: "voice" }] },
    beliefs: { entries: [{ card: "@team/worker", entry: "quality", path: "/minds/mind_abc/beliefs/quality/BELIEF.md" }] },
    memory: { observations: { format: "jsonl" }, insights: { format: "md" } },
    ledger: [{
      path: "/minds/mind_abc/persona.md",
      card: "@team/worker",
      cardVersion: "1.0.0",
      section: "persona",
      entry: "voice",
      etag: 'W/"etag"',
    }],
    drwnVersion: "0.9.0",
  };
}

test("parseMindIndexText accepts the complete strict V1 shape and empty semantic memory", () => {
  expect(parseMindIndexText(JSON.stringify(validIndex()), "/minds/mind_abc/mind.json")).toEqual(validIndex());
  const empty = { ...validIndex(), memory: {} };
  expect(parseMindIndexText(JSON.stringify(empty), "/minds/mind_abc/mind.json").memory).toEqual({});
});

test("parseMindIndexText classifies malformed JSON and unsupported identity separately", () => {
  expect(() => parseMindIndexText("{", "/index")).toThrow(expect.objectContaining({ code: "MIND_INDEX_INVALID" }));
  for (const value of [
    { schemaVersion: 1 },
    { ...validIndex(), schema: "other.index" },
    { ...validIndex(), schemaVersion: 2 },
    { ...validIndex(), schemaVersion: undefined },
  ]) {
    expect(() => parseMindIndexText(JSON.stringify(value), "/index")).toThrow(
      expect.objectContaining({ code: "MIND_INDEX_UNSUPPORTED" }),
    );
  }
});

test("parseMindIndexText rejects malformed and unknown fields at owned boundaries", () => {
  const mutations = [
    { ...validIndex(), extra: true },
    { ...validIndex(), worker: { ...validIndex().worker, extra: true } },
    { ...validIndex(), cards: [{ ...validIndex().cards[0], extra: true }] },
    { ...validIndex(), persona: { ...validIndex().persona, extra: true } },
    { ...validIndex(), persona: { path: null, entries: [{ card: "@team/worker", entry: "voice", extra: true }] } },
    { ...validIndex(), beliefs: { entries: [{ ...validIndex().beliefs.entries[0], extra: true }] } },
    { ...validIndex(), memory: { observations: { format: "jsonl", extra: true } } },
    { ...validIndex(), ledger: [{ ...validIndex().ledger[0], extra: true }] },
  ];
  for (const value of mutations) {
    expect(() => parseMindIndexText(JSON.stringify(value), "/index")).toThrow(
      expect.objectContaining({ code: "MIND_INDEX_INVALID" }),
    );
  }
});

test("parseMindIndexText rejects numbered, reserved, and mismatched memory", () => {
  for (const memory of [
    { l4: { format: "md" } },
    { raw_data: { format: "jsonl" } },
    { observations: { format: "md" } },
    { insights: { format: "jsonl" } },
  ]) {
    expect(() => parseMindIndexText(JSON.stringify({ ...validIndex(), memory }), "/index")).toThrow(
      expect.objectContaining({ code: "MIND_INDEX_INVALID" }),
    );
  }
});

test("Mind index errors provide reset guidance without echoing persisted content", () => {
  const secret = "do-not-echo-this-content";
  try {
    parseMindIndexText(JSON.stringify({ ...validIndex(), memory: { l5: { format: secret } } }), "/index");
    throw new Error("expected parser failure");
  } catch (error) {
    expect(error).toMatchObject({ code: "MIND_INDEX_INVALID" });
    expect(String((error as Error).message)).toContain("reset");
    expect(String((error as Error).message)).not.toContain(secret);
  }
});
