// ABOUTME: Removes an MCP server from machine-wide defaults.
// ABOUTME: Leaves the built-in or library MCP definition available for future project use.

import { Option, UsageError } from "clipanion";
import { loadConfig } from "../../../core/config";
import { removeDefaultValue } from "../../../core/defaults";
import { findLibraryMcpServer } from "../../../core/library";
import { loadRegistry } from "../../../core/registry";
import { loadOrInitializeUserConfig, saveUserConfig } from "../../../core/user-config";
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
      ["Remove a default MCP server", "bgng library defaults remove mcp context7"],
      ["Preview removing a default MCP server", "bgng library defaults remove mcp context7 --dry-run"],
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
    const wasDefault = config.defaults.mcpServers?.includes(this.serverName) === true;
    config.defaults.mcpServers = removeDefaultValue(config.defaults.mcpServers, this.serverName);

    if (!this.dryRun) {
      await saveUserConfig(path, config);
    }

    const payload = {
      kind: "mcp",
      id: this.serverName,
      scope: "global-default",
      action: wasDefault ? "removed" : "not-default",
      configPath: path,
      next: ["bgng write --dry-run"],
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
        "  bgng write --dry-run",
      ].join("\n") + "\n",
    );
    return 0;
  }
}
