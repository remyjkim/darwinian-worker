// ABOUTME: Runs the OAuth 2.0 device authorization polling loop for drwn login.
// ABOUTME: Verified against better-auth@1.6.9: dispatch on response body error, not status.

import type { AnalyzerClient } from "../http/analyzer-client";
import type { DeviceTokenResponse } from "../http/schemas";

export interface RunDeviceFlowInput {
  client: Pick<AnalyzerClient, "requestDeviceCode" | "pollDeviceToken">;
  clientId: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onUserAction: (info: { verification_uri_complete: string; user_code: string }) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDeviceFlow(input: RunDeviceFlowInput): Promise<DeviceTokenResponse> {
  const sleep = input.sleep ?? defaultSleep;
  const now = input.now ?? Date.now;
  const code = await input.client.requestDeviceCode(input.clientId);

  input.onUserAction({
    verification_uri_complete: code.verification_uri_complete,
    user_code: code.user_code,
  });

  const expiresAt = now() + code.expires_in * 1000;
  let interval = code.interval;

  while (true) {
    await sleep(interval * 1000);
    if (now() > expiresAt) {
      throw new Error(`Sign-in timed out after ${code.expires_in}s. Try again.`);
    }

    const result = await input.client.pollDeviceToken(code.device_code, input.clientId);
    if (result.kind === "success") return result.token;

    switch (result.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        interval *= 2;
        continue;
      case "expired_token":
        throw new Error("Code expired. Run `drwn login` again.");
      case "access_denied":
        throw new Error("Authorization denied in browser.");
      default:
        throw new Error(`Authentication failed: ${result.error}`);
    }
  }
}
