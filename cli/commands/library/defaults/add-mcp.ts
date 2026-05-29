// ABOUTME: Adds an MCP server to machine-wide defaults.
// ABOUTME: Changes global activation policy without editing project config.

import { Option, UsageError } from "clipanion";
import { loadConfig } from "../../../core/config";
import { addDefaultValue } from "../../../core/defaults";
import { findLibraryMcpServer } from "../../../core/library";
import { loadRegistry } from "../../../core/registry";
import { loadOrInitializeUserConfig, saveUserConfig } from "../../../core/user-config";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryDefaultsAddMcpCommand extends BaseCommand {
  static override paths = [["library", "defaults", "add", "mcp"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Add an MCP server to machine-wide defaults. Re-adding an already-default server is a safe no-op.",
    details: `
      Promotes a built-in or local-library MCP server to machine-wide defaults.
      Re-adding a server that is already a default is a safe no-op.

      Use --dry-run to preview the default config change without writing it.
    `,
    examples: [
      ["Add a default MCP server", "drwn library defaults add mcp context7"],
      ["Preview a default change", "drwn library defaults add mcp context7 --dry-run"],
      ["Add a default as JSON", "drwn library defaults add mcp context7 --json"],
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
    const [repoConfig, registry] = await Promise.all([loadConfig(this.context.repoRoot), loadRegistry(this.context.repoRoot)]);
    const server = await findLibraryMcpServer(this.context.repoRoot, this.serverName, this.context.agentsDir);
    if (!server) {
      throw new UsageError(`Unknown MCP server: ${this.serverName}`);
    }

    const { path, config } = await loadOrInitializeUserConfig({
      repoConfig,
      registry,
      agentsDir: this.context.agentsDir,
    });
    config.defaults ??= {};
    const alreadyDefault = config.defaults.mcpServers?.includes(this.serverName) === true;
    config.defaults.mcpServers = addDefaultValue(config.defaults.mcpServers, this.serverName);

    if (!this.dryRun) {
      await saveUserConfig(path, config);
    }

    const payload = {
      kind: "mcp",
      id: this.serverName,
      scope: "global-default",
      action: alreadyDefault ? "already-default" : "added",
      configPath: path,
      next: ["drwn write --dry-run"],
    };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      [
        alreadyDefault
          ? `${this.serverName} is already a global default MCP server.`
          : `Added ${this.serverName} as a global default MCP server.`,
        ...(this.dryRun ? [`Would update ${path}`] : [`Updated ${path}`]),
        "",
        "Next:",
        "  drwn write --dry-run",
      ].join("\n") + "\n",
    );
    return 0;
  }
}
