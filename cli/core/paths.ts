// ABOUTME: Provides shared path resolution helpers for the bgng harness CLI and sync wrapper.
// ABOUTME: Normalizes repo, home, tool, and skill-scope paths without command-layer dependencies.

import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { NormalizedSyncOptions, SyncOptions, TargetName } from "./types";

export type ToolScope =
  | { kind: "project"; projectRoot: string }
  | { kind: "machine"; homeDir: string };

export function inferRepoRootFromModulePath(modulePath: string) {
  return dirname(realpathSync(modulePath));
}

export function resolveAgentsDir(homeDir: string) {
  return join(homeDir, ".agents");
}

export function resolveUserBgngDir(agentsDir: string) {
  return join(agentsDir, "bgng");
}

export function resolveUserConfigPath(agentsDir: string) {
  return join(resolveUserBgngDir(agentsDir), "config.json");
}

export function resolveLibraryDir(agentsDir: string) {
  return join(agentsDir, "library");
}

export function resolveMcpLibraryPath(agentsDir: string) {
  return join(resolveLibraryDir(agentsDir), "mcp-servers.json");
}

export function resolvePackagedRegistryDir(repoRoot: string) {
  return join(repoRoot, "registry");
}

export function resolvePackagedConfigPath(repoRoot: string) {
  return join(resolvePackagedRegistryDir(repoRoot), "config.json");
}

export function resolvePackagedMcpRegistryPath(repoRoot: string) {
  return join(resolvePackagedRegistryDir(repoRoot), "mcp-servers.json");
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

export function resolveToolPaths(scope: string | ToolScope) {
  const root = typeof scope === "string"
    ? scope
    : scope.kind === "project"
      ? scope.projectRoot
      : scope.homeDir;
  return {
    claudeSkills: join(root, ".claude", "skills"),
    codexSkills: join(root, ".codex", "skills"),
    claudeSettings: join(root, ".claude", "settings.json"),
    codexConfig: join(root, ".codex", "config.toml"),
    cursorMcp: join(root, ".cursor", "mcp.json"),
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
    force: options.force ?? false,
  };
}
