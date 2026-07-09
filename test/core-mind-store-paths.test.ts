// ABOUTME: Verifies mind and pool path conventions: mind roots, date-sharded pool entries, view paths.
// ABOUTME: Protects the layout contract shared by seed, skills, doctor, and the conventions doc.

import { expect, test } from "bun:test";
import {
  beliefSeedPath,
  memoryViewPath,
  mindRoot,
  mindIndexPath,
  personaSeedPath,
  poolEntryPath,
} from "../cli/core/mind-store/paths";

const now = new Date("2026-07-07T14:03:00Z");

test("mind paths are rooted per mind id", () => {
  expect(mindRoot("mind_abc")).toBe("/minds/mind_abc");
  expect(personaSeedPath("mind_abc")).toBe("/minds/mind_abc/persona.md");
  expect(beliefSeedPath("mind_abc", "@team/mind-card", "collaboration")).toBe(
    "/minds/mind_abc/beliefs/@team/mind-card/collaboration/BELIEF.md",
  );
  expect(mindIndexPath("mind_abc")).toBe("/minds/mind_abc/mind.json");
});

test("pool entries are date-sharded with HHmm-ulid filenames", () => {
  const path = poolEntryPath({ layer: "l5", now, entryId: "01J0EXAMPLEULID0000000000" });
  expect(path).toBe("/pool/l5/2026-07-07/1403-01J0EXAMPLEULID0000000000.jsonl");

  const reflection = poolEntryPath({ layer: "l4", now, entryId: "01J0EXAMPLEULID0000000001" });
  expect(reflection).toBe("/pool/l4/2026-07-07/1403-01J0EXAMPLEULID0000000001.md");
});

test("memory view paths mirror the pool filename under the mind", () => {
  const pool = poolEntryPath({ layer: "l5", now, entryId: "01J0EXAMPLEULID0000000000" });
  expect(memoryViewPath("mind_abc", "l5", pool)).toBe(
    "/minds/mind_abc/memory/l5/by-date/2026-07-07/1403-01J0EXAMPLEULID0000000000.jsonl",
  );
  const l4 = poolEntryPath({ layer: "l4", now, entryId: "X" });
  expect(memoryViewPath("mind_abc", "l4", l4)).toBe("/minds/mind_abc/memory/l4/2026-07-07/1403-X.md");
});
