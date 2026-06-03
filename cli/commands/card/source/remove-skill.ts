// ABOUTME: Implements `drwn card source remove-skill` for editable card sources.
// ABOUTME: Removes bundled skill content and updates card.json semantically.

import { Option } from "clipanion";
import { removeCardSourceSkill } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class CardSourceRemoveSkillCommand extends BaseCommand {
  static override paths = [["card", "source", "remove-skill"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove a bundled skill from an editable card source.",
    details: `
      Removes a skill from card.json skills.include and deletes the bundled
      skills/<name>/ directory by default. Use --keep-files when you only want
      to remove the manifest declaration.
    `,
    examples: [
      ["Remove a bundled skill", "drwn card source remove-skill @me/backend alpha"],
      ["Keep files while removing the manifest entry", "drwn card source remove-skill @me/backend alpha --keep-files"],
    ],
  });

  cardName = Option.String({ required: true });
  skillName = Option.String({ required: true });

  keepFiles = Option.Boolean("--keep-files", false, {
    description: "Keep the bundled skill directory and remove only the manifest entry.",
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
      result = await removeCardSourceSkill({
        agentsDir: this.context.agentsDir,
        cardName: this.cardName,
        skillName: this.skillName,
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
    this.context.stdout.write(`${this.dryRun ? "Would remove" : "Removed"} ${this.skillName} from ${this.cardName}\n`);
    return 0;
  }
}
