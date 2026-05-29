// ABOUTME: Implements `drwn card deprecate` for marking local card versions as deprecated.
// ABOUTME: Stores deprecation metadata without mutating immutable version contents.

import { Option } from "clipanion";
import { deprecateCardVersion } from "../../core/card-store";
import { BaseCommand } from "../base";

export class CardDeprecateCommand extends BaseCommand {
  static override paths = [["card", "deprecate"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Mark a published card version as deprecated.",
    details: `
      Records deprecation metadata in versions.json without mutating the
      immutable published card directory.
    `,
    examples: [["Deprecate a version", "drwn card deprecate @me/backend@1.0.0 --message replaced"]],
  });

  ref = Option.String({ required: true });

  message = Option.String("--message", "deprecated", {
    description: "Deprecation reason.",
  });

  async execute() {
    const card = await deprecateCardVersion(this.context.agentsDir, this.ref, this.message);
    this.context.stdout.write(`Deprecated ${card.name}@${card.version}: ${this.message}\n`);
    return 0;
  }
}
