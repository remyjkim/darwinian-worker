// ABOUTME: Implements `drwn worker mind pool retire`: destroys a pool entry across every placement.
// ABOUTME: Irreversible in a history-less store, so it is human-only: confirmation or an explicit --yes is required.

import { Option } from "clipanion";
import { confirmDestructive } from "../../../core/confirm";
import { createMindDbClient } from "../../../core/mind-store/client";
import { resolveBgdbConfig } from "../../../core/mind-store/config";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class WorkerMindPoolRetireCommand extends BaseCommand {
  static override paths = [["worker", "mind", "pool", "retire"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Retire a memory-pool entry, deleting it from the pool and every mind that references it.",
    details: `
      This is delete-everywhere: the entry and all of its placements are removed
      and cannot be recovered. Agents must never run this; use mind-forget
      (unplace) to remove an entry from one mind's view instead.
    `,
    examples: [["Retire a pool entry", "drwn worker mind pool retire /pool/l5/2026-07-07/1403-….jsonl --yes"]],
  });

  poolPath = Option.String({ required: true });

  yes = Option.Boolean("--yes", false, { description: "Skip the interactive confirmation." });

  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    try {
      if (!this.poolPath.startsWith("/pool/")) {
        this.context.stderr.write(`Only pool paths can be retired (got: ${this.poolPath}). Use mind-forget/unplace for view paths.\n`);
        return 1;
      }
      const client = createMindDbClient(resolveBgdbConfig());
      const stat = await client.stat(this.poolPath);
      if (!stat) {
        this.context.stderr.write(`Pool entry not found: ${this.poolPath}\n`);
        return 1;
      }
      const placements = await client.placements(stat.inodeId);
      const confirmed = await confirmDestructive(
        `Retire ${this.poolPath}? This deletes the entry and ${placements.length - 1} view placement(s) permanently.`,
        this.yes,
        { stdin: process.stdin, stdout: process.stdout },
      );
      if (!confirmed) {
        this.context.stderr.write("Refusing to retire without confirmation. Re-run with --yes to proceed non-interactively.\n");
        return 1;
      }
      await client.delete(this.poolPath, { everywhere: true });
      if (this.json) {
        this.context.stdout.write(renderJson({ retired: this.poolPath, removedPlacements: placements }));
        return 0;
      }
      this.context.stdout.write(`Retired ${this.poolPath} (${placements.length} placement(s) removed).\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
