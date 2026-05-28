// ABOUTME: Implements bgng store status for cards-era store inspection.
// ABOUTME: Reports store initialization and high-level inventory counts.

import { Option } from "clipanion";
import { getStoreStatus } from "../../core/migration";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";

export class StoreStatusCommand extends BaseCommand {
  static override paths = [["store", "status"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Show cards-era store status.",
    details: `
      Reports whether ~/.agents/bgng has been initialized as a cards-era store,
      its schema version, inventory counts, and whether a pre-cards layout is
      still present.
    `,
    examples: [
      ["Show store status", "bgng store status"],
      ["Show store status as JSON", "bgng store status --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const status = await getStoreStatus(this.context.agentsDir);
    if (this.json) {
      this.context.stdout.write(renderJson(status));
      return 0;
    }
    this.context.stdout.write(
      renderTable(
        ["field", "value"],
        [
          ["path", status.path],
          ["initialized", String(status.initialized)],
          ["schemaVersion", String(status.schemaVersion ?? "none")],
          ["cardCount", String(status.cardCount)],
          ["sourceCount", String(status.sourceCount)],
          ["skillBundleCount", String(status.skillBundleCount)],
          ["mcpServerCount", String(status.mcpServerCount)],
          ["legacyLayoutDetected", String(status.legacyLayoutDetected)],
        ],
      ),
    );
    return 0;
  }
}
