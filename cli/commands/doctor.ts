// ABOUTME: Implements the `drwn doctor` command for report-only diagnostics over the current machine state.
// ABOUTME: Surfaces broken links, stale state, MCP drift, and missing generated files without mutating anything.

import { Option } from "clipanion";
import { buildDoctorReportWithProject } from "../core/diagnostics";
import { renderDoctorReport, renderJson } from "../core/output";
import { BaseCommand } from "./base";

export class DoctorCommand extends BaseCommand {
  static override paths = [["doctor"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Report drift, stale state, and broken symlinks without mutating anything.",
    details: `
      Inspects local harness state for broken symlinks, stale generated files,
      MCP drift, unknown defaults, and project config issues. This command is
      read-only and never mutates files.

      Reportable issues are rendered in the output; use --json if automation
      needs to inspect issue counts or exact paths. For extension-specific
      diagnostics, see drwn extensions doctor.
    `,
    examples: [
      ["Run a health check", "drwn doctor"],
      ["Inspect structured output", "drwn doctor --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const report = await buildDoctorReportWithProject(
      this.context.repoRoot,
      this.context.agentsDir,
      this.context.homeDir,
      this.context.projectConfigPath,
    );

    if (this.json) {
      this.context.stdout.write(renderJson(report));
      return 0;
    }

    this.context.stdout.write(renderDoctorReport(report));
    return 0;
  }
}
