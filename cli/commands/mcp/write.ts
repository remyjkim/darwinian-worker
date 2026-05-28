// ABOUTME: Implements `bgng mcp write` as the MCP-scoped alias for top-level write.
// ABOUTME: Keeps advanced MCP users in the MCP namespace while sharing the materialization engine.

import { Option, UsageError } from "clipanion";
import { renderJson, renderSyncResult } from "../../core/output";
import { syncRepository } from "../../core/sync";
import { BaseCommand } from "../base";

export class McpWriteCommand extends BaseCommand {
  static override paths = [["mcp", "write"]];

  static override usage = BaseCommand.Usage({
    category: "MCP",
    description: "Write effective MCP configuration into enabled targets.",
    details: `
      Writes only the effective MCP configuration into enabled downstream
      targets. This is equivalent to bgng write --mcp-only and shares the same
      materialization engine.

      Use --dry-run to preview changes. Use --target to write one target.
    `,
    examples: [
      ["Preview MCP writes", "bgng mcp write --dry-run"],
      ["Write MCP config to Claude only", "bgng mcp write --target=claude"],
    ],
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  target = Option.String("--target", {
    description: "Write only one target.",
  });

  async execute() {
    if (this.target && this.target !== "claude" && this.target !== "codex" && this.target !== "cursor") {
      throw new UsageError(`Unsupported target: ${this.target}`);
    }

    const result = await syncRepository({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      cwd: this.context.cwd,
      dryRun: this.dryRun,
      mcpOnly: true,
      target: this.target as "claude" | "codex" | "cursor" | undefined,
    });

    this.context.stdout.write(this.json ? renderJson(result) : renderSyncResult(result));
    return 0;
  }
}
