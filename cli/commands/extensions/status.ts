// ABOUTME: Implements drwn extensions status for non-mutating extension health inspection.
// ABOUTME: Reports local command, skill, MCP, and project state for supported extensions.

import { Option, UsageError } from "clipanion";
import { listExtensions } from "../../core/extensions/registry";
import { buildAllExtensionStatuses, buildExtensionStatus } from "../../core/extensions/status";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";

export class ExtensionsStatusCommand extends BaseCommand {
  static override paths = [["extensions", "status"]];

  static override usage = BaseCommand.Usage({
    category: "Extensions",
    description: "Show non-mutating extension status.",
    details: `
      Shows whether supported extensions are enabled in the current project and
      whether their expected commands, skills, and MCP servers are present.
      Reports on all extensions if no name is given.

      This command is read-only.
    `,
    examples: [
      ["Show all extension statuses", "drwn extensions status"],
      ["Show one extension as JSON", "drwn extensions status markitdown --json"],
    ],
  });

  extensionName = Option.String({ required: false });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const base = {
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      cwd: this.context.cwd,
      projectConfigPath: this.context.projectConfigPath,
      env: process.env,
    };
    const statuses = this.extensionName
      ? [await buildExtensionStatus({ ...base, extensionName: this.extensionName })]
      : await buildAllExtensionStatuses(base);
    if (statuses.some((status) => !status)) {
      throw new UsageError(`Unknown extension: ${this.extensionName}`);
    }
    const presentStatuses = statuses.filter((status) => status !== null);

    if (this.json) {
      this.context.stdout.write(renderJson(this.extensionName ? presentStatuses[0] : presentStatuses));
      return 0;
    }

    const knownIds = new Set(listExtensions().map((extension) => extension.id));
    if (this.extensionName && !knownIds.has(this.extensionName)) {
      throw new UsageError(`Unknown extension: ${this.extensionName}`);
    }

    this.context.stdout.write(
      renderTable(
        ["extension", "available", "scope", "notes"],
        presentStatuses.map((status) => [
          status.id,
          status.available ? "yes" : "no",
          status.scope,
          [
            ...status.commands.filter((command) => !command.available && command.required).map((command) => `missing ${command.name}`),
            ...(status.id === "beads" && status.project?.beadsDirExists === false ? [".beads absent"] : []),
            ...(status.project?.extensionConfigured ? ["project configured"] : []),
            ...(status.id === "parallel" ? [status.mcpServers.some((server) => server.active) ? "mcp enabled" : "mcp disabled"] : []),
          ].join("; ") || "ok",
        ]),
      ),
    );
    return 0;
  }
}
