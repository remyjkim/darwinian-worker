// ABOUTME: Provides generic write helpers for project-level drwn configuration.
// ABOUTME: Keeps add/library/extension commands from duplicating config mutation code.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectConfig, ProjectExtensionConfig, ServerOverride } from "./types";

export function projectConfigPath(projectDir: string) {
  return join(projectDir, ".agents", "drwn", "config.json");
}

export function readProjectConfigForWrite(projectDir: string): ProjectConfig {
  const configPath = projectConfigPath(projectDir);
  if (!existsSync(configPath)) {
    return { version: 1 };
  }
  return JSON.parse(readFileSync(configPath, "utf8")) as ProjectConfig;
}

export function writeProjectConfigForWrite(projectDir: string, config: ProjectConfig) {
  const configPath = projectConfigPath(projectDir);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
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
  config.servers ??= {};
  config.servers[name] = override;
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
