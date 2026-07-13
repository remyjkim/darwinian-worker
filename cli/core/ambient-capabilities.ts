// ABOUTME: Observes user-home skill and MCP surfaces without adding them to project declarations.
// ABOUTME: Returns redacted provenance for status and doctor; enforcement belongs to target adapters.

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { parse as parseToml } from "smol-toml";
import type { AmbientMcpDefinition, AmbientDefinitionSource } from "./ambient-policy";
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

export interface AmbientMcpInspectionError {
  target: TargetName;
  path: string;
  message: string;
}

export interface AmbientMcpInspection {
  definitions: AmbientMcpDefinition[];
  errors: AmbientMcpInspectionError[];
}

function appendDefinitions(
  definitions: AmbientMcpDefinition[],
  target: TargetName,
  path: string,
  source: AmbientDefinitionSource,
  servers: unknown,
) {
  if (!isObject(servers)) return;
  for (const id of Object.keys(servers).sort()) {
    definitions.push({ target, id, source, path, value: servers[id] });
  }
}

const sourceOrder: Record<AmbientDefinitionSource, number> = { local: 0, project: 1, user: 2 };

export async function inspectAmbientMcpDefinitions(options: {
  config: CanonicalConfig;
  homeDir: string;
  projectRoot?: string | null;
}): Promise<AmbientMcpInspection> {
  const definitions: AmbientMcpDefinition[] = [];
  const errors: AmbientMcpInspectionError[] = [];

  for (const target of ["claude", "codex", "cursor"] as const) {
    const targetConfig = options.config.targets[target];
    const path = expandHomePath(
      target === "claude" ? (targetConfig.userMcpPath ?? targetConfig.configPath) : targetConfig.configPath,
      options.homeDir,
    );
    if (!existsSync(path)) continue;
    try {
      const bytes = await readFile(path, "utf8");
      const parsed = target === "codex" ? parseToml(bytes) : JSON.parse(bytes);
      if (!isObject(parsed)) {
        errors.push({ target, path, message: "Ambient MCP configuration must contain an object." });
        continue;
      }
      appendDefinitions(definitions, target, path, "user", parsed[targetConfig.mcpKey]);
      if (target === "claude" && options.projectRoot) {
        const projectEntry = isObject(parsed.projects) ? parsed.projects[options.projectRoot] : undefined;
        appendDefinitions(
          definitions,
          target,
          path,
          "local",
          isObject(projectEntry) ? projectEntry[targetConfig.mcpKey] : undefined,
        );
      }
    } catch {
      errors.push({ target, path, message: "Ambient MCP configuration could not be parsed." });
    }
  }

  definitions.sort((left, right) =>
    left.target.localeCompare(right.target) ||
    left.id.localeCompare(right.id) ||
    sourceOrder[left.source] - sourceOrder[right.source] ||
    left.path.localeCompare(right.path)
  );
  return { definitions, errors };
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

  const ambientMcp = await inspectAmbientMcpDefinitions({
    config: options.config,
    homeDir: options.homeDir,
  });

  for (const target of ["claude", "codex", "cursor"] as const) {
    for (const definition of ambientMcp.definitions.filter((entry) => entry.target === target && entry.source === "user")) {
      const id = definition.id;
      const sameIdDeclared = declaredMcp.has(id);
      observations.push({
        id,
        kind: "mcp",
        target,
        sourceKind: "user-home",
        sourceId: `${target}:mcp`,
        sourcePath: definition.path,
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
