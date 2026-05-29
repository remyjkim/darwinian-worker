// ABOUTME: Implements `drwn card show` for inspecting a resolved card version.
// ABOUTME: Supports both human and JSON output for published card metadata.

import { Option } from "clipanion";
import { resolveCard } from "../../core/card-store";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";

export class CardShowCommand extends BaseCommand {
  static override paths = [["card", "show"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Show a published card version resolved from a name or range.",
    details: `
      Resolves the requested card ref against the local store and prints the
      exact version, store path, requested range, and integrity hash.
    `,
    examples: [
      ["Show an exact card version", "drwn card show @me/backend@1.0.0"],
      ["Show the latest satisfying version", "drwn card show @me/backend@^1.0.0"],
    ],
  });

  ref = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const card = await resolveCard(this.context.agentsDir, this.ref);
    if (this.json) {
      this.context.stdout.write(renderJson(card));
      return 0;
    }
    this.context.stdout.write(
      renderTable(
        ["field", "value"],
        [
          ["name", card.name],
          ["version", card.version],
          ["requested", card.requested],
          ["path", card.dir],
          ["integrity", card.integrity],
        ],
      ),
    );
    return 0;
  }
}
