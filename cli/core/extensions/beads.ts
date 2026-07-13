// ABOUTME: Plans and applies Beads project setup while keeping dry-run behavior explicit.
// ABOUTME: Avoids destructive Beads operations and lets Beads own its own init/setup recipes.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runExternalCommand } from "./commands";
import type { ProjectConfig } from "../types";
import { ensureProjectExtensionConfig } from "./project-config";

export type BeadsTarget = "codex" | "claude" | "cursor";

export interface BeadsSetupPlan {
  projectDir: string;
  beadsDirExists: boolean;
  commands: Array<{ cmd: string[]; reason: string; mutates: boolean }>;
  warnings: string[];
}

export interface BeadsSetupOptions {
  projectDir: string;
  targets: BeadsTarget[];
  stealth?: boolean;
  skipBdInit?: boolean;
  skipBdSetup?: boolean;
}

const defaultTargets: BeadsTarget[] = ["codex", "claude", "cursor"];
const supportedTargets = new Set(defaultTargets);

export function normalizeBeadsTargets(value?: string): BeadsTarget[] {
  if (!value) {
    return [...defaultTargets];
  }
  const targets = value.split(",").map((target) => target.trim()).filter(Boolean);
  for (const target of targets) {
    if (!supportedTargets.has(target as BeadsTarget)) {
      throw new Error(`Unsupported Beads target: ${target}`);
    }
  }
  return targets as BeadsTarget[];
}

export async function planBeadsSetup(options: BeadsSetupOptions): Promise<BeadsSetupPlan> {
  const beadsDirExists = existsSync(join(options.projectDir, ".beads"));
  const commands: BeadsSetupPlan["commands"] = [];

  if (!beadsDirExists && !options.skipBdInit) {
    commands.push({
      cmd: ["bd", "init", "--quiet", "--non-interactive", ...(options.stealth ? ["--stealth"] : [])],
      reason: "initialize Beads project state",
      mutates: true,
    });
  }

  if (!options.skipBdSetup) {
    for (const target of options.targets) {
      commands.push({
        cmd: ["bd", "setup", target, "--check"],
        reason: `check Beads ${target} setup`,
        mutates: false,
      });
      commands.push({
        cmd: ["bd", "setup", target, ...(options.stealth ? ["--stealth"] : [])],
        reason: `install Beads ${target} setup`,
        mutates: true,
      });
    }
  }

  return {
    projectDir: options.projectDir,
    beadsDirExists,
    commands,
    warnings: [],
  };
}

export async function executeBeadsSetupPlan(plan: BeadsSetupPlan, env?: Record<string, string | undefined>) {
  const results: Array<{ cmd: string[]; exitCode: number; stdout: string; stderr: string }> = [];
  for (const command of plan.commands) {
    const result = await runExternalCommand({ cmd: command.cmd, cwd: plan.projectDir, env });
    results.push({ cmd: command.cmd, ...result });
    if (result.exitCode !== 0) {
      break;
    }
  }
  return results;
}

export function ensureProjectSkillInclude(projectDir: string, skillName = "beads-task-tracking") {
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  const config: ProjectConfig = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf8")) as ProjectConfig
    : { version: 1 };

  config.skills ??= {};
  config.skills.include ??= [];
  if (!config.skills.include.includes(skillName)) {
    config.skills.include.push(skillName);
  }

  mkdirSync(join(projectDir, ".agents", "drwn"), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}

export function ensureBeadsProjectExtensionConfig(projectDir: string, options: {
  targets: BeadsTarget[];
  includeSkill?: boolean;
}) {
  return ensureProjectExtensionConfig(projectDir, "beads", {
    enabled: true,
    targets: options.targets,
    includeSkill: options.includeSkill === true,
  });
}
