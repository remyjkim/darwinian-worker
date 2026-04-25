// ABOUTME: Defines the shared context type threaded through all Clipanion commands.
// ABOUTME: Carries resolved paths and config so commands don't repeat resolution logic.

import type { BaseContext } from "clipanion";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentsDir } from "./core/paths";

export interface AgentsContext extends BaseContext {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
}

export function createAgentsContext(): Omit<AgentsContext, keyof BaseContext> {
  const homeDir = process.env.AGENTS_HOME_DIR ?? process.env.HOME ?? "";
  return {
    repoRoot: process.env.AGENTS_REPO_ROOT ?? process.cwd(),
    agentsDir: process.env.AGENTS_DIR ?? resolveAgentsDir(homeDir),
    homeDir,
  };
}

export function validateRepoRoot(repoRoot: string) {
  if (!existsSync(join(repoRoot, "config.json"))) {
    throw new Error(`No config.json found at ${repoRoot}. Run bgng from the repo root or set AGENTS_REPO_ROOT.`);
  }
}
