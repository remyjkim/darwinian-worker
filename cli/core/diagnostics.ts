// ABOUTME: Computes report-only diagnostics for skill symlinks, MCP drift, and generated file expectations.
// ABOUTME: Shared by `agents doctor` and `agents status` to keep reporting logic centralized and testable.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config";
import { buildActiveServers, mergeClaudeSettingsText, mergeCodexTomlText, renderCursorConfig } from "./mcp";
import { expandHomePath, resolveToolPaths } from "./paths";
import { loadRegistry } from "./registry";
import { findStaleSymlinks, listCuratedSkills, listRepoSkills, listSkillsByScope } from "./skills";
import { lstatSafe } from "./fs";

export interface DoctorReport {
  brokenSymlinks: string[];
  staleSkillSymlinks: string[];
  mcpDrift: string[];
  missingGeneratedFiles: string[];
}

export async function buildStatusReport(repoRoot: string, agentsDir: string, homeDir: string) {
  const [config, registry, curatedSkills, repoSkills] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    listCuratedSkills(agentsDir),
    listRepoSkills(repoRoot),
  ]);
  const activeServers = buildActiveServers(registry, config);

  return {
    repoRoot,
    agentsDir,
    homeDir,
    enabledTargets: Object.entries(config.targets)
      .filter(([, target]) => target.enabled)
      .map(([name]) => name),
    curatedSkillCount: curatedSkills.length,
    repoSkillCount: repoSkills.length,
    activeMcpServerCount: Object.keys(activeServers).length,
  };
}

async function detectBrokenSymlinks(paths: string[]) {
  return paths.filter((pathValue) => lstatSafe(pathValue)?.isSymbolicLink() && !existsSync(pathValue));
}

async function detectStaleSkillSymlinks(repoRoot: string, agentsDir: string, homeDir: string) {
  const toolPaths = resolveToolPaths(homeDir);
  const curated = await listCuratedSkills(agentsDir);
  const scopes = await listSkillsByScope(repoRoot);
  const desiredClaude = new Set([
    ...curated.map((entry) => entry.name),
    ...scopes.claudeOnly.map((skill) => skill.name),
  ]);
  const desiredCodex = new Set([
    ...curated.map((entry) => entry.name),
    ...scopes.codexOnly.map((skill) => skill.name),
  ]);

  return [
    ...(await findStaleSymlinks(toolPaths.claudeSkills, desiredClaude)),
    ...(await findStaleSymlinks(toolPaths.codexSkills, desiredCodex)),
  ];
}

async function detectMcpDrift(repoRoot: string, agentsDir: string, homeDir: string) {
  const [config, registry] = await Promise.all([loadConfig(repoRoot), loadRegistry(repoRoot)]);
  const activeServers = buildActiveServers(registry, config);
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

async function detectMissingGeneratedFiles(repoRoot: string, agentsDir: string) {
  const config = await loadConfig(repoRoot);
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
    mcpDrift: await detectMcpDrift(repoRoot, agentsDir, homeDir),
    missingGeneratedFiles: await detectMissingGeneratedFiles(repoRoot, agentsDir),
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
