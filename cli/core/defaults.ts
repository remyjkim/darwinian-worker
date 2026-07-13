// ABOUTME: Resolves user global defaults for skills and MCP servers.
// ABOUTME: Keeps default policy separate from reusable library inventory.

import type { CanonicalConfig, CanonicalRegistry, UserMcpLibrary } from "./types";
import type { RegistryServer } from "./types";
import { join } from "node:path";
import { readMachineConfig } from "./card-store";
import { verifyMachineProfilePin } from "./machine-profiles";
import { findAvailableSkill, type SkillScope } from "./skills";
import { loadRegistry } from "./registry";
import { loadMcpLibrary } from "./mcp-library";
import { DrwnError } from "./errors";

function isParallelMcpName(name: string) {
  return name === "parallel-search" || name === "parallel-task";
}

export function hasExplicitSkillDefaults(config: CanonicalConfig): boolean {
  return Array.isArray(config.defaults?.skills);
}

export function hasExplicitMcpDefaults(config: CanonicalConfig): boolean {
  return Array.isArray(config.defaults?.mcpServers);
}

export function resolveDefaultSkillNames(config: CanonicalConfig): string[] {
  return hasExplicitSkillDefaults(config) ? [...(config.defaults?.skills ?? [])] : [];
}

export function resolveDefaultMcpNames(config: CanonicalConfig, registry: CanonicalRegistry): string[] {
  if (hasExplicitMcpDefaults(config)) {
    return [...(config.defaults?.mcpServers ?? [])];
  }

  return Object.entries(registry.servers)
    .filter(([name, server]) => {
      if (server.transport === "platform-provided") {
        return false;
      }
      if (isParallelMcpName(name)) {
        return config.parallel?.mcp?.enabled === true;
      }
      return !server.optional || config.optional[name] === true;
    })
    .map(([name]) => name);
}

export function applyMcpDefaultsToConfig(config: CanonicalConfig): CanonicalConfig {
  if (!hasExplicitMcpDefaults(config)) {
    return config;
  }

  const next: CanonicalConfig = JSON.parse(JSON.stringify(config));
  const defaults = new Set(next.defaults?.mcpServers ?? []);
  next.optional = {};
  for (const name of defaults) {
    next.optional[name] = true;
  }
  next.parallel ??= {};
  next.parallel.mcp = {
    ...(next.parallel.mcp ?? {}),
    enabled: defaults.has("parallel-search") || defaults.has("parallel-task"),
  };
  return next;
}

export function ensureMcpDefaultsInitialized(config: CanonicalConfig, seedNames: string[]): string[] {
  config.defaults ??= {};
  if (!hasExplicitMcpDefaults(config)) {
    config.defaults.mcpServers = [...seedNames];
  }
  return config.defaults.mcpServers ?? [];
}

export function ensureSkillDefaultsInitialized(config: CanonicalConfig, seedNames: string[]): string[] {
  config.defaults ??= {};
  if (!hasExplicitSkillDefaults(config)) {
    config.defaults.skills = [...seedNames];
  }
  return config.defaults.skills ?? [];
}

export function mergeUserMcpLibrary(registry: CanonicalRegistry, library: UserMcpLibrary): CanonicalRegistry {
  return {
    version: registry.version,
    servers: {
      ...registry.servers,
      ...library.servers,
    },
  };
}

export interface ResolvedMachineSkill {
  id: string;
  source: "profile" | "explicit";
  profileId?: "darwinian-operator";
  path: string;
  scope: SkillScope;
}

export interface ResolvedMachineMcpServer {
  id: string;
  source: "profile" | "explicit";
  profileId?: "darwinian-operator";
  server: RegistryServer;
}

export interface ResolvedMachineCapabilities {
  profileId: "darwinian-operator" | null;
  skills: ResolvedMachineSkill[];
  mcpServers: ResolvedMachineMcpServer[];
}

function capabilityNotFound(kind: "skill" | "MCP server", id: string): never {
  throw new DrwnError(
    "MACHINE_CAPABILITY_NOT_FOUND",
    `Explicit machine ${kind} is not available in the local Library: ${id}`,
  );
}

export async function resolveMachineCapabilities(options: {
  repoRoot: string;
  agentsDir: string;
}): Promise<ResolvedMachineCapabilities> {
  const machine = await readMachineConfig(options.agentsDir);
  const skills: ResolvedMachineSkill[] = [];
  const mcpServers: ResolvedMachineMcpServer[] = [];
  const selectedSkills = new Set<string>();
  const selectedServers = new Set<string>();

  if (machine.capabilities.profile) {
    const pin = machine.capabilities.profile;
    const verified = await verifyMachineProfilePin(options.agentsDir, pin);
    for (const id of pin.skills) {
      skills.push({
        id,
        source: "profile",
        profileId: pin.id,
        path: join(verified.dir, "skills", id),
        scope: "shared",
      });
      selectedSkills.add(id);
    }
    for (const id of pin.mcpServers) {
      const server = verified.manifest.servers?.[id];
      if (!server || !("transport" in server)) capabilityNotFound("MCP server", id);
      mcpServers.push({ id, source: "profile", profileId: pin.id, server });
      selectedServers.add(id);
    }
  }

  for (const id of machine.capabilities.skills) {
    if (selectedSkills.has(id)) continue;
    const skill = await findAvailableSkill(options.repoRoot, options.agentsDir, id);
    if (!skill) capabilityNotFound("skill", id);
    skills.push({ id, source: "explicit", path: skill.path, scope: skill.scope });
    selectedSkills.add(id);
  }

  const registry = mergeUserMcpLibrary(
    await loadRegistry(options.repoRoot),
    await loadMcpLibrary(options.agentsDir),
  );
  for (const id of machine.capabilities.mcpServers) {
    if (selectedServers.has(id)) continue;
    const server = registry.servers[id];
    if (!server || server.transport === "platform-provided") capabilityNotFound("MCP server", id);
    mcpServers.push({ id, source: "explicit", server });
    selectedServers.add(id);
  }

  return {
    profileId: machine.capabilities.profile?.id ?? null,
    skills,
    mcpServers,
  };
}

export async function validateDefaultReferences(options: {
  config: CanonicalConfig;
  registry: CanonicalRegistry;
  skillNames: Set<string>;
}) {
  const issues: string[] = [];
  for (const name of options.config.defaults?.skills ?? []) {
    if (!options.skillNames.has(name)) {
      issues.push(`Unknown default skill: "${name}"`);
    }
  }
  for (const name of options.config.defaults?.mcpServers ?? []) {
    if (!options.registry.servers[name]) {
      issues.push(`Unknown default MCP server: "${name}"`);
    }
  }
  return issues;
}

export function addDefaultValue(values: string[] | undefined, value: string) {
  const next = [...(values ?? [])];
  if (!next.includes(value)) {
    next.push(value);
  }
  return next;
}

export function removeDefaultValue(values: string[] | undefined, value: string) {
  return [...(values ?? [])].filter((item) => item !== value);
}
