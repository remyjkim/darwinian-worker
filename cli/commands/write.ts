// ABOUTME: Implements the primary `drwn write` command over the materialization engine.
// ABOUTME: Provides the one-way operator vocabulary for writing effective state downstream.

import { Option, UsageError } from "clipanion";
import { renderJson, renderSyncResult } from "../core/output";
import { syncRepository } from "../core/sync";
import { BaseCommand } from "./base";

export class WriteCommand extends BaseCommand {
  static override paths = [["write"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Write effective drwn config to downstream local agent tools.",
    details: `
      Reads the effective config from machine defaults, project overlays, and
      extension-derived settings, then materializes it into enabled downstream
      targets such as Claude, Codex, and Cursor.

      Use --dry-run to preview planned changes. Use --mcp-only or --skills-only
      to limit materialization to one surface. Use --target to write one target.
      Use --root to write machine defaults to user-scope tool configs even when
      running from inside a drwn-managed project.
    `,
    examples: [
      ["Preview all writes", "drwn write --dry-run"],
      ["Preview user-scope writes", "drwn write --root --dry-run"],
      ["Write only MCP configuration", "drwn write --mcp-only"],
      ["Write only to Claude", "drwn write --target=claude"],
    ],
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview writes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  mcpOnly = Option.Boolean("--mcp-only", false, {
    description: "Write only MCP configuration.",
  });

  skillsOnly = Option.Boolean("--skills-only", false, {
    description: "Write only skills.",
  });

  target = Option.String("--target", {
    description: "Limit write to one target.",
  });

  force = Option.Boolean("--force", false, {
    description: "Overwrite drift in drwn-managed regions.",
  });

  root = Option.Boolean("--root", false, {
    description: "Write machine defaults to user-scope tool configs and ignore project config.",
  });

  user = Option.Boolean("--user", false, {
    description: "Alias for --root.",
  });

  strictHooks = Option.Boolean("--strict-hooks", false, {
    description: "Fail when card hooks are present but missing valid hook consent.",
  });

  async execute() {
    if (this.mcpOnly && this.skillsOnly) {
      throw new UsageError("Use either --mcp-only or --skills-only, not both.");
    }
    if (this.root && this.user) {
      throw new UsageError("Use either --root or --user, not both.");
    }
    if (this.target && this.target !== "claude" && this.target !== "codex" && this.target !== "cursor") {
      throw new UsageError(`Unsupported target: ${this.target}`);
    }

    let result;
    try {
      result = await syncRepository({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        cwd: this.context.cwd,
        dryRun: this.dryRun,
        mcpOnly: this.mcpOnly,
        skillsOnly: this.skillsOnly,
        target: this.target as "claude" | "codex" | "cursor" | undefined,
        force: this.force,
        strictHooks: this.strictHooks,
        forceMachineScope: this.root || this.user,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }

    this.context.stdout.write(this.json ? renderJson(result) : renderSyncResult(result));
    return 0;
  }
}
