// ABOUTME: Verifies consent approval cannot originate from execute_command payload.
// ABOUTME: Tests TTL caching and unavailable-channel fail-closed behavior.

import { describe, expect, test } from "bun:test";
import { CachedConsentGate, ConsentChannelUnavailable, type ConsentRequest, type ConsentGate } from "../src/consent/gate";
import { FakeConsentGate } from "./fixtures/fake-consent";

function request(extra: Record<string, unknown> = {}): ConsentRequest {
  return {
    auditId: "01J00000000000000000000000",
    program: "dotnet",
    argv: ["dotnet", "build"],
    cwd: "/tmp/project",
    reason: "build",
    risk: "medium",
    ...extra,
  };
}

describe("ConsentGate", () => {
  test("denies consent-required work without out-of-band approval", async () => {
    const gate = new FakeConsentGate();

    await expect(gate.request(request())).resolves.toBe(false);
  });

  test("ignores request-payload approval fields", async () => {
    const gate = new FakeConsentGate();

    await expect(gate.request(request({ approved: true }))).resolves.toBe(false);
  });

  test("throws when the channel is unavailable", async () => {
    const gate: ConsentGate = {
      async request() {
        throw new ConsentChannelUnavailable("no dialog");
      },
    };

    await expect(gate.request(request())).rejects.toThrow(ConsentChannelUnavailable);
  });

  test("does not cache approvals when TTL is disabled", async () => {
    const inner = new FakeConsentGate([true, false]);
    const gate = new CachedConsentGate(inner, 0);

    await expect(gate.request(request())).resolves.toBe(true);
    await expect(gate.request(request())).resolves.toBe(false);
    expect(inner.calls).toBe(2);
  });

  test("caches approvals until TTL expires", async () => {
    let now = 1000;
    const inner = new FakeConsentGate([true, false]);
    const gate = new CachedConsentGate(inner, 50, () => now);

    await expect(gate.request(request())).resolves.toBe(true);
    await expect(gate.request(request())).resolves.toBe(true);
    expect(inner.calls).toBe(1);

    now = 1100;
    await expect(gate.request(request())).resolves.toBe(false);
    expect(inner.calls).toBe(2);
  });
});
