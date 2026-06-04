// ABOUTME: Verifies OAuth device polling behavior against the Better Auth contract.
// ABOUTME: Keeps timing and error-code handling deterministic through dependency injection.

import { describe, expect, test } from "bun:test";
import { runDeviceFlow } from "../cli/core/auth/device-flow";
import type { AnalyzerClient, DeviceTokenPollResult } from "../cli/core/http/analyzer-client";

function makeClient(results: DeviceTokenPollResult[]): Pick<AnalyzerClient, "requestDeviceCode" | "pollDeviceToken"> {
  return {
    async requestDeviceCode() {
      return {
        device_code: "dev",
        user_code: "ABCD",
        verification_uri_complete: "https://app.test/device?user_code=ABCD",
        expires_in: 600,
        interval: 5,
      };
    },
    async pollDeviceToken() {
      const next = results.shift();
      if (!next) throw new Error("unexpected poll");
      return next;
    },
  };
}

const success: DeviceTokenPollResult = {
  kind: "success",
  token: { access_token: "tok", token_type: "Bearer", expires_in: 604800 },
};

describe("runDeviceFlow", () => {
  test("returns a token after one poll and calls onUserAction", async () => {
    const actions: unknown[] = [];
    const slept: number[] = [];

    const token = await runDeviceFlow({
      client: makeClient([success]),
      clientId: "drwn-cli",
      sleep: async (ms) => { slept.push(ms); },
      onUserAction: (info) => { actions.push(info); },
    });

    expect(token.access_token).toBe("tok");
    expect(slept).toEqual([5000]);
    expect(actions).toHaveLength(1);
  });

  test("continues on authorization_pending", async () => {
    const slept: number[] = [];
    const token = await runDeviceFlow({
      client: makeClient([{ kind: "error", error: "authorization_pending" }, success]),
      clientId: "drwn-cli",
      sleep: async (ms) => { slept.push(ms); },
      onUserAction: () => {},
    });

    expect(token.access_token).toBe("tok");
    expect(slept).toEqual([5000, 5000]);
  });

  test("slow_down doubles interval", async () => {
    const slept: number[] = [];
    await runDeviceFlow({
      client: makeClient([{ kind: "error", error: "slow_down" }, success]),
      clientId: "drwn-cli",
      sleep: async (ms) => { slept.push(ms); },
      onUserAction: () => {},
    });

    expect(slept).toEqual([5000, 10000]);
  });

  test("hard auth errors throw user-facing messages", async () => {
    await expect(runDeviceFlow({
      client: makeClient([{ kind: "error", error: "expired_token" }]),
      clientId: "drwn-cli",
      sleep: async () => {},
      onUserAction: () => {},
    })).rejects.toThrow("Code expired. Run `drwn login` again.");

    await expect(runDeviceFlow({
      client: makeClient([{ kind: "error", error: "access_denied" }]),
      clientId: "drwn-cli",
      sleep: async () => {},
      onUserAction: () => {},
    })).rejects.toThrow("Authorization denied in browser.");

    await expect(runDeviceFlow({
      client: makeClient([{ kind: "error", error: "weird" }]),
      clientId: "drwn-cli",
      sleep: async () => {},
      onUserAction: () => {},
    })).rejects.toThrow("Authentication failed: weird");
  });

  test("local expiry throws timeout message", async () => {
    let now = 0;
    await expect(runDeviceFlow({
      client: makeClient([{ kind: "error", error: "authorization_pending" }]),
      clientId: "drwn-cli",
      sleep: async () => { now = 601_000; },
      now: () => now,
      onUserAction: () => {},
    })).rejects.toThrow("Sign-in timed out after 600s. Try again.");
  });
});
