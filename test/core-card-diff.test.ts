// ABOUTME: Verifies structural Harness Card diff classification.
// ABOUTME: Protects version-bump guidance for card authors.

import { expect, test } from "bun:test";
import { diffCards } from "../cli/core/card-diff";

const base = { name: "@me/backend", version: "1.0.0", skills: { include: ["alpha"] } };

test("removing a skill is classified as major", () => {
  expect(diffCards(base, { ...base, version: "2.0.0", skills: { include: [] } }).classification).toBe("major");
});

test("adding a skill is classified as minor", () => {
  expect(diffCards(base, { ...base, version: "1.1.0", skills: { include: ["alpha", "beta"] } }).classification).toBe("minor");
});

test("changing description only is classified as patch", () => {
  expect(diffCards(base, { ...base, version: "1.0.1", description: "new" }).classification).toBe("patch");
});
