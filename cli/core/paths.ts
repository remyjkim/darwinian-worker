// ABOUTME: Provides shared path resolution helpers for the agents CLI and sync wrapper.
// ABOUTME: Normalizes repo, home, tool, and skill-scope paths without command-layer dependencies.

import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { NormalizedSyncOptions, SyncOptions, TargetName } from "./types";

export function inferRepoRootFromModulePath(modulePath: string) {
  return dirname(realpathSync(modulePath));
}

export function resolveAgentsDir(homeDir: string) {
  return join(homeDir, ".agents");
}

export function expandHomePath(pathValue: string, homeDir: string) {
  if (pathValue === "~") {
    return homeDir;
  }
  if (pathValue.startsWith("~/")) {
    return join(homeDir, pathValue.slice(2));
  }
  return pathValue;
}

export function resolveToolPaths(homeDir: string) {
  return {
    claudeSkills: join(homeDir, ".claude", "skills"),
    codexSkills: join(homeDir, ".codex", "skills"),
    claudeSettings: join(homeDir, ".claude", "settings.json"),
    codexConfig: join(homeDir, ".codex", "config.toml"),
    cursorMcp: join(homeDir, ".cursor", "mcp.json"),
  };
}

export function resolveSkillScopeDirs(repoRoot: string) {
  return {
    shared: join(repoRoot, "skills", "shared"),
    claudeOnly: join(repoRoot, "skills", "claude-only"),
    codexOnly: join(repoRoot, "skills", "codex-only"),
    experimental: join(repoRoot, "skills", "experimental"),
  };
}

export function resolveSkillPackagesRoot(agentsDir: string) {
  return join(agentsDir, "packages", "skills");
}

export function resolveSkillPackageRoot(agentsDir: string, packageName: string) {
  return join(resolveSkillPackagesRoot(agentsDir), packageName);
}

export function resolveSkillPackageVersionRoot(agentsDir: string, packageName: string, version: string) {
  return join(resolveSkillPackageRoot(agentsDir, packageName), version);
}

export function resolveSkillPackageCurrentLink(agentsDir: string, packageName: string) {
  return join(resolveSkillPackageRoot(agentsDir, packageName), "current");
}

export function normalizeSyncPathOptions(
  options: SyncOptions = {},
  modulePath?: string,
): NormalizedSyncOptions {
  const homeDir = options.homeDir ?? homedir();

  return {
    repoRoot: options.repoRoot ?? inferRepoRootFromModulePath(modulePath ?? import.meta.path),
    agentsDir: options.agentsDir ?? resolveAgentsDir(homeDir),
    homeDir,
    cwd: options.cwd ?? process.cwd(),
    dryRun: options.dryRun ?? false,
    mcpOnly: options.mcpOnly ?? false,
    skillsOnly: options.skillsOnly ?? false,
    target: options.target,
  };
}
