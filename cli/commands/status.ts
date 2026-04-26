// ABOUTME: Implements the `agents status` command for a concise system overview of repo and derived state.
// ABOUTME: Provides both human-readable and JSON output for operators and automation.

import { Option } from "clipanion";
import { buildStatusReport } from "../core/diagnostics";
import { renderJson, renderTable } from "../core/output";
import { BaseCommand } from "./base";

export class StatusCommand extends BaseCommand {
  static override paths = [["status"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Show the current repo, aggregation, target, and count status.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const status = await buildStatusReport(
      this.context.repoRoot,
      this.context.agentsDir,
      this.context.homeDir,
      this.context.projectConfigPath,
    );

    if (this.json) {
      this.context.stdout.write(renderJson(status));
      return 0;
    }

    let output = renderTable(
      ["field", "value"],
      [
        ["repoRoot", status.repoRoot],
        ["agentsDir", status.agentsDir],
        ["homeDir", status.homeDir],
        ["enabledTargets", status.enabledTargets.join(",")],
        ["curatedSkillCount", String(status.curatedSkillCount)],
        ["repoSkillCount", String(status.repoSkillCount)],
        ["activeMcpServerCount", String(status.activeMcpServerCount)],
      ],
    );
    if (status.project) {
      output += `\nProject: ${status.project.configPath}\n\n`;
      output += `  Server overrides:  ${status.project.serverOverrideCount} (${status.project.serverDisabledCount} disabled, ${status.project.serverAddedCount} added)\n`;
      output += `  Skill overrides:   ${status.project.skillIncludeCount} included, ${status.project.skillExcludeCount} excluded\n`;
      output += `  Target overrides:  ${status.project.targetOverrides.join(", ") || "none"}\n`;
    }
    this.context.stdout.write(output);
    return 0;
  }
}
