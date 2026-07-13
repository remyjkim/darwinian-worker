// ABOUTME: Discovers, loads, merges, and scaffolds per-project drwn configuration files.
// ABOUTME: Keeps project override behavior centralized so sync, status, and doctor consume effective state cleanly.

import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { CanonicalConfig, CanonicalRegistry, ProjectConfig, RegistryServer, ServerOverride } from "./types";
import { applyProjectExtensionConfig, mergeProjectSkillOverrides, toProjectSkillOverrides } from "./extensions/project-config";
import { DrwnError } from "./errors";

const PROJECT_CONFIG_KEYS = new Set([
  "schema",
  "schemaVersion",
  "workers",
  "activeWorker",
  "materialization",
  "committedSurfaces",
  "mcpServers",
  "skills",
  "hooks",
  "extensions",
  "targets",
  "trustedSources",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidProjectConfig(source: string, detail: string): never {
  throw new DrwnError("PROJECT_CONFIG_INVALID", `Invalid project config ${source}: ${detail}`);
}

function assertStringArray(value: unknown, source: string, field: string) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    invalidProjectConfig(source, `${field} must be a string array`);
  }
}

function validateStringArrayField(parent: Record<string, unknown>, key: string, source: string) {
  if (parent[key] !== undefined) assertStringArray(parent[key], source, key);
}

function validateProjectMcpServers(value: unknown, source: string) {
  if (value === undefined) return;
  if (!isObject(value)) invalidProjectConfig(source, "mcpServers must be an object");
  for (const [name, entry] of Object.entries(value)) {
    if (!isObject(entry)) invalidProjectConfig(source, `mcpServers.${name} must be an object`);
    if ("enabled" in entry && typeof entry.enabled !== "boolean") {
      invalidProjectConfig(source, `mcpServers.${name}.enabled must be boolean`);
    }
  }
}

function validateProjectHooks(value: unknown, source: string) {
  if (value === undefined) return;
  if (!isObject(value)) invalidProjectConfig(source, "hooks must be an object");
  validateStringArrayField(value, "exclude", source);
  if (value.runtimes !== undefined && !isObject(value.runtimes)) invalidProjectConfig(source, "hooks.runtimes must be an object");
  if (value.signals !== undefined && !isObject(value.signals)) invalidProjectConfig(source, "hooks.signals must be an object");
}

export function emptyProjectConfig(): ProjectConfig {
  return {
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: [],
    activeWorker: null,
  };
}

export function validateProjectConfig(input: unknown, source = "<memory>"): ProjectConfig {
  if (!isObject(input)) invalidProjectConfig(source, "expected an object");
  const unknown = Object.keys(input).filter((key) => !PROJECT_CONFIG_KEYS.has(key));
  if (unknown.length > 0) invalidProjectConfig(source, `unsupported field(s): ${unknown.join(", ")}`);
  if (input.schema !== "drwn.project-config") invalidProjectConfig(source, "schema must be drwn.project-config");
  if (input.schemaVersion !== 1) invalidProjectConfig(source, "schemaVersion must be 1");
  assertStringArray(input.workers, source, "workers");
  if (input.activeWorker !== null && typeof input.activeWorker !== "string") {
    invalidProjectConfig(source, "activeWorker must be a string or null");
  }
  if (input.materialization !== undefined && input.materialization !== "vendored" && input.materialization !== "linked") {
    invalidProjectConfig(source, "materialization must be vendored or linked");
  }
  if (input.committedSurfaces !== undefined && typeof input.committedSurfaces !== "boolean") {
    invalidProjectConfig(source, "committedSurfaces must be boolean");
  }
  validateProjectMcpServers(input.mcpServers, source);
  if (input.skills !== undefined) {
    if (!isObject(input.skills)) invalidProjectConfig(source, "skills must be an object");
    validateStringArrayField(input.skills, "include", source);
    validateStringArrayField(input.skills, "exclude", source);
  }
  validateProjectHooks(input.hooks, source);
  for (const key of ["extensions", "targets", "trustedSources"] as const) {
    if (input[key] !== undefined && !isObject(input[key])) invalidProjectConfig(source, `${key} must be an object`);
  }
  return input as unknown as ProjectConfig;
}

