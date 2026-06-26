// ABOUTME: Verifies Mind Card manifest validation and naming rules.
// ABOUTME: Protects the authoring contract before card commands consume manifests.

import { expect, test } from "bun:test";
import { validateCardManifest } from "../cli/core/card-manifest";

test("validateCardManifest accepts a minimal valid manifest", () => {
  expect(validateCardManifest({ name: "@me/backend", version: "1.0.0" })).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest rejects missing name or version", () => {
  const result = validateCardManifest({});
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("name is required");
  expect(result.errors).toContain("version is required");
});

test("validateCardManifest rejects invalid semver in version", () => {
  const result = validateCardManifest({ name: "@me/backend", version: "v1" });
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("version must be strict semver");
});

test("validateCardManifest rejects card-level skills.exclude", () => {
  const result = validateCardManifest({ name: "@me/backend", version: "1.0.0", skills: { exclude: ["x"] } });
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("skills.exclude is not allowed in card manifests");
});

test("validateCardManifest rejects non-empty skills.shared", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    skills: { include: ["alpha"], shared: ["beta"] },
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toContain("skills.shared is reserved for Wave 2");
});

test("validateCardManifest accepts skills.shared if absent or empty array", () => {
  expect(validateCardManifest({ name: "@me/x", version: "1.0.0", skills: { include: ["a"] } }).ok).toBe(true);
  expect(validateCardManifest({ name: "@me/x", version: "1.0.0", skills: { include: ["a"], shared: [] } }).ok).toBe(true);
});

test("validateCardManifest accepts hooks.include declarations", () => {
  expect(validateCardManifest({ name: "@me/x", version: "1.0.0", hooks: { include: ["audit"] } })).toEqual({
    ok: true,
    errors: [],
  });
});

test("validateCardManifest rejects card-level hooks.exclude and hooks.shared", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    hooks: { include: ["audit"], exclude: ["audit"], shared: ["remote"] },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("hooks.exclude is not allowed in card manifests");
  expect(result.errors).toContain("hooks.shared is not allowed in card manifests");
});

test("validateCardManifest rejects non-array hooks.include", () => {
  const result = validateCardManifest({ name: "@me/x", version: "1.0.0", hooks: { include: "audit" } });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("hooks.include must be an array");
});

test("validateCardManifest accepts persona, beliefs, and memory sections with explicit visibility", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    persona: { include: ["voice"], visibility: "internal" },
    beliefs: { include: ["engineering"], visibility: "public" },
    memory: {
      l4: { include: ["reflections"], visibility: "internal" },
      l6: { include: ["transcripts"], visibility: "private", format: "jsonl" },
    },
  });

  expect(result).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest rejects malformed mind content sections", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    persona: { include: ["../voice"], visibility: "team", exclude: ["x"], shared: ["y"] },
    beliefs: { include: "engineering", visibility: "internal" },
    memory: {
      l4: { include: ["reflections"] },
      l6: { include: ["raw"], visibility: "private", format: "csv" },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(expect.arrayContaining([
    "persona.exclude is not allowed in card manifests",
    "persona.shared is not allowed in card manifests",
    "persona.visibility must be private, internal, or public",
    "persona.include contains invalid entry: ../voice",
    "beliefs.include must be an array",
    "memory.l4.visibility is required when include is non-empty",
    "memory.l6.format must be md, jsonl, or mixed",
  ]));
});

test("validateCardManifest accepts optional quality fields", () => {
  expect(
    validateCardManifest({
      name: "@me/x",
      version: "1.0.0",
      stability: "production",
      lastValidatedWith: "0.1.0",
      testStatusBadge: "https://example.com/status.svg",
    }),
  ).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest rejects invalid quality fields", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    stability: "almost-ready",
    lastValidatedWith: "current",
    testStatusBadge: "file:///tmp/status.svg",
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("stability must be experimental, stable, or production");
  expect(result.errors).toContain("lastValidatedWith must be strict semver");
  expect(result.errors).toContain("testStatusBadge must be an http(s) URL");
});
