// ABOUTME: Implements `bgng card status` for project card config and lockfile state.
// ABOUTME: Makes card consumption inspectable without mutating project files.

import { Option } from "clipanion";
import { readProjectCardStatus } from "../../core/card-project";
import { explainStatus } from "../../core/diagnostics";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class CardStatusCommand extends BaseCommand {
  static override paths = [["card", "status"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Show current project card specs, lock entries, and outdated cards.",
    details: `
      Shows the current project's configured card refs, locked versions, and
      available updates. Use --explain for provenance across cards, skills,
      MCP servers, targets, and write-record ownership.
    `,
    examples: [["Show card status", "bgng card status"]],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  explain = Option.Boolean("--explain", false, {
    description: "Show card provenance and related write-record state.",
  });

  async execute() {
    if (!this.context.projectConfigPath) {
      throw new Error("Run this command inside a project with .agents/bgng/config.json.");
    }
    if (this.explain) {
      this.context.stdout.write(
        await explainStatus(this.context.repoRoot, this.context.agentsDir, this.context.homeDir, this.context.projectConfigPath),
      );
      return 0;
    }
    const status = await readProjectCardStatus(this.context.projectConfigPath, this.context.agentsDir);
    if (this.json) {
      this.context.stdout.write(renderJson(status));
      return 0;
    }
    this.context.stdout.write(
      [
        `Project: ${status.projectRoot}`,
        `Specs: ${status.specs.join(", ") || "none"}`,
        status.locked.length === 0
          ? "Locked: none"
          : `Locked:\n${status.locked.map((card) => `- ${card.name}@${card.version} (${card.requested})`).join("\n")}`,
        status.outdated.length === 0
          ? "Outdated: none"
          : `Outdated:\n${status.outdated.map((card) => `- ${card.name} ${card.current} -> ${card.latest}`).join("\n")}`,
      ].join("\n") + "\n",
    );
    return 0;
  }
}
