// ABOUTME: Verifies structural Card diff classification.
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

test("removing a hook is classified as major", () => {
  expect(
    diffCards(
      { ...base, hooks: { include: ["audit"] } },
      { ...base, version: "2.0.0", hooks: { include: [] } },
    ).classification,
  ).toBe("major");
});

test("adding a hook is classified as minor", () => {
  expect(diffCards(base, { ...base, version: "1.1.0", hooks: { include: ["audit"] } }).classification).toBe("minor");
});

test("changing description only is classified as patch", () => {
  expect(diffCards(base, { ...base, version: "1.0.1", description: "new" }).classification).toBe("patch");
});

const blueprint = { name: "@me/fe", version: "1.0.0", kind: "blueprint" as const, composedFrom: ["@me/a@^1.0.0"] };

test("adding a blueprint member is classified as minor", () => {
  expect(
    diffCards(blueprint, { ...blueprint, version: "1.1.0", composedFrom: ["@me/a@^1.0.0", "@me/b@^1.0.0"] }).classification,
  ).toBe("minor");
});

test("removing a blueprint member is classified as major", () => {
  expect(diffCards(blueprint, { ...blueprint, version: "2.0.0", composedFrom: [] }).classification).toBe("major");
});
