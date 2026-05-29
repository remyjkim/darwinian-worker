// ABOUTME: Implements drwn extensions doctor for report-only extension diagnostics.
// ABOUTME: Surfaces Beads and Parallel setup gaps without mutating local state.

import { Option, UsageError } from "clipanion";
import { listExtensions } from "../../core/extensions/registry";
import { buildExtensionDoctorReport } from "../../core/extensions/doctor";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";

export class ExtensionsDoctorCommand extends BaseCommand {
  static override paths = [["extensions", "doctor"]];

  static override usage = BaseCommand.Usage({
    category: "Extensions",
    description: "Report extension issues without mutating anything. Reports on all extensions when no name is given.",
    details: `
      Inspects extension prerequisites and project state for setup drift. If no
      extension name is given, reports on all extensions. This command is
      read-only and never mutates files.

      For overall harness drift, see drwn doctor.
    `,
    examples: [
      ["Doctor all extensions", "drwn extensions doctor"],
      ["Doctor one extension as JSON", "drwn extensions doctor beads --json"],
    ],
  });

  extensionName = Option.String({ required: false });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const names = this.extensionName ? [this.extensionName] : listExtensions().map((extension) => extension.id);
    const reports = await Promise.all(
      names.map((name) =>
        buildExtensionDoctorReport({
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
          cwd: this.context.cwd,
          projectConfigPath: this.context.projectConfigPath,
          env: process.env,
          extensionName: name,
        }),
      ),
    );
    if (reports.some((report) => !report)) {
      throw new UsageError(`Unknown extension: ${this.extensionName}`);
    }
    const presentReports = reports.filter((report) => report !== null);

    if (this.json) {
      this.context.stdout.write(renderJson(this.extensionName ? presentReports[0] : presentReports));
      return 0;
    }

    this.context.stdout.write(
      renderTable(
        ["extension", "issues", "warnings"],
        presentReports.map((report) => [
          report.id,
          report.issues.length > 0 ? report.issues.join("; ") : "none",
          report.warnings.length > 0 ? report.warnings.join("; ") : "none",
        ]),
      ),
    );
    return 0;
  }
}
