// ABOUTME: Verifies semantic Mind and pool path conventions and strict destructive-path parsing.
// ABOUTME: Protects the layout contract shared by seed, skills, doctor, and retirement.

import { expect, test } from "bun:test";
import {
  beliefSeedPath,
  memoryKindRoot,
  memoryViewPath,
  mindRoot,
  mindIndexPath,
  parseCanonicalPoolPath,
  personaSeedPath,
  poolEntryPath,
} from "../cli/core/mind-store/paths";

const now = new Date("2026-07-07T14:03:00Z");
const observationId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const insightId = "01ARZ3NDEKTSV4RRFFQ69G5FAW";

test("Mind paths are rooted per Mind ID and semantic kind", () => {
  expect(mindRoot("mind_abc")).toBe("/minds/mind_abc");
  expect(personaSeedPath("mind_abc")).toBe("/minds/mind_abc/persona.md");
  expect(beliefSeedPath("mind_abc", "@team/mind-card", "collaboration")).toBe(
    "/minds/mind_abc/beliefs/@team/mind-card/collaboration/BELIEF.md",
  );
  expect(mindIndexPath("mind_abc")).toBe("/minds/mind_abc/mind.json");
  expect(memoryKindRoot("mind_abc", "observations")).toBe("/minds/mind_abc/memory/observations");
  expect(memoryKindRoot("mind_abc", "insights")).toBe("/minds/mind_abc/memory/insights");
});

test("semantic pool entries use fixed extensions and date shards", () => {
  expect(poolEntryPath({ kind: "observations", now, entryId: observationId })).toBe(
    `/pool/observations/2026-07-07/1403-${observationId}.jsonl`,
  );
  expect(poolEntryPath({ kind: "insights", now, entryId: insightId })).toBe(
    `/pool/insights/2026-07-07/1403-${insightId}.md`,
  );
});

test("both default Mind views are grouped by date", () => {
  const observation = poolEntryPath({ kind: "observations", now, entryId: observationId });
  expect(memoryViewPath("mind_abc", "observations", observation)).toBe(
    `/minds/mind_abc/memory/observations/by-date/2026-07-07/1403-${observationId}.jsonl`,
  );
  const insight = poolEntryPath({ kind: "insights", now, entryId: insightId });
  expect(memoryViewPath("mind_abc", "insights", insight)).toBe(
    `/minds/mind_abc/memory/insights/by-date/2026-07-07/1403-${insightId}.md`,
  );
});

test("strict pool parser accepts only canonical semantic files", () => {
  const path = `/pool/observations/2026-07-07/1403-${observationId}.jsonl`;
  expect(parseCanonicalPoolPath(path)).toEqual({
    kind: "observations",
    date: "2026-07-07",
    filename: `1403-${observationId}.jsonl`,
  });

  for (const invalid of [
    `/pool/l5/2026-07-07/1403-${observationId}.jsonl`,
    `/pool/raw_data/2026-07-07/1403-${observationId}.jsonl`,
    `/pool/observations/2026-02-30/1403-${observationId}.jsonl`,
    `/pool/observations/2026-07-07/2460-${observationId}.jsonl`,
    `/pool/observations/2026-07-07/1403-${observationId}.md`,
    `/pool/observations/extra/2026-07-07/1403-${observationId}.jsonl`,
    `/minds/mind_abc/memory/observations/by-date/2026-07-07/1403-${observationId}.jsonl`,
    "/pool/observations/../../escape.jsonl",
  ]) {
    expect(() => parseCanonicalPoolPath(invalid)).toThrow(/canonical semantic pool file/);
  }
});
