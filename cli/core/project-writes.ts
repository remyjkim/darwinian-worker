// ABOUTME: Provides generic write helpers for project-level drwn configuration.
// ABOUTME: Keeps add/library/extension commands from duplicating config mutation code.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectConfig, ProjectExtensionConfig, ServerOverride } from "./types";
import { emptyProjectConfig, validateProjectConfig } from "./project";

export function projectConfigPath(projectDir: string) {
  return join(projectDir, ".agents", "drwn", "config.json");
}

export function readProjectConfigForWrite(projectDir: string): ProjectConfig {
  const configPath = projectConfigPath(projectDir);
  if (!existsSync(configPath)) {
    return emptyProjectConfig();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid project config ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateProjectConfig(parsed, configPath);
}

export function writeProjectConfigForWrite(projectDir: string, config: ProjectConfig) {
  const configPath = projectConfigPath(projectDir);
  const validated = validateProjectConfig(config, configPath);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(validated, null, 2)}\n`);
  return configPath;
}

export function includeProjectSkill(projectDir: string, skillName: string) {
  const config = readProjectConfigForWrite(projectDir);
  config.skills ??= {};
  config.skills.include ??= [];
  if (!config.skills.include.includes(skillName)) {
    config.skills.include.push(skillName);
  }
  return writeProjectConfigForWrite(projectDir, config);
}

export function setProjectServerOverride(projectDir: string, name: string, override: ServerOverride) {
  const config = readProjectConfigForWrite(projectDir);
  config.mcpServers ??= {};
  config.mcpServers[name] = override;
  return writeProjectConfigForWrite(projectDir, config);
}

export function setProjectExtensionConfig(
  projectDir: string,
  extensionName: string,
  extensionConfig: ProjectExtensionConfig,
) {
  const config = readProjectConfigForWrite(projectDir);
  config.extensions ??= {};
  config.extensions[extensionName] = {
    ...(config.extensions[extensionName] ?? {}),
    ...extensionConfig,
  };
  return writeProjectConfigForWrite(projectDir, config);
}
