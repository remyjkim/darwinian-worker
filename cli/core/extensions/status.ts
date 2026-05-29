// ABOUTME: Builds non-mutating status reports for drwn extensions.
// ABOUTME: Bridges extension metadata with local CLI availability, skills, MCP registry, and project state.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config";
import { buildActiveServers } from "../mcp";
import { loadRegistry } from "../registry";
import { listCuratedSkills, listRepoSkills } from "../skills";
import { loadProjectConfig, mergeProjectConfig } from "../project";
import { findCommand } from "./commands";
import { getExtension, listExtensions } from "./registry";
import type { ExtensionDefinition, ExtensionStatus } from "./types";
import type { ProjectExtensionConfig } from "../types";

function extensionScope(definition: ExtensionDefinition): ExtensionStatus["scope"] {
  if (definition.scopes.length === 1) {
    return definition.scopes[0] === "global" ? "global" : "project";
  }
  return "mixed";
}

export async function buildExtensionStatus(options: {
  repoRoot: string;
  agentsDir: string;
  cwd: string;
  env?: Record<string, string | undefined>;
  projectConfigPath?: string | null;
  extensionName: string;
}): Promise<ExtensionStatus | null> {
  const definition = getExtension(options.extensionName);
  if (!definition) {
    return null;
  }

  const [repoSkills, curatedSkills, config, registry] = await Promise.all([
    listRepoSkills(options.repoRoot),
    listCuratedSkills(options.agentsDir),
    loadConfig(options.repoRoot),
    loadRegistry(options.repoRoot),
  ]);
  let effectiveConfig = config;
  let effectiveRegistry = registry;
  let extensionConfig: ProjectExtensionConfig | undefined;
  if (options.projectConfigPath) {
    const projectConfig = await loadProjectConfig(options.projectConfigPath);
    const merged = mergeProjectConfig(config, registry, projectConfig);
    effectiveConfig = merged.config;
    effectiveRegistry = merged.registry;
    extensionConfig = projectConfig.extensions?.[definition.id];
  }

  const activeServers = buildActiveServers(effectiveRegistry, effectiveConfig);
  const repoSkillNames = new Set(repoSkills.map((skill) => skill.name));
  const curatedSkillNames = new Set(curatedSkills.map((skill) => skill.name));
  const commands = await Promise.all(
    definition.commands.map(async (command) => ({
      ...command,
      ...(await findCommand(command.name, options.env)),
    })),
  );
  const skills = definition.skills.map((skill) => ({
    name: skill.name,
    present: repoSkillNames.has(skill.name),
    curated: curatedSkillNames.has(skill.name),
  }));
  const mcpServers = definition.mcpServers.map((server) => ({
    name: server.name,
    configured: Boolean(effectiveRegistry.servers[server.name]),
    active: Boolean(activeServers[server.name]),
  }));
  const warnings = [
    ...commands
      .filter((command) => command.required && !command.available)
      .map((command) => `missing required command: ${command.name}`),
    ...skills
      .filter((skill) => !skill.present)
      .map((skill) => `missing skill: ${skill.name}`),
  ];

  return {
    id: definition.id,
    displayName: definition.displayName,
    available: commands.filter((command) => command.required).every((command) => command.available),
    scope: extensionScope(definition),
    commands,
    skills,
    mcpServers,
    project: options.projectConfigPath || definition.id === "beads"
      ? {
          cwd: options.cwd,
          ...(options.projectConfigPath ? {
            configPath: options.projectConfigPath,
            extensionConfigured: extensionConfig !== undefined,
            extensionEnabled: extensionConfig ? extensionConfig.enabled !== false : undefined,
          } : {}),
          ...(definition.id === "beads" ? { beadsDirExists: existsSync(join(options.cwd, ".beads")) } : {}),
        }
      : undefined,
    warnings,
  };
}

export async function buildAllExtensionStatuses(options: {
  repoRoot: string;
  agentsDir: string;
  cwd: string;
  env?: Record<string, string | undefined>;
  projectConfigPath?: string | null;
}) {
  return await Promise.all(
    listExtensions().map((extension) =>
      buildExtensionStatus({ ...options, extensionName: extension.id }),
    ),
  );
}
