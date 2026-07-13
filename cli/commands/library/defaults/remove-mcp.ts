// ABOUTME: Removes an MCP server from machine-wide defaults.
// ABOUTME: Leaves the built-in or library MCP definition available for future project use.

import { Option, UsageError } from "clipanion";
import { removeDefaultValue } from "../../../core/defaults";
import { readMachineConfig, writeMachineConfig } from "../../../core/card-store";
import { findLibraryMcpServer } from "../../../core/library";
import { resolveMachineConfigPath } from "../../../core/store-paths";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryDefaultsRemoveMcpCommand extends BaseCommand {
  static override paths = [["library", "defaults", "remove", "mcp"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Remove an MCP server from machine-wide defaults.",
    details: `
      Removes an MCP server from machine-wide defaults. This does not delete the
      server definition from the built-in registry or local MCP library, and it
      does not touch projects that explicitly added the server.
    `,
    examples: [
      ["Remove a default MCP server", "drwn library defaults remove mcp context7"],
      ["Preview removing a default MCP server", "drwn library defaults remove mcp context7 --dry-run"],
    ],
  });

  serverName = Option.String({ required: true });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview global default changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const server = await findLibraryMcpServer(this.context.repoRoot, this.serverName, this.context.agentsDir);
    if (!server) {
      throw new UsageError(`Unknown MCP server: ${this.serverName}`);
    }

    const path = resolveMachineConfigPath(this.context.agentsDir);
    const config = await readMachineConfig(this.context.agentsDir);
    const defaults = config.capabilities.mcpServers;
    const wasDefault = defaults.includes(this.serverName);
    config.capabilities.mcpServers = removeDefaultValue(defaults, this.serverName);

    if (!this.dryRun) {
      await writeMachineConfig(this.context.agentsDir, config);
    }

    const payload = {
      kind: "mcp",
      id: this.serverName,
      scope: "machine-explicit",
      action: wasDefault ? "removed" : "not-default",
      configPath: path,
      next: ["drwn write --scope machine --dry-run"],
    };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      [
        wasDefault
          ? `Removed ${this.serverName} from global default MCP servers.`
          : `${this.serverName} was not a global default MCP server.`,
        ...(this.dryRun ? [`Would update ${path}`] : [`Updated ${path}`]),
        "",
        "Next:",
        "  drwn write --scope machine --dry-run",
      ].join("\n") + "\n",
    );
    return 0;
  }
}
