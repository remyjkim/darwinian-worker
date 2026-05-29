// ABOUTME: Implements `drwn card list` for local card store inventory.
// ABOUTME: Keeps authors and consumers able to discover published cards.

import { Option } from "clipanion";
import { listCards } from "../../core/card-store";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";

export class CardListCommand extends BaseCommand {
  static override paths = [["card", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "List published cards in the local store.",
    details: `
      Lists cards under ~/.agents/bgng/cards and their published versions.
      Use --json when automation needs stable structured output.
    `,
    examples: [["List cards", "drwn card list"]],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const cards = await listCards(this.context.agentsDir);
    if (this.json) {
      this.context.stdout.write(renderJson(cards));
      return 0;
    }
    this.context.stdout.write(
      renderTable(
        ["name", "versions"],
        cards.map((card) => [card.name, card.versions.join(",") || "none"]),
      ),
    );
    return 0;
  }
}
