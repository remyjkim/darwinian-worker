// ABOUTME: Implements the top-level `agents sync` command as a convenience wrapper over full sync behavior.
// ABOUTME: Mirrors the legacy sync-mcp entrypoint for easier migration while using the extracted core modules.

import { Option, UsageError } from "clipanion";
import { renderJson, renderSyncResult } from "../core/output";
import { syncRepository } from "../core/sync";
import { BaseCommand } from "./base";

export class SyncCommand extends BaseCommand {
  static override paths = [["sync"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Run both MCP and skill sync in one command.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  mcpOnly = Option.Boolean("--mcp-only", false, {
    description: "Sync only MCP configuration.",
  });

  skillsOnly = Option.Boolean("--skills-only", false, {
    description: "Sync only skills.",
  });

  target = Option.String("--target", {
    description: "Limit sync to one target.",
  });

  async execute() {
    if (this.mcpOnly && this.skillsOnly) {
      throw new UsageError("Use either --mcp-only or --skills-only, not both.");
    }
    if (this.target && this.target !== "claude" && this.target !== "codex" && this.target !== "cursor") {
      throw new UsageError(`Unsupported target: ${this.target}`);
    }

    const result = await syncRepository({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      dryRun: this.dryRun,
      mcpOnly: this.mcpOnly,
      skillsOnly: this.skillsOnly,
      target: this.target as "claude" | "codex" | "cursor" | undefined,
    });

    this.context.stdout.write(this.json ? renderJson(result) : renderSyncResult(result));
    return 0;
  }
}
