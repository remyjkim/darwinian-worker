// ABOUTME: Discovers, loads, merges, and scaffolds per-project drwn configuration files.
// ABOUTME: Keeps project override behavior centralized so sync, status, and doctor consume effective state cleanly.

import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { CanonicalConfig, CanonicalRegistry, ProjectConfig, RegistryServer, ServerOverride } from "./types";
import { applyProjectExtensionConfig, mergeProjectSkillOverrides, toProjectSkillOverrides } from "./extensions/project-config";

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
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as ProjectConfig;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported project config version: ${String(parsed.version)}`);
  }
  return parsed;
}

export function mergeProjectConfig(
  config: CanonicalConfig,
  registry: CanonicalRegistry,
  project: ProjectConfig,
): MergedProjectState {
  const nextConfig: CanonicalConfig = JSON.parse(JSON.stringify(config));
  const nextRegistry: CanonicalRegistry = JSON.parse(JSON.stringify(registry));
  const skillOverrides = mergeProjectSkillOverrides(project);

  for (const [name, override] of Object.entries(project.servers ?? {})) {
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

  mkdirSync(dirname(configPath), { recursive: true });
  if (options?.force) {
    rmSync(configPath, { force: true });
  }
  writeFileSync(configPath, `${JSON.stringify({ version: 1 }, null, 2)}\n`);
  return configPath;
}

export function summarizeProjectConfig(project: ProjectConfig) {
  const serverEntries = Object.entries(project.servers ?? {});
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