export interface MergedProjectState {
  config: CanonicalConfig;
  registry: CanonicalRegistry;
  skills?: ProjectConfig["skills"];
  extensions?: ProjectConfig["extensions"];
}

export function isServerToggle(override: ServerOverride): override is { enabled: boolean } {
  return !("transport" in override);
}

export function findProjectConfig(startDir: string): string | null {
  let dir = resolve(startDir);

  while (true) {
    const candidate = join(dir, ".agents", "drwn", "config.json");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function resolveProjectRootFromConfigPath(configPath: string) {
  return dirname(dirname(dirname(configPath)));
}

export async function loadProjectConfig(configPath: string): Promise<ProjectConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new DrwnError("PROJECT_CONFIG_INVALID", `Invalid project config ${configPath}: malformed JSON`, undefined, error);
  }
  return validateProjectConfig(parsed, configPath);
}

export function mergeProjectConfig(
  config: CanonicalConfig,
  registry: CanonicalRegistry,
  project: ProjectConfig,
): MergedProjectState {
  const nextConfig: CanonicalConfig = JSON.parse(JSON.stringify(config));
  const nextRegistry: CanonicalRegistry = JSON.parse(JSON.stringify(registry));
  const skillOverrides = mergeProjectSkillOverrides(project);

  for (const [name, override] of Object.entries(project.mcpServers ?? {})) {
    if (isServerToggle(override)) {
      nextConfig.optional[name] = override.enabled;
      if (!override.enabled) {
        delete nextRegistry.servers[name];
      } else if (registry.servers[name]) {
        nextRegistry.servers[name] = registry.servers[name];
      }
      continue;
    }

    nextRegistry.servers[name] = override as RegistryServer;
  }

  for (const [name, override] of Object.entries(project.targets ?? {})) {
    if (override && name in nextConfig.targets) {
      nextConfig.targets[name as keyof typeof nextConfig.targets].enabled = override.enabled;
    }
  }

  applyProjectExtensionConfig({
    config: nextConfig,
    registry: nextRegistry,
    extensions: project.extensions,
    include: skillOverrides.include,
    exclude: skillOverrides.exclude,
  });

  return {
    config: nextConfig,
    registry: nextRegistry,
    skills: toProjectSkillOverrides(skillOverrides.include, skillOverrides.exclude),
    extensions: project.extensions,
  };
}

export async function scaffoldProjectConfig(projectDir: string, options?: { force?: boolean }) {
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  if (existsSync(configPath) && !options?.force) {
    throw new Error(`Project config already exists: ${configPath}`);
  }
  if (existsSync(configPath) && options?.force) {
    await loadProjectConfig(configPath);
  }

  mkdirSync(dirname(configPath), { recursive: true });
  if (options?.force) {
    rmSync(configPath, { force: true });
  }
  writeFileSync(configPath, `${JSON.stringify(emptyProjectConfig(), null, 2)}\n`);
  return configPath;
}

export function summarizeProjectConfig(project: ProjectConfig) {
  const serverEntries = Object.entries(project.mcpServers ?? {});
  const targetEntries = Object.entries(project.targets ?? {});

  return {
    serverOverrideCount: serverEntries.length,
    serverDisabledCount: serverEntries.filter(([, override]) => isServerToggle(override) && override.enabled === false).length,
    serverAddedCount: serverEntries.filter(([, override]) => !isServerToggle(override)).length,
    skillIncludeCount: project.skills?.include?.length ?? 0,
    skillExcludeCount: project.skills?.exclude?.length ?? 0,
    extensionOverrideCount: Object.keys(project.extensions ?? {}).length,
    extensionOverrides: Object.entries(project.extensions ?? {}).map(([name, extension]) =>
      `${name} ${extension.enabled === false ? "disabled" : "enabled"}`,
    ),
    targetOverrideCount: targetEntries.length,
    targetOverrides: targetEntries.map(([name, override]) => `${name} ${override.enabled ? "enabled" : "disabled"}`),
  };
}
