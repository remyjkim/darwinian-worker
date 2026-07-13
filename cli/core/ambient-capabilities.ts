// ABOUTME: Observes user-home skill and MCP surfaces without adding them to project declarations.
// ABOUTME: Returns redacted provenance for status and doctor; enforcement belongs to target adapters.

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { parse as parseToml } from "smol-toml";
import { expandHomePath, resolveToolPaths } from "./paths";
import type { CanonicalConfig, TargetName } from "./types";

export interface AmbientCapabilityObservation {
  id: string;
  kind: "skill" | "mcp";
  target: TargetName;
  sourceKind: "user-home";
  sourceId: string;
  sourcePath: string;
  sameIdDeclared: boolean;
  health: "visible" | "same-id";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readMcpIds(path: string, target: TargetName, mcpKey: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  try {
    const bytes = await readFile(path, "utf8");
    const parsed = target === "codex" ? parseToml(bytes) : JSON.parse(bytes);
    if (!isObject(parsed)) return [];
    const servers = parsed[mcpKey];
    return isObject(servers) ? Object.keys(servers).sort() : [];
  } catch {
    return [];
  }
}

async function readSkillIds(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function inspectAmbientCapabilities(options: {
  config: CanonicalConfig;
  homeDir: string;
  declaredSkillIds?: Iterable<string>;
  declaredMcpIds?: Iterable<string>;
}): Promise<AmbientCapabilityObservation[]> {
  const declaredSkills = new Set(options.declaredSkillIds ?? []);
  const declaredMcp = new Set(options.declaredMcpIds ?? []);
  const toolPaths = resolveToolPaths({ kind: "machine", homeDir: options.homeDir });
  const skillPaths: Record<TargetName, string | null> = {
    claude: toolPaths.claudeSkills,
    codex: toolPaths.codexSkills,
    cursor: null,
  };
  const observations: AmbientCapabilityObservation[] = [];

  for (const target of ["claude", "codex", "cursor"] as const) {
    const targetConfig = options.config.targets[target];
    const mcpPath = expandHomePath(
      target === "claude" ? (targetConfig.userMcpPath ?? targetConfig.configPath) : targetConfig.configPath,
      options.homeDir,
    );
    for (const id of await readMcpIds(mcpPath, target, targetConfig.mcpKey)) {
      const sameIdDeclared = declaredMcp.has(id);
      observations.push({
        id,
        kind: "mcp",
        target,
        sourceKind: "user-home",
        sourceId: `${target}:mcp`,
        sourcePath: mcpPath,
        sameIdDeclared,
        health: sameIdDeclared ? "same-id" : "visible",
      });
    }
    const skillPath = skillPaths[target];
    if (!skillPath) continue;
    for (const id of await readSkillIds(skillPath)) {
      const sameIdDeclared = declaredSkills.has(id);
      observations.push({
        id,
        kind: "skill",
        target,
        sourceKind: "user-home",
        sourceId: `${target}:skills`,
        sourcePath: skillPath,
        sameIdDeclared,
        health: sameIdDeclared ? "same-id" : "visible",
      });
    }
  }

  return observations.sort((left, right) =>
    left.target.localeCompare(right.target) || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
  );
}
