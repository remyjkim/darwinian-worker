// ABOUTME: Shared helpers for project-scoped Harness Card commands.
// ABOUTME: Keeps command classes focused on argument handling and output.

import { UsageError } from "clipanion";
import { resolveProjectRootFromConfigPath } from "../../core/project";
import type { CardProjectMutation } from "../../core/card-project";
import { renderOptionalMcpReport, renderSyncResult } from "../../core/output";
import { syncRepository } from "../../core/sync";
import type { BaseCommand } from "../base";

export function requireProjectRoot(command: BaseCommand) {
  if (!command.context.projectConfigPath) {
    throw new UsageError("Run this command inside a project with .agents/drwn/config.json.");
  }
  return resolveProjectRootFromConfigPath(command.context.projectConfigPath);
}

export function renderCardMutation(result: CardProjectMutation) {
  return [
    `Updated ${result.projectConfigPath}`,
    `Wrote ${result.lockPath}`,
    result.locked.length === 0
      ? "Cards: none"
      : `Cards:\n${result.locked.map((card) => `- ${card.name}@${card.version} (${card.requested})`).join("\n")}`,
    ...(result.warnings && result.warnings.length > 0
      ? [`Warnings:\n${result.warnings.map((warning) => `- ${warning}`).join("\n")}`]
      : []),
  ].join("\n") + "\n";
}

export async function runChainedWrite(command: BaseCommand) {
  try {
    const result = await syncRepository({
      repoRoot: command.context.repoRoot,
      agentsDir: command.context.agentsDir,
      homeDir: command.context.homeDir,
      cwd: command.context.cwd,
    });
    command.context.stdout.write(`${renderSyncResult(result)}${renderOptionalMcpReport(result.optionalMcpReport)}`);
    return 0;
  } catch (error) {
    command.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
