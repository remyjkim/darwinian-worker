// ABOUTME: Builds report-only diagnostics for extension health.
// ABOUTME: Keeps Beads and Parallel checks non-mutating while surfacing setup gaps.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config";
import { loadRegistry } from "../registry";
import { loadProjectConfig, mergeProjectConfig } from "../project";
import { runExternalCommand } from "./commands";
import { buildExtensionStatus } from "./status";
import { getExtension } from "./registry";
import type { ExtensionDoctorReport } from "./types";

export async function buildExtensionDoctorReport(options: {
  repoRoot: string;
  agentsDir: string;
  cwd: string;
  env?: Record<string, string | undefined>;
  projectConfigPath?: string | null;
  extensionName: string;
}): Promise<ExtensionDoctorReport | null> {
  const status = await buildExtensionStatus(options);
  if (!status) {
    return null;
  }

  const issues: string[] = [];
  const warnings = [...status.warnings];
  const [baseConfig, baseRegistry] = await Promise.all([
    loadConfig(options.repoRoot),
    loadRegistry(options.repoRoot),
  ]);
  let effectiveConfig = baseConfig;
  let effectiveRegistry = baseRegistry;
  if (options.projectConfigPath) {
    const projectConfig = await loadProjectConfig(options.projectConfigPath);
    const merged = mergeProjectConfig(baseConfig, baseRegistry, projectConfig);
    effectiveConfig = merged.config;
    effectiveRegistry = merged.registry;
    for (const extensionName of Object.keys(projectConfig.extensions ?? {})) {
      if (!getExtension(extensionName)) {
        issues.push(`Unknown extension reference: "${extensionName}"`);
      }
    }
  }

  for (const command of status.commands) {
    if (command.required && !command.available) {
      issues.push(`${command.name} command is not available. Install with: ${command.installHints.join(" OR ")}`);
    }
  }

  for (const skill of status.skills) {
    if (!skill.present) {
      issues.push(`required extension skill is missing: ${skill.name}`);
    }
  }

  if (status.id === "beads") {
    if (!existsSync(join(options.cwd, ".beads"))) {
      issues.push("Beads project state is missing: .beads directory not found. Run drwn extensions setup beads.");
    }

    const bd = status.commands.find((command) => command.name === "bd");
    if (bd?.available && existsSync(join(options.cwd, ".beads"))) {
      const result = await runExternalCommand({
        cmd: ["bd", "doctor", "--json"],
        cwd: options.cwd,
        env: options.env,
      });
      if (result.exitCode !== 0) {
        issues.push(`bd doctor failed with exit code ${result.exitCode}`);
      }
      if (result.stderr.trim()) {
        warnings.push(result.stderr.trim());
      }
      if (result.stdout.trim()) {
        try {
          JSON.parse(result.stdout);
        } catch {
          warnings.push("bd doctor --json returned non-JSON output");
        }
      }
    }
  }

  if (status.id === "parallel") {
    if (effectiveConfig.parallel?.mcp?.enabled === true) {
      for (const server of status.mcpServers) {
        if (!effectiveRegistry.servers[server.name]) {
          issues.push(`enabled Parallel MCP server is missing from registry: ${server.name}`);
        }
      }
    }
    for (const server of status.mcpServers) {
      if (server.active && !server.configured) {
        issues.push(`active Parallel MCP server is missing from registry: ${server.name}`);
      }
    }
  }

  if (status.id === "markitdown") {
    const markitdown = status.commands.find((command) => command.name === "markitdown");
    const uv = status.commands.find((command) => command.name === "uv");

    if (!markitdown?.available) {
      issues.push("markitdown command is not available. Install with: uv tool install --python 3.12 'markitdown[all]'");
      if (!uv?.available) {
        issues.push("uv command is not available, so drwn cannot install MarkItDown. Install uv with: brew install uv OR curl -LsSf https://astral.sh/uv/install.sh | sh");
      }
    } else {
      const version = await runExternalCommand({
        cmd: ["markitdown", "--version"],
        cwd: options.cwd,
        env: options.env,
      });
      if (version.exitCode !== 0) {
        issues.push(`markitdown --version failed with exit code ${version.exitCode}`);
      }

      const smoke = await runExternalCommand({
        cmd: ["/bin/sh", "-c", "printf '# Smoke\\n\\nhello\\n' | markitdown -x md"],
        cwd: options.cwd,
        env: options.env,
      });
      if (smoke.exitCode !== 0) {
        issues.push(`markitdown stdin smoke conversion failed with exit code ${smoke.exitCode}`);
      }
    }
  }

  return {
    id: status.id,
    displayName: status.displayName,
    issues,
    warnings,
  };
}
