// ABOUTME: Selects platform sandbox adapters for command execution.
// ABOUTME: Keeps sandbox availability checks injectable for deterministic tests.

import type { BridgePolicy } from "../../policy/load";
import { MacOsSandboxProfile } from "./macos";
import { LinuxSandboxProfile } from "./linux";
import { WindowsSandboxProfile } from "./windows";

export interface SandboxProfile {
  assertAvailable(policy: BridgePolicy): Promise<void>;
  wrap(argv: string[], cwd: string, policy: BridgePolicy): Promise<string[]>;
}

export interface SandboxProfileOptions {
  exists?: (path: string) => boolean;
}

export function createSandboxProfile(platform: NodeJS.Platform, options: SandboxProfileOptions = {}): SandboxProfile {
  if (platform === "darwin") {
    return new MacOsSandboxProfile(options);
  }
  if (platform === "win32") {
    return new WindowsSandboxProfile();
  }
  return new LinuxSandboxProfile(options);
}
