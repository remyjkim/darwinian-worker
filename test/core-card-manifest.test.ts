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

test("validateCardManifest accepts persona/beliefs sections with visibility", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    persona: { include: ["voice"], visibility: "internal" },
    beliefs: { include: ["quality"], visibility: "private" },
  });

  expect(result).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest requires visibility when persona include is non-empty", () => {
  const result = validateCardManifest({ name: "@me/mind", version: "1.0.0", persona: { include: ["voice"] } });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("persona.visibility is required when include is non-empty");
});

test("validateCardManifest rejects persona exclude/shared and invalid visibility", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    persona: { include: ["voice"], visibility: "secret", exclude: ["x"], shared: ["y"] },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("persona.exclude is not allowed in card manifests");
  expect(result.errors).toContain("persona.shared is not allowed in card manifests");
  expect(result.errors).toContain("persona.visibility must be private, internal, or public");
});

test("validateCardManifest rejects unsafe persona include entries", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    persona: { include: ["../escape"], visibility: "private" },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("persona.include contains invalid entry: ../escape");
});

test("validateCardManifest accepts memory layer declarations without include", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    memory: { l4: { format: "md" }, l5: { format: "jsonl" }, l6: { format: "mixed" } },
  });

  expect(result).toEqual({ ok: true, errors: [] });
});

test("validateCardManifest rejects memory include entries", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    memory: { l5: { include: ["notes"], visibility: "private", format: "jsonl" } },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("memory.l5.include is not allowed; memory entries are DB-native (declare layers and formats only)");
});

test("validateCardManifest rejects invalid memory layers and formats", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    memory: { l3: { format: "md" }, l5: { format: "yaml" } },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("unsupported memory layer: l3");
  expect(result.errors).toContain("memory.l5.format must be md, jsonl, or mixed");
});

test("validateCardManifest rejects format on persona and beliefs", () => {
  const result = validateCardManifest({
    name: "@me/mind",
    version: "1.0.0",
    persona: { include: ["voice"], visibility: "public", format: "md" },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toContain("persona.format is not allowed in card manifests");
});

test("validateCardManifest accepts a full blueprint manifest", () => {
  expect(
    validateCardManifest({
      name: "@me/frontend-eng",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: ["@me/a@^1.0.0", "@me/b@^1.0.0"],
      tools: { allow: ["Bash"], deny: ["WebFetch"] },
      permissions: { canMergePr: false, requiresHumanApprovalFor: ["production_changes"] },
      evals: ["passes_tests"],
      escalation: { humanOwner: "eng_lead", escalateWhen: ["confidence_below_threshold"] },
      contextMounts: { read: ["/eng/frontend"], writeProposals: ["/eng/frontend/wm"] },
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
    escalation: { escalateWhen: "always" },
    identity: "me",
  });
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("composedFrom must be an array of non-empty card refs");
  expect(result.errors).toContain("tools.allow must be an array of strings");
  expect(result.errors).toContain("evals must be an array of strings");
  expect(result.errors).toContain("escalation.escalateWhen must be an array of strings");
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
