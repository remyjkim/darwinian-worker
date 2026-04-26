// ABOUTME: Computes report-only diagnostics for skill symlinks, MCP drift, and generated file expectations.
// ABOUTME: Shared by `agents doctor` and `agents status` to keep reporting logic centralized and testable.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config";
import { buildActiveServers, mergeClaudeSettingsText, mergeCodexTomlText, renderCursorConfig } from "./mcp";
import { expandHomePath, resolveToolPaths } from "./paths";
import { loadRegistry } from "./registry";
import { findRepoSkill, findStaleSymlinks, listCuratedSkills, listRepoSkills, listSkillsByScope } from "./skills";
import { lstatSafe } from "./fs";
import { loadProjectConfig, mergeProjectConfig, summarizeProjectConfig, isServerToggle } from "./project";
import type { CanonicalConfig, RegistryServer } from "./types";

export interface DoctorReport {
  brokenSymlinks: string[];
  staleSkillSymlinks: string[];
  mcpDrift: string[];
  missingGeneratedFiles: string[];
  projectConfigIssues: string[];
}

export async function buildStatusReport(repoRoot: string, agentsDir: string, homeDir: string, projectConfigPath?: string | null) {
  const [config, registry, curatedSkills, repoSkills] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    listCuratedSkills(agentsDir),
    listRepoSkills(repoRoot),
  ]);
  let effectiveConfig = config;
  let effectiveRegistry = registry;
  let projectSummary: ReturnType<typeof summarizeProjectConfig> | undefined;

  if (projectConfigPath) {
    const projectConfig = await loadProjectConfig(projectConfigPath);
    const merged = mergeProjectConfig(config, registry, projectConfig);
    effectiveConfig = merged.config;
    effectiveRegistry = merged.registry;
    projectSummary = summarizeProjectConfig(projectConfig);
  }

  const activeServers = buildActiveServers(effectiveRegistry, effectiveConfig);

  return {
    repoRoot,
    agentsDir,
    homeDir,
    enabledTargets: Object.entries(effectiveConfig.targets)
      .filter(([, target]) => target.enabled)
      .map(([name]) => name),
    curatedSkillCount: curatedSkills.length,
    repoSkillCount: repoSkills.length,
    activeMcpServerCount: Object.keys(activeServers).length,
    project: projectSummary && projectConfigPath
      ? {
          configPath: projectConfigPath,
          ...projectSummary,
        }
      : undefined,
  };
}

async function detectBrokenSymlinks(paths: string[]) {
  return paths.filter((pathValue) => lstatSafe(pathValue)?.isSymbolicLink() && !existsSync(pathValue));
}

async function detectStaleSkillSymlinks(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  skillOverrides?: { include?: string[]; exclude?: string[] },
) {
  const toolPaths = resolveToolPaths(homeDir);
  const curated = await listCuratedSkills(agentsDir);
  const scopes = await listSkillsByScope(repoRoot);
  const excluded = new Set(skillOverrides?.exclude ?? []);
  const includedSkills = await Promise.all(
    (skillOverrides?.include ?? [])
      .filter((name) => !excluded.has(name))
      .map(async (name) => await findRepoSkill(repoRoot, name)),
  );
  const desiredClaude = new Set([
    ...curated.map((entry) => entry.name).filter((name) => !excluded.has(name)),
    ...scopes.claudeOnly.map((skill) => skill.name).filter((name) => !excluded.has(name)),
    ...includedSkills.filter((skill) => skill && (skill.scope === "shared" || skill.scope === "claude-only")).map((skill) => skill!.name),
  ]);
  const desiredCodex = new Set([
    ...curated.map((entry) => entry.name).filter((name) => !excluded.has(name)),
    ...scopes.codexOnly.map((skill) => skill.name).filter((name) => !excluded.has(name)),
    ...includedSkills.filter((skill) => skill && (skill.scope === "shared" || skill.scope === "codex-only")).map((skill) => skill!.name),
  ]);

  return [
    ...(await findStaleSymlinks(toolPaths.claudeSkills, desiredClaude)),
    ...(await findStaleSymlinks(toolPaths.codexSkills, desiredCodex)),
  ];
}

