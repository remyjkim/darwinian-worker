// ABOUTME: Builds macOS sandbox-exec argv wrappers for allowed command execution.
// ABOUTME: Denies required sandbox execution when sandbox-exec is unavailable.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { BridgePolicy } from "../../policy/load";
import type { SandboxProfileOptions } from "./profile";

const sandboxExecPath = "/usr/bin/sandbox-exec";

function schemeString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function sandboxProfile(cwd: string, policy: BridgePolicy) {
  const readableRoots = Array.from(new Set(["/bin", "/usr", "/System", cwd, ...policy.rootsAllow]));
  const homeDir = homedir();
  const readRules = readableRoots.map((root) => `(allow file-read* (subpath ${schemeString(root)}))`).join("\n");
  return [
    "(version 1)",
    "(deny default)",
    "(allow process*)",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "(allow file-read-metadata)",
    "(allow file-read*)",
    '(allow file-read* (literal "/dev/null"))',
    '(allow file-write* (literal "/dev/null"))',
    readRules,
    `(deny file-read* (subpath ${schemeString(`${homeDir}/.ssh`)}))`,
    `(deny file-read* (subpath ${schemeString(`${homeDir}/.aws`)}))`,
    `(deny file-read* (subpath ${schemeString(`${homeDir}/.gnupg`)}))`,
    `(allow file-write* (subpath ${schemeString(cwd)}))`,
    "(allow network*)",
  ].join("\n");
}

export class MacOsSandboxProfile {
  private readonly exists: (path: string) => boolean;

  constructor(options: SandboxProfileOptions = {}) {
    this.exists = options.exists ?? existsSync;
  }

  async assertAvailable(policy: BridgePolicy) {
    if (policy.sandbox.required && !this.exists(sandboxExecPath)) {
      throw new Error(`${sandboxExecPath} is unavailable`);
    }
  }

  async wrap(argv: string[], cwd: string, policy: BridgePolicy) {
    if (!policy.sandbox.required && !this.exists(sandboxExecPath)) {
      return argv;
    }
    await this.assertAvailable(policy);
    return [sandboxExecPath, "-p", sandboxProfile(cwd, policy), ...argv];
  }
}
