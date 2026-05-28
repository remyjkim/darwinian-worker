// ABOUTME: Implements the `bgng status` command for a concise system overview of repo and derived state.
// ABOUTME: Provides both human-readable and JSON output for operators and automation.

import { Option } from "clipanion";
import { answerWhy, buildDiagnosticsSections, buildStatusReport, explainStatus } from "../core/diagnostics";
import { renderJson, renderTable } from "../core/output";
import { BaseCommand } from "./base";

export class StatusCommand extends BaseCommand {
  static override paths = [["status"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Show the current repo, aggregation, target, and count status.",
    details: `
      Prints the resolved repo root, agents directory, home directory, enabled
      targets, and counts for skills and MCP servers. When run inside a project
      with .agents/bgng/config.json, includes project overlay counts and active
      extension overrides.

      This command is read-only.
    `,
    examples: [
      ["Quick status snapshot", "bgng status"],
      ["JSON for tooling", "bgng status --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  explain = Option.Boolean("--explain", false, {
    description: "Show provenance for cards, skills, MCP servers, targets, and write records.",
  });

  why = Option.String("--why", {
    description: "Explain why a skill, server, extension, target, or card is active.",
  });

  async execute() {
    if (this.why) {
      const answer = await answerWhy(
        this.context.repoRoot,
        this.context.agentsDir,
        this.context.homeDir,
        this.context.projectConfigPath,
        this.why,
      );
      if (!answer.ok) {
        this.context.stderr.write(answer.message);
        return 1;
      }
      this.context.stdout.write(answer.message);
      return 0;
    }

    if (this.explain) {
      this.context.stdout.write(
        await explainStatus(
          this.context.repoRoot,
          this.context.agentsDir,
          this.context.homeDir,
          this.context.projectConfigPath,
        ),
      );
      return 0;
    }

    const status = await buildStatusReport(
      this.context.repoRoot,
      this.context.agentsDir,
      this.context.homeDir,
      this.context.projectConfigPath,
    );

    if (this.json) {
      const sections = await buildDiagnosticsSections(
        this.context.repoRoot,
        this.context.agentsDir,
        this.context.homeDir,
        this.context.projectConfigPath,
      );
      this.context.stdout.write(renderJson({ ...status, sections }));
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
      output += `  Extension overrides: ${status.project.extensionOverrides.join(", ") || "none"}\n`;
      output += `  Target overrides:  ${status.project.targetOverrides.join(", ") || "none"}\n`;
    }
    this.context.stdout.write(output);
    return 0;
  }
}
