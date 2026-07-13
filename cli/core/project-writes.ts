// ABOUTME: Provides serialized write helpers for project-level drwn configuration.
// ABOUTME: Enforces inventory-to-project lock ordering for standalone capability references.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeAtomically } from "./fs";
import { withInventoryLock } from "./inventory-lock";
import { emptyProjectConfig, validateProjectConfig } from "./project";
import { withProjectStateLock } from "./project-state-transaction";
import type { ProjectConfig, ProjectExtensionConfig, ServerOverride } from "./types";

export type ProjectCapabilityWriteCheckpoint =
  | "after-inventory-lock"
  | "after-project-lock"
  | "before-write"
  | "after-write";

export interface ProjectCapabilityWriteOptions {
  validate?: () => void | Promise<void>;
  checkpoint?: (checkpoint: ProjectCapabilityWriteCheckpoint) => void | Promise<void>;
}

export interface ProjectServerWriteOptions extends ProjectCapabilityWriteOptions {
  resolveOverride?: () => ServerOverride | Promise<ServerOverride>;
}

export function projectConfigPath(projectDir: string) {
  return join(projectDir, ".agents", "drwn", "config.json");
}

async function readProjectConfigUnlocked(projectDir: string): Promise<ProjectConfig> {
  const configPath = projectConfigPath(projectDir);
  let bytes: string;
  try {
    bytes = await readFile(configPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return emptyProjectConfig();
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch (error) {
    throw new Error(`Invalid project config ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateProjectConfig(parsed, configPath);
}

async function writeProjectConfigUnlocked(projectDir: string, config: ProjectConfig) {
  const configPath = projectConfigPath(projectDir);
  const validated = validateProjectConfig(config, configPath);
  await writeAtomically(configPath, `${JSON.stringify(validated, null, 2)}\n`);
  return configPath;
}

async function mutateProjectConfig(
  projectDir: string,
  mutate: (config: ProjectConfig) => void | Promise<void>,
  checkpoint?: ProjectCapabilityWriteOptions["checkpoint"],
) {
  return withProjectStateLock(projectDir, async () => {
    await checkpoint?.("after-project-lock");
    const config = await readProjectConfigUnlocked(projectDir);
    await mutate(config);
    await checkpoint?.("before-write");
    const configPath = await writeProjectConfigUnlocked(projectDir, config);
    await checkpoint?.("after-write");
    return configPath;
  });
}

async function mutateInventoryProjectConfig(
  agentsDir: string,
  projectDir: string,
  mutate: (config: ProjectConfig) => void | Promise<void>,
  options: ProjectCapabilityWriteOptions,
) {
  return withInventoryLock(agentsDir, async () => {
    await options.checkpoint?.("after-inventory-lock");
    await options.validate?.();
    return mutateProjectConfig(projectDir, mutate, options.checkpoint);
  });
}

export async function readProjectConfigForWrite(projectDir: string): Promise<ProjectConfig> {
  return readProjectConfigUnlocked(projectDir);
}

export async function writeProjectConfigForWrite(projectDir: string, config: ProjectConfig) {
  return withProjectStateLock(projectDir, () => writeProjectConfigUnlocked(projectDir, config));
}

export async function includeProjectSkills(
  agentsDir: string,
  projectDir: string,
  skillNames: Iterable<string>,
  options: ProjectCapabilityWriteOptions = {},
) {
  const requested = [...skillNames];
  return mutateInventoryProjectConfig(agentsDir, projectDir, (config) => {
    config.skills ??= {};
    config.skills.include ??= [];
    for (const skillName of requested) {
      if (!config.skills.include.includes(skillName)) config.skills.include.push(skillName);
    }
  }, options);
}

export async function includeProjectSkill(
  agentsDir: string,
  projectDir: string,
  skillName: string,
  options: ProjectCapabilityWriteOptions = {},
) {
  return includeProjectSkills(agentsDir, projectDir, [skillName], options);
}

export async function setProjectServerOverride(
  agentsDir: string,
  projectDir: string,
  name: string,
  override: ServerOverride,
  options: ProjectServerWriteOptions = {},
) {
  return mutateInventoryProjectConfig(agentsDir, projectDir, async (config) => {
    config.mcpServers ??= {};
    config.mcpServers[name] = await options.resolveOverride?.() ?? override;
  }, options);
}

export async function setProjectExtensionConfig(
  projectDir: string,
  extensionName: string,
  extensionConfig: ProjectExtensionConfig,
) {
  return mutateProjectConfig(projectDir, (config) => {
    config.extensions ??= {};
    config.extensions[extensionName] = {
      ...(config.extensions[extensionName] ?? {}),
      ...extensionConfig,
    };
  });
}