async function detectMcpDrift(
  config: CanonicalConfig,
  activeServers: Record<string, RegistryServer>,
  agentsDir: string,
  homeDir: string,
) {
  const drifts: string[] = [];

  for (const [targetName, target] of Object.entries(config.targets)) {
    if (!target.enabled) {
      continue;
    }

    const configPath = expandHomePath(target.configPath, homeDir);

    if (targetName === "claude" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = mergeClaudeSettingsText(current, activeServers);
      if (current !== expected) {
        drifts.push(`claude:${configPath}`);
      }
    }

    if (targetName === "codex" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = mergeCodexTomlText(current, activeServers);
      if (current !== expected) {
        drifts.push(`codex:${configPath}`);
      }
    }

    if (targetName === "cursor") {
      const generatedPath = join(agentsDir, "generated", "cursor-mcp.json");
      if (existsSync(generatedPath)) {
        const current = readFileSync(generatedPath, "utf8");
        const expected = renderCursorConfig(activeServers);
        if (current !== expected) {
          drifts.push(`cursor:${generatedPath}`);
        }
      }
    }
  }

  return drifts;
}

async function detectMissingGeneratedFiles(config: CanonicalConfig, agentsDir: string) {
  const missing: string[] = [];

  if (config.targets.cursor?.enabled) {
    const generatedPath = join(agentsDir, "generated", "cursor-mcp.json");
    if (!existsSync(generatedPath)) {
      missing.push(generatedPath);
    }
  }

  return missing;
}

export async function buildDoctorReport(repoRoot: string, agentsDir: string, homeDir: string): Promise<DoctorReport> {
  const toolPaths = resolveToolPaths(homeDir);
  const [config, registry] = await Promise.all([loadConfig(repoRoot), loadRegistry(repoRoot)]);
  const activeServers = buildActiveServers(registry, config);

  return {
    brokenSymlinks: await detectBrokenSymlinks([
      ...((existsSync(toolPaths.claudeSkills) ? Object.keys(readDirLinks(toolPaths.claudeSkills)) : []) as string[]).map((name) =>
        join(toolPaths.claudeSkills, name),
      ),
      ...((existsSync(toolPaths.codexSkills) ? Object.keys(readDirLinks(toolPaths.codexSkills)) : []) as string[]).map((name) =>
        join(toolPaths.codexSkills, name),
      ),
    ]),
    staleSkillSymlinks: await detectStaleSkillSymlinks(repoRoot, agentsDir, homeDir),
    mcpDrift: await detectMcpDrift(config, activeServers, agentsDir, homeDir),
    missingGeneratedFiles: await detectMissingGeneratedFiles(config, agentsDir),
    projectConfigIssues: [],
  };
}

export async function buildDoctorReportWithProject(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
): Promise<DoctorReport> {
  const report = await buildDoctorReport(repoRoot, agentsDir, homeDir);
  if (!projectConfigPath) {
    return report;
  }

  const [config, registry, repoSkills] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    listRepoSkills(repoRoot),
  ]);
  const project = await loadProjectConfig(projectConfigPath);
  const merged = mergeProjectConfig(config, registry, project);
  const activeServers = buildActiveServers(registry, config);
  const repoSkillNames = new Set(repoSkills.map((skill) => skill.name));
  const issues: string[] = [];

  for (const [name, override] of Object.entries(project.servers ?? {})) {
    if (isServerToggle(override)) {
      if (!registry.servers[name]) {
        issues.push(`Unknown server reference: "${name}"`);
        continue;
      }
      const centrallyActive = Boolean(activeServers[name]);
      if (centrallyActive === override.enabled) {
        issues.push(`Stale override: server "${name}" is already ${centrallyActive ? "enabled" : "disabled"} centrally`);
      }
    }
  }

  for (const name of [...(project.skills?.include ?? []), ...(project.skills?.exclude ?? [])]) {
    if (!repoSkillNames.has(name)) {
      issues.push(`Unknown skill reference: "${name}"`);
    }
  }

  for (const [name, override] of Object.entries(project.targets ?? {})) {
    if (config.targets[name as keyof typeof config.targets]?.enabled === override.enabled) {
      issues.push(`Stale override: target "${name}" is already ${override.enabled ? "enabled" : "disabled"} centrally`);
    }
  }

  return {
    ...report,
    staleSkillSymlinks: await detectStaleSkillSymlinks(repoRoot, agentsDir, homeDir, merged.skills),
    mcpDrift: await detectMcpDrift(merged.config, buildActiveServers(merged.registry, merged.config), agentsDir, homeDir),
    missingGeneratedFiles: await detectMissingGeneratedFiles(merged.config, agentsDir),
    projectConfigIssues: issues,
  };
}

function readDirLinks(dirPath: string) {
  const entries: Record<string, true> = {};
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      entries[entry.name] = true;
    }
  }
  return entries;
}
