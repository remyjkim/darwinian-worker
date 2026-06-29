// ABOUTME: Resolves the user home directory uniformly across macOS, Linux, and Windows.
// ABOUTME: Prefers AGENTS_HOME_DIR, then HOME/USERPROFILE, then os.homedir(); never returns "".

import { homedir } from "node:os";

export function resolveHomeDir(env: Record<string, string | undefined> = process.env): string {
  return env.AGENTS_HOME_DIR || env.HOME || env.USERPROFILE || homedir();
}
