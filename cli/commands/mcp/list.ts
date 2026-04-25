// ABOUTME: Implements the `agents mcp list` command for inspecting canonical MCP server state.
// ABOUTME: Surfaces whether each canonical server is active under the current config and target setup.

import { Option } from "clipanion";
import { loadConfig } from "../../../cli/core/config";
import { buildActiveServers } from "../../../cli/core/mcp";
import { renderJson, renderTable } from "../../../cli/core/output";
import { loadRegistry } from "../../../cli/core/registry";
import { BaseCommand } from "../base";

export class McpListCommand extends BaseCommand {
  static override paths = [["mcp", "list"]];

  static override usage = BaseCommand.Usage({
    category: "MCP",
    description: "List canonical MCP servers and their current active state.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const [config, registry] = await Promise.all([
      loadConfig(this.context.repoRoot),
      loadRegistry(this.context.repoRoot),
    ]);
    const active = buildActiveServers(registry, config);
    const targetSummary = Object.entries(config.targets)
      .filter(([, target]) => target.enabled)
      .map(([name]) => name)
      .join(",");

    const rows = Object.entries(registry.servers)
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
