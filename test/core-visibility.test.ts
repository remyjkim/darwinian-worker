// ABOUTME: Verifies mind-content visibility classification and push-gate decisions.
// ABOUTME: Keeps privacy checks independent from Git push command handling.

import { expect, test } from "bun:test";
import { classifyRemoteUrl, evaluatePushGate, strictest, type Visibility } from "../cli/core/visibility";

test("strictest returns the most restrictive visibility", () => {
  expect(strictest(["public", "internal"])).toBe("internal");
  expect(strictest(["public", "private", "internal"])).toBe("private");
  expect(strictest([])).toBeNull();
});

test("classifyRemoteUrl treats local remotes as private and network remotes as unknown", () => {
  expect(classifyRemoteUrl("file:///tmp/card.git")).toBe("private");
  expect(classifyRemoteUrl("/tmp/card.git")).toBe("private");
  expect(classifyRemoteUrl("../card.git")).toBe("private");
  expect(classifyRemoteUrl("git@github.com:org/repo.git")).toBe("unknown");
  expect(classifyRemoteUrl("https://github.com/org/repo.git")).toBe("unknown");
});

test("evaluatePushGate blocks less restrictive remotes unless explicitly unsafe", () => {
  const blocked = evaluatePushGate({ cardVisibility: "private", remoteVisibility: "public", unsafePushPublic: false });
  const overridden = evaluatePushGate({ cardVisibility: "private", remoteVisibility: "public", unsafePushPublic: true });
  const safe = evaluatePushGate({ cardVisibility: "internal", remoteVisibility: "private", unsafePushPublic: false });

  expect(blocked.ok).toBe(false);
  expect(blocked.reason).toContain("less restrictive");
  expect(overridden.ok).toBe(true);
  expect(overridden.warning).toContain("unsafe");
  expect(safe.ok).toBe(true);
});

test("evaluatePushGate handles tools-only cards with no visibility-bearing content", () => {
  expect(evaluatePushGate({ cardVisibility: null, remoteVisibility: "unknown", unsafePushPublic: false })).toEqual({ ok: true });
});

test("visibility ordering is exhaustive", () => {
  const all: Visibility[] = ["private", "internal", "public"];
  expect(all.map((visibility) => evaluatePushGate({ cardVisibility: visibility, remoteVisibility: visibility, unsafePushPublic: false }).ok))
    .toEqual([true, true, true]);
});

test("evaluatePushGate blocks unknown network remotes for any visibility-bearing card", () => {
  for (const visibility of ["private", "internal", "public"] as const) {
    const result = evaluatePushGate({ cardVisibility: visibility, remoteVisibility: "unknown", unsafePushPublic: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("unknown");
  }
});

test("evaluatePushGate allows an explicit classification at least as restrictive as the card", () => {
  // Explicitly classifying an otherwise-unknown remote as equal-or-more-restrictive lets the push through.
  expect(evaluatePushGate({ cardVisibility: "internal", remoteVisibility: "private", unsafePushPublic: false }).ok).toBe(true);
  expect(evaluatePushGate({ cardVisibility: "internal", remoteVisibility: "internal", unsafePushPublic: false }).ok).toBe(true);
  // A looser explicit classification is still refused.
  const looser = evaluatePushGate({ cardVisibility: "private", remoteVisibility: "internal", unsafePushPublic: false });
  expect(looser.ok).toBe(false);
  expect(looser.reason).toContain("less restrictive");
});
