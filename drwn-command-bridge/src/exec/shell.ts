// ABOUTME: Resolves explicit shell execution to pinned host shell paths.
// ABOUTME: Avoids ambient PATH lookup and Windows WSL/System32 bash confusion.

import { existsSync } from "node:fs";

export interface ShellResolutionOptions {
  shell: boolean;
  exists?: (path: string) => boolean;
  env?: Record<string, string | undefined>;
}

function windowsGitBashCandidates(env: Record<string, string | undefined>) {
  return [
    env.ProgramFiles ? `${env.ProgramFiles}\\Git\\bin\\bash.exe` : undefined,
    env["ProgramFiles(x86)"] ? `${env["ProgramFiles(x86)"]}\\Git\\bin\\bash.exe` : undefined,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ].filter((entry): entry is string => Boolean(entry));
}

export function resolveShellForPlatform(platform: NodeJS.Platform, options: ShellResolutionOptions) {
  if (!options.shell) {
    return null;
  }

  const exists = options.exists ?? existsSync;
  if (platform === "win32") {
    const found = windowsGitBashCandidates(options.env ?? process.env).find((candidate) => exists(candidate));
    if (found) {
      return found;
    }
    throw new Error("Git Bash shell not found; refusing to use Windows System32 or WSL bash");
  }

  const candidates = platform === "darwin" ? ["/bin/bash", "/usr/bin/bash"] : ["/usr/bin/bash", "/bin/bash"];
  const found = candidates.find((candidate) => exists(candidate));
  if (!found) {
    throw new Error("absolute bash shell not found");
  }
  return found;
}
