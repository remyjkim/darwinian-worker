// ABOUTME: Implements `drwn card source add-memory` for editable card sources.
// ABOUTME: Scaffolds layered memory content with explicit visibility metadata.

import { Option } from "clipanion";
import { addCardSourceMemory } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class CardSourceAddMemoryCommand extends BaseCommand {
  static override paths = [["card", "source", "add-memory"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Scaffold memory content in an editable card source.",
    details: `
      Creates memory/<layer>/<entry>/ content and appends the entry to the
      selected card.json memory layer with explicit visibility and format.
    `,
    examples: [
      ["Add JSONL memory", "drwn card source add-memory @your-handle/mind raw --layer l6 --visibility private --format jsonl"],
    ],
  });

  cardName = Option.String({ required: true });
  entryName = Option.String({ required: true });

  layer = Option.String("--layer", { required: true, description: "Memory layer: l4, l5, or l6." });

  visibility = Option.String("--visibility", { required: true, description: "Visibility: private, internal, or public." });

  format = Option.String("--format", "md", {
    description: "Memory file format: md, jsonl, or mixed.",
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
      result = await addCardSourceMemory({
        agentsDir: this.context.agentsDir,
        cardName: this.cardName,
        entryName: this.entryName,
        layer: this.layer,
        visibility: this.visibility,
        format: this.format,
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
    this.context.stdout.write(`${this.dryRun ? "Would add" : "Added"} memory ${this.entryName} to ${this.cardName}\n`);
    return 0;
  }
}
