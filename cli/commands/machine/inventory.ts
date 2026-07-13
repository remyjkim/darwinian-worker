// ABOUTME: Exposes dry-run inventory garbage collection under drwn machine.
// ABOUTME: Requires an explicit prune flag before removing approved garbage.

import { Option } from "clipanion";
import { planInventoryGc, pruneInventoryGc } from "../../core/inventory-gc";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class MachineInventoryGcCommand extends BaseCommand {
  static override paths = [["machine", "inventory", "gc"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Plan or prune scoped standalone inventory garbage.",
    details: `
      Runs as a dry-run by default. It may prune only old drwn temporary
      siblings, completed inventory tombstones, and old inactive immutable
      package versions; current inventory is never removed for having zero
      known references.
    `,
    examples: [
      ["Plan inventory GC", "drwn machine inventory gc --json"],
      ["Prune eligible inventory garbage", "drwn machine inventory gc --prune"],
    ],
  });

  prune = Option.Boolean("--prune", false);
  json = Option.Boolean("--json", false);

  async execute() {
    const result = this.prune
      ? await pruneInventoryGc(this.context.agentsDir)
      : await planInventoryGc(this.context.agentsDir);
    if (this.json) {
      this.context.stdout.write(renderJson(result));
    } else {
      this.context.stdout.write(
        `${result.mode === "prune" ? "Pruned" : "Dry-run:"} ${result.eligible.length} eligible, ${result.kept.length} kept, ${result.removed.length} removed.\n`,
      );
    }
    return 0;
  }
}
