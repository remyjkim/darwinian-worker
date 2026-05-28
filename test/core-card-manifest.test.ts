// ABOUTME: Verifies Harness Card manifest validation and naming rules.
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
