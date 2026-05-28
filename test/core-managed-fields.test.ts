// ABOUTME: Verifies canonical managed-field hashing for bgng-owned settings regions.
// ABOUTME: Protects drift detection from whitespace and key-order noise.

import { expect, test } from "bun:test";
import { canonicalJsonHash, detectManagedFieldDrift } from "../cli/core/managed-fields";

test("canonicalJsonHash is stable across key ordering", () => {
  expect(canonicalJsonHash({ b: 2, a: { y: 2, x: 1 } })).toBe(
    canonicalJsonHash({ a: { x: 1, y: 2 }, b: 2 }),
  );
});

test("canonicalJsonHash detects value changes", () => {
  expect(canonicalJsonHash({ a: 1 })).not.toBe(canonicalJsonHash({ a: 2 }));
});

test("detectManagedFieldDrift reports changed managed keys", () => {
  const original = { mcpServers: { context7: { command: "npx" } } };
  const hashes = { mcpServers: canonicalJsonHash(original.mcpServers) };

  expect(detectManagedFieldDrift({ mcpServers: { context7: { command: "node" } } }, ["mcpServers"], hashes)).toEqual(["mcpServers"]);
});
