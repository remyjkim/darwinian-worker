// ABOUTME: Manages repo skill discovery, curation, and downstream skill sync state computation.
// ABOUTME: Encapsulates the curated publication layer so commands don't manipulate symlinks ad hoc.

import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveSkillScopeDirs, resolveToolPaths } from "./paths";
import { ensureParentDir, lstatSafe, realpathSafe } from "./fs";
import type { NormalizedSyncOptions, SyncResult, TargetName } from "./types";

export type SkillScope = "shared" | "claude-only" | "codex-only" | "experimental";

export interface RepoSkill {
  name: string;
  scope: SkillScope;
  path: string;
}

export interface RepoSkillScopes {
  shared: RepoSkill[];
  claudeOnly: RepoSkill[];
  codexOnly: RepoSkill[];
  experimental: RepoSkill[];
}

export interface SkillInventoryItem extends RepoSkill {
  curated: boolean;
  claudeLinked: boolean;
  codexLinked: boolean;
}

function validateSkillName(name: string) {
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Invalid skill name: ${name}`);
  }
}

function ensureDirSymlink(linkPath: string, targetPath: string, dryRun: boolean, result: SyncResult) {
  const stats = lstatSafe(linkPath);
  if (stats) {
    if (stats.isSymbolicLink() && realpathSafe(linkPath) === realpathSafe(targetPath)) {
      return;
    }
    result.changes.push(`replace ${linkPath}`);
    if (!dryRun) {
      rmSync(linkPath, { recursive: true, force: true });
    }
  }

  ensureParentDir(linkPath, dryRun);
  result.changes.push(`symlink ${linkPath} -> ${targetPath}`);
  if (!dryRun) {
    symlinkSync(targetPath, linkPath, "dir");
  }
}

async function listScopeSkills(scopeDir: string, scope: SkillScope): Promise<RepoSkill[]> {
  if (!existsSync(scopeDir)) {
    return [];
  }

  const entries = await readdir(scopeDir, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => ({
      name: entry.name,
      scope,
      path: join(scopeDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSkillsByScope(repoRoot: string): Promise<RepoSkillScopes> {
  const scopeDirs = resolveSkillScopeDirs(repoRoot);

  return {
    shared: await listScopeSkills(scopeDirs.shared, "shared"),
    claudeOnly: await listScopeSkills(scopeDirs.claudeOnly, "claude-only"),
    codexOnly: await listScopeSkills(scopeDirs.codexOnly, "codex-only"),
    experimental: await listScopeSkills(scopeDirs.experimental, "experimental"),
  };
}

export async function listRepoSkills(repoRoot: string): Promise<RepoSkill[]> {
  const grouped = await listSkillsByScope(repoRoot);
  return [...grouped.shared, ...grouped.claudeOnly, ...grouped.codexOnly, ...grouped.experimental];
}

export async function findRepoSkill(repoRoot: string, name: string): Promise<RepoSkill | null> {
  const skills = await listRepoSkills(repoRoot);
  return skills.find((skill) => skill.name === name) ?? null;
}

export async function listCuratedSkills(agentsDir: string) {
  const curatedDir = join(agentsDir, "skills");
  if (!existsSync(curatedDir)) {
    return [];
  }

  const entries = await readdir(curatedDir, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => ({
      name: entry.name,
      path: join(curatedDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isLinkedToTarget(linkPath: string, targetPath: string) {
  const stats = lstatSafe(linkPath);
  return stats?.isSymbolicLink() === true && realpathSafe(linkPath) === realpathSafe(targetPath);
}

export async function buildSkillInventory(repoRoot: string, agentsDir: string, homeDir: string): Promise<SkillInventoryItem[]> {
  const skills = await listRepoSkills(repoRoot);
  const curated = await listCuratedSkills(agentsDir);
  const curatedNames = new Set(curated.map((entry) => entry.name));
  const toolPaths = resolveToolPaths(homeDir);

  return skills.map((skill) => {
    const curatedPath = join(agentsDir, "skills", skill.name);
    const expectedClaudeTarget = skill.scope === "shared" ? curatedPath : skill.scope === "claude-only" ? skill.path : "";
    const expectedCodexTarget = skill.scope === "shared" ? curatedPath : skill.scope === "codex-only" ? skill.path : "";

    return {
      ...skill,
      curated: curatedNames.has(skill.name),
      claudeLinked:
        skill.scope === "shared" || skill.scope === "claude-only"
          ? isLinkedToTarget(join(toolPaths.claudeSkills, skill.name), expectedClaudeTarget)
          : false,
      codexLinked:
        skill.scope === "shared" || skill.scope === "codex-only"
          ? isLinkedToTarget(join(toolPaths.codexSkills, skill.name), expectedCodexTarget)
          : false,
    };
  });
}

export async function curateSkill(
  options: { repoRoot: string; agentsDir: string },
  name: string,
) {
  validateSkillName(name);
  const skill = await findRepoSkill(options.repoRoot, name);
  if (!skill) {
    throw new Error(`Unknown skill: ${name}`);
  }
  if (skill.scope !== "shared") {
    throw new Error(`Only shared skills can be curated into ~/.agents/skills: ${name}`);
  }

  const curatedPath = join(options.agentsDir, "skills", name);
  mkdirSync(join(options.agentsDir, "skills"), { recursive: true });
  rmSync(curatedPath, { recursive: true, force: true });
  symlinkSync(skill.path, curatedPath, "dir");

  return curatedPath;
}

export async function uncurateSkill(
  options: { agentsDir: string },
  name: string,
) {
  validateSkillName(name);
  const curatedPath = join(options.agentsDir, "skills", name);
  if (!existsSync(curatedPath)) {
    throw new Error(`Skill is not curated: ${name}`);
  }
  rmSync(curatedPath, { recursive: true, force: true });
}

export async function findStaleSymlinks(dirPath: string, desiredNames: Set<string>) {
  if (!existsSync(dirPath)) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => entry.isSymbolicLink())
    .filter((entry) => !desiredNames.has(entry.name))
    .map((entry) => join(dirPath, entry.name));
}

export async function syncSkills(options: NormalizedSyncOptions): Promise<SyncResult> {
  const result: SyncResult = { changes: [], warnings: [] };
  const toolPaths = resolveToolPaths(options.homeDir);
  const scopeDirs = resolveSkillScopeDirs(options.repoRoot);
  const curatedDir = join(options.agentsDir, "skills");

  const desiredClaude = new Set<string>();
  const desiredCodex = new Set<string>();

  if (existsSync(curatedDir)) {
    const curatedEntries = await readdir(curatedDir, { withFileTypes: true });
    for (const entry of curatedEntries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const sourcePath = join(curatedDir, entry.name);
      if (!options.target || options.target === "claude") {
        desiredClaude.add(entry.name);
        ensureDirSymlink(join(toolPaths.claudeSkills, entry.name), sourcePath, options.dryRun, result);
      }
      if (!options.target || options.target === "codex") {
        desiredCodex.add(entry.name);
        ensureDirSymlink(join(toolPaths.codexSkills, entry.name), sourcePath, options.dryRun, result);
      }
    }
  }

  if ((!options.target || options.target === "claude") && existsSync(scopeDirs.claudeOnly)) {
    const entries = await readdir(scopeDirs.claudeOnly, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      desiredClaude.add(entry.name);
      ensureDirSymlink(join(toolPaths.claudeSkills, entry.name), join(scopeDirs.claudeOnly, entry.name), options.dryRun, result);
    }
  }

  if ((!options.target || options.target === "codex") && existsSync(scopeDirs.codexOnly)) {
    const entries = await readdir(scopeDirs.codexOnly, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      desiredCodex.add(entry.name);
      ensureDirSymlink(join(toolPaths.codexSkills, entry.name), join(scopeDirs.codexOnly, entry.name), options.dryRun, result);
    }
  }

  const staleClaude = !options.target || options.target === "claude"
    ? await findStaleSymlinks(toolPaths.claudeSkills, desiredClaude)
    : [];
  const staleCodex = !options.target || options.target === "codex"
    ? await findStaleSymlinks(toolPaths.codexSkills, desiredCodex)
    : [];

  for (const pathValue of [...staleClaude, ...staleCodex]) {
    result.warnings.push(`stale skill symlink: ${pathValue}`);
  }

  return result;
}
