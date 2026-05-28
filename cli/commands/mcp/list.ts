// ABOUTME: Implements `bgng mcp list` for inspecting harness MCP server state.
// ABOUTME: Surfaces whether each canonical server is active under the current config and target setup.

import { Option } from "clipanion";
import { loadConfig } from "../../../cli/core/config";
import { mergeUserMcpLibrary } from "../../../cli/core/defaults";
import { loadMcpLibrary } from "../../../cli/core/mcp-library";
import { buildActiveServers } from "../../../cli/core/mcp";
import { renderJson, renderTable } from "../../../cli/core/output";
import { loadProjectConfig, mergeProjectConfig } from "../../../cli/core/project";
import { loadRegistry } from "../../../cli/core/registry";
import { loadEffectiveConfig } from "../../../cli/core/user-config";
import { BaseCommand } from "../base";

export class McpListCommand extends BaseCommand {
  static override paths = [["mcp", "list"]];

  static override usage = BaseCommand.Usage({
    category: "MCP",
    description: "List harness MCP servers and their current active state. Project-aware when run inside a configured repo.",
    details: `
      Lists MCP servers from the built-in registry merged with the local user
      MCP library, then marks which servers are active in the effective config.
      Project-aware output includes project overlay and extension-derived MCP
      state when run inside a configured repo.

      This command is read-only.
    `,
    examples: [
      ["List MCP server state", "bgng mcp list"],
      ["List MCP server state as JSON", "bgng mcp list --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const [repoConfig, builtInRegistry, userMcpLibrary] = await Promise.all([
      loadConfig(this.context.repoRoot),
      loadRegistry(this.context.repoRoot),
      loadMcpLibrary(this.context.agentsDir),
    ]);
    const registry = mergeUserMcpLibrary(builtInRegistry, userMcpLibrary);
    const { config } = await loadEffectiveConfig(repoConfig, this.context.agentsDir);
    let effectiveConfig = config;
    let effectiveRegistry = registry;
    if (this.context.projectConfigPath) {
      const merged = mergeProjectConfig(config, registry, await loadProjectConfig(this.context.projectConfigPath));
      effectiveConfig = merged.config;
      effectiveRegistry = merged.registry;
    }

    const active = buildActiveServers(effectiveRegistry, effectiveConfig);
    const targetSummary = Object.entries(effectiveConfig.targets)
      .filter(([, target]) => target.enabled)
      .map(([name]) => name)
      .join(",");

    const rows = Object.entries(effectiveRegistry.servers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, server]) => ({
        name,
        transport: server.transport,
        active: Object.hasOwn(active, name),
        targets: Object.hasOwn(active, name) ? targetSummary : "",
      }));

    if (this.json) {
      this.context.stdout.write(renderJson(rows));
      return 0;
    }

    this.context.stdout.write(
      renderTable(
        ["name", "transport", "active", "targets"],
        rows.map((row) => [row.name, row.transport, row.active ? "yes" : "no", row.targets]),
      ),
    );
    return 0;
  }
}
