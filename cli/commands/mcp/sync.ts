// ABOUTME: Implements the `agents mcp sync` command using the extracted MCP sync core.
// ABOUTME: Preserves the current target selection and dry-run behavior while exposing it through Clipanion.

import { Option, UsageError } from "clipanion";
import { loadConfig } from "../../../cli/core/config";
import { buildActiveServers } from "../../../cli/core/mcp";
import { renderJson, renderSyncResult } from "../../../cli/core/output";
import { normalizeSyncPathOptions } from "../../../cli/core/paths";
import { loadRegistry } from "../../../cli/core/registry";
import { syncMcp } from "../../../cli/core/sync";
import { BaseCommand } from "../base";

export class McpSyncCommand extends BaseCommand {
  static override paths = [["mcp", "sync"]];

  static override usage = BaseCommand.Usage({
    category: "MCP",
    description: "Sync active canonical MCP servers into enabled targets.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  target = Option.String("--target", {
    description: "Sync only one target.",
  });

  async execute() {
    if (this.target && this.target !== "claude" && this.target !== "codex" && this.target !== "cursor") {
      throw new UsageError(`Unsupported target: ${this.target}`);
    }

    const [config, registry] = await Promise.all([
      loadConfig(this.context.repoRoot),
      loadRegistry(this.context.repoRoot),
    ]);
    const result = await syncMcp(
      normalizeSyncPathOptions(
        {
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
          homeDir: this.context.homeDir,
          dryRun: this.dryRun,
          target: this.target as "claude" | "codex" | "cursor" | undefined,
        },
        import.meta.path,
      ),
      config,
      buildActiveServers(registry, config),
    );

    this.context.stdout.write(this.json ? renderJson(result) : renderSyncResult(result));
    return 0;
  }
}
