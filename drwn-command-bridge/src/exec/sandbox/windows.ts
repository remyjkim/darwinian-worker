// ABOUTME: Represents Windows sandbox support as unsupported until a native helper exists.
// ABOUTME: Ensures required policies deny instead of running unsandboxed on Windows.

import type { BridgePolicy } from "../../policy/load";

export class WindowsSandboxProfile {
  async assertAvailable(policy: BridgePolicy) {
    if (policy.sandbox.required) {
      throw new Error("Windows sandbox profile is unsupported");
    }
  }

  async wrap(argv: string[], _cwd: string, policy: BridgePolicy) {
    await this.assertAvailable(policy);
    return argv;
  }
}
