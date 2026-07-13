// ABOUTME: Builds Linux bubblewrap argv wrappers for allowed command execution.
// ABOUTME: Fails closed when required bubblewrap support is unavailable.

import { existsSync } from "node:fs";
import type { BridgePolicy } from "../../policy/load";
import type { SandboxProfileOptions } from "./profile";

const bwrapBinary = "bwrap";

export class LinuxSandboxProfile {
  private readonly exists: (path: string) => boolean;

  constructor(options: SandboxProfileOptions = {}) {
    this.exists = options.exists ?? existsSync;
  }

  async assertAvailable(policy: BridgePolicy) {
    if (policy.sandbox.required && !this.exists(bwrapBinary)) {
      throw new Error("bwrap is unavailable");
    }
  }

  async wrap(argv: string[], cwd: string, policy: BridgePolicy) {
    if (!policy.sandbox.required && !this.exists(bwrapBinary)) {
      return argv;
    }
    await this.assertAvailable(policy);
    return [
      bwrapBinary,
      "--die-with-parent",
      "--unshare-all",
      "--share-net",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind",
      "/bin",
      "/bin",
      "--ro-bind",
      "/lib",
      "/lib",
      "--ro-bind",
      "/lib64",
      "/lib64",
      "--bind",
      cwd,
      cwd,
      "--chdir",
      cwd,
      ...argv,
    ];
  }
}
