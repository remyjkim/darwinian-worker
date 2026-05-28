// ABOUTME: Plans and writes MarkItDown extension project configuration.
// ABOUTME: Keeps uv installation explicit and separate from project config activation.

import { ensureProjectExtensionConfig, projectConfigPath } from "./project-config";

export interface MarkitdownSetupOptions {
  projectDir: string;
  markitdownAvailable: boolean;
  uvAvailable: boolean;
  installApproved: boolean;
  skills?: boolean;
}

export interface MarkitdownSetupPlan {
  projectDir: string;
  commands: Array<{ cmd: string[]; reason: string; mutates: boolean }>;
  projectConfigChange: {
    extensionName: "markitdown";
    config: { enabled: true; skills: boolean };
    path: string;
  };
  warnings: string[];
}

export const markitdownInstallCommand = ["uv", "tool", "install", "--python", "3.12", "markitdown[all]"];

export function buildMarkitdownProjectConfig(options: { skills?: boolean }): { enabled: true; skills: boolean } {
  return {
    enabled: true,
    skills: options.skills !== false,
  };
}

export function planMarkitdownSetup(options: MarkitdownSetupOptions): MarkitdownSetupPlan {
  const config = buildMarkitdownProjectConfig({ skills: options.skills });
  const warnings: string[] = [];
  const commands: MarkitdownSetupPlan["commands"] = [];

  if (!options.markitdownAvailable && options.installApproved) {
    if (options.uvAvailable) {
      commands.push({
        cmd: markitdownInstallCommand,
        reason: "install MarkItDown globally through uv",
        mutates: true,
      });
    } else {
      warnings.push("uv command is required to install MarkItDown.");
    }
  }

  return {
    projectDir: options.projectDir,
    commands,
    projectConfigChange: {
      extensionName: "markitdown",
      config,
      path: projectConfigPath(options.projectDir),
    },
    warnings,
  };
}

export function ensureMarkitdownProjectExtensionConfig(options: {
  projectDir: string;
  skills?: boolean;
}) {
  return ensureProjectExtensionConfig(
    options.projectDir,
    "markitdown",
    buildMarkitdownProjectConfig({ skills: options.skills }),
  );
}
