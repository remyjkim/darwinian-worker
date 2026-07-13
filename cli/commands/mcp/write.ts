// ABOUTME: Implements `drwn mcp write` as the MCP-scoped alias for top-level write.
// ABOUTME: Keeps advanced MCP users in the MCP namespace while sharing the materialization engine.

import { Option, UsageError } from "clipanion";
import { AmbientMcpCollisionError } from "../../core/ambient-policy";
import { renderJson, renderSyncResult } from "../../core/output";
import { syncRepository } from "../../core/sync";
import { isTargetName } from "../../core/targets";
import { BaseCommand } from "../base";

export class McpWriteCommand extends BaseCommand {
  static override paths = [["mcp", "write"]];

  static override usage = BaseCommand.Usage({
    category: "MCP",
    description: "Write effective MCP configuration into enabled targets.",
    details: `
      Writes only the effective MCP configuration into enabled downstream
      targets. This is equivalent to drwn write --mcp-only and shares the same
      materialization engine.

      Use --dry-run to preview changes. Use --target to write one target.
    `,
    examples: [
      ["Preview MCP writes", "drwn mcp write --dry-run"],
      ["Write MCP config to Claude only", "drwn mcp write --target=claude"],
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
    if (this.target && !isTargetName(this.target)) {
      throw new UsageError(`Unsupported target: ${this.target}`);
    }

    try {
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
    } catch (error) {
      this.context.stderr.write(
        this.json && error instanceof AmbientMcpCollisionError
          ? renderJson(error.toJSON())
          : `${error instanceof Error ? error.message : String(error)}\n`,
      );
      return 1;
    }
  }
}
