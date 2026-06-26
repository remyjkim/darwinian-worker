// ABOUTME: Implements `drwn card source remove-memory` for editable card sources.
// ABOUTME: Removes memory declarations and optionally their bundled files.

import { Option } from "clipanion";
import { removeCardSourceMemory } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class CardSourceRemoveMemoryCommand extends BaseCommand {
  static override paths = [["card", "source", "remove-memory"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove memory content from an editable card source.",
    details: `
      Removes an entry from the selected card.json memory layer and deletes the
      bundled memory/<layer>/<entry>/ directory by default.
    `,
    examples: [["Remove memory content", "drwn card source remove-memory @your-handle/mind raw --layer l6"]],
  });

  cardName = Option.String({ required: true });
  entryName = Option.String({ required: true });

  layer = Option.String("--layer", { required: true, description: "Memory layer: l4, l5, or l6." });

  keepFiles = Option.Boolean("--keep-files", false, {
    description: "Keep the memory directory and remove only the manifest entry.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview source changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    let result;
    try {
      result = await removeCardSourceMemory({
        agentsDir: this.context.agentsDir,
        cardName: this.cardName,
        entryName: this.entryName,
        layer: this.layer,
        keepFiles: this.keepFiles,
        dryRun: this.dryRun,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return 0;
    }
    this.context.stdout.write(`${this.dryRun ? "Would remove" : "Removed"} memory ${this.entryName} from ${this.cardName}\n`);
    return 0;
  }
}
