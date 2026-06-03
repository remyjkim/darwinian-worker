// ABOUTME: Implements `drwn card source doctor` for editable source diagnostics.
// ABOUTME: Reports source issues without mutating files or failing for findings.

import { Option } from "clipanion";
import { doctorCardSource, type CardSourceDoctorReport } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

function renderSourceDoctorReport(report: CardSourceDoctorReport) {
  if (report.ok) {
    return "No issues found.\n";
  }
  return `Issues:\n${report.issues.map((issue) => `- ${issue.code}: ${issue.message}`).join("\n")}\n`;
}

export class CardSourceDoctorCommand extends BaseCommand {
  static override paths = [["card", "source", "doctor"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Report editable card source issues without mutating anything.",
    details: `
      Checks one source, or every source when no name is provided, for manifest,
      bundled skill, package.json, and MCP server file issues. Reportable issues
      are returned in output; the command exits nonzero only for fatal command
      errors such as an unknown named source.
    `,
    examples: [
      ["Doctor all sources", "drwn card source doctor"],
      ["Doctor one source as JSON", "drwn card source doctor @me/backend --json"],
    ],
  });

  name = Option.String({ required: false });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const report = await doctorCardSource(this.context.agentsDir, this.name);
    this.context.stdout.write(this.json ? renderJson(report) : renderSourceDoctorReport(report));
    return 0;
  }
}
