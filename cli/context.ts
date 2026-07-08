// ABOUTME: Defines the shared context type threaded through all Clipanion commands.
// ABOUTME: Carries resolved paths and config so commands don't repeat resolution logic.

import type { BaseContext } from "clipanion";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveHomeDir } from "./core/home";
import { resolveAgentsDir, resolvePackagedConfigPath } from "./core/paths";
import { findProjectConfig } from "./core/project";

export interface AgentsContext extends BaseContext {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  cwd: string;
  projectConfigPath: string | null;
}

export function createAgentsContext(): Omit<AgentsContext, keyof BaseContext> {
  const homeDir = resolveHomeDir();
  const packagedRepoRoot = fileURLToPath(new URL("..", import.meta.url));
  const cwdRepoRoot = process.cwd();
  const cwd = process.cwd();
  return {
    repoRoot:
      process.env.AGENTS_REPO_ROOT ??
      (existsSync(resolvePackagedConfigPath(cwdRepoRoot)) ? cwdRepoRoot : packagedRepoRoot),
    agentsDir: process.env.AGENTS_DIR ?? resolveAgentsDir(homeDir),
    homeDir,
    cwd,
    projectConfigPath: findProjectConfig(cwd),
  };
}

export function validateRepoRoot(repoRoot: string) {
  if (!existsSync(resolvePackagedConfigPath(repoRoot))) {
    throw new Error(`No registry/config.json found at ${repoRoot}. Run drwn from a darwinian checkout or set AGENTS_REPO_ROOT.`);
  }
}
