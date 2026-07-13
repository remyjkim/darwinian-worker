// ABOUTME: Implements `drwn mcp list` for inspecting harness MCP server state.
// ABOUTME: Surfaces whether each canonical server is active under the current config and target setup.

import { Option } from "clipanion";
import { buildEffectiveState } from "../../../cli/core/effective-state";
import { renderJson, renderTable } from "../../../cli/core/output";
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
      ["List MCP server state", "drwn mcp list"],
      ["List MCP server state as JSON", "drwn mcp list --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const state = await buildEffectiveState({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      cwd: this.context.cwd,
    });
    const targetSummary = Object.entries(state.effectiveConfig.targets)
      .filter(([, target]) => target.enabled)
      .map(([name]) => name)
      .join(",");

    const rows = Object.entries(state.effectiveRegistry.servers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, server]) => ({
        name,
        transport: server.transport,
        active: Object.hasOwn(state.activeServers, name),
        targets: Object.hasOwn(state.activeServers, name) ? targetSummary : "",
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
