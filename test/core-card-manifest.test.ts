// ABOUTME: Verifies Card manifest validation and naming rules.
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

test("validateCardManifest rejects persona/beliefs/memory on any card kind", () => {
  for (const field of ["persona", "beliefs", "memory"] as const) {
    for (const kind of [undefined, "card", "blueprint"] as const) {
      const result = validateCardManifest({ name: "@me/x", version: "1.0.0", kind, [field]: {} });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        `${field} is no longer supported; advanced context management (persona/beliefs/memory) moved to a separate capability card`,
      );
    }
  }
});

test("validateCardManifest accepts a full blueprint manifest", () => {
  expect(
    validateCardManifest({
      name: "@me/frontend-eng",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: ["@me/a@^1.0.0", "@me/b@^1.0.0"],
      tools: { allow: ["Bash"], deny: ["WebFetch"] },
      permissions: { can_merge_pr: false, requires_human_approval_for: ["production_changes"] },
      evals: ["passes_tests"],
      escalation: { human_owner: "eng_lead", escalate_when: ["confidence_below_threshold"] },
      contextMounts: { read: ["/eng/frontend"], write_proposals: ["/eng/frontend/wm"] },
      identity: { role: "frontend-engineer" },
    }),
  ).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest accepts an empty (degenerate) blueprint", () => {
  expect(validateCardManifest({ name: "@me/bp", version: "1.0.0", kind: "blueprint" })).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest rejects composedFrom/governance on a non-blueprint card", () => {
  for (const field of ["composedFrom", "tools", "permissions", "evals", "escalation", "contextMounts", "identity"] as const) {
    const value = field === "composedFrom" || field === "evals" ? ["@me/x@^1.0.0"] : {};
    const result = validateCardManifest({ name: "@me/x", version: "1.0.0", [field]: value });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(`${field} requires kind: "blueprint"`);
  }
});

test("validateCardManifest rejects malformed blueprint governance shapes", () => {
  const result = validateCardManifest({
    name: "@me/bp",
    version: "1.0.0",
    kind: "blueprint",
    composedFrom: ["@me/a@^1.0.0", ""],
    tools: { allow: "Bash" },
    evals: [1],
    escalation: { escalate_when: "always" },
    identity: "me",
  });
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("composedFrom must be an array of non-empty card refs");
  expect(result.errors).toContain("tools.allow must be an array of strings");
  expect(result.errors).toContain("evals must be an array of strings");
  expect(result.errors).toContain("escalation.escalate_when must be an array of strings");
  expect(result.errors).toContain("identity must be an object");
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
