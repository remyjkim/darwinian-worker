// ABOUTME: Implements `drwn card publish` for immutable local card versions.
// ABOUTME: Refuses overwrites so lockfiles can trust published versions.

import { Option } from "clipanion";
import { publishCard } from "../../core/card-store";
import { BaseCommand } from "../base";

export class CardPublishCommand extends BaseCommand {
  static override paths = [["card", "publish"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Publish a card source into the Git-backed local card store.",
    details: `
      Validates card.json and package.json when present, then commits the source
      into the card's bare repo under ~/.agents/drwn/cards/ and tags the manifest
      version. Existing versions are never overwritten.
    `,
    examples: [["Publish a card", "drwn card publish @your-handle/backend"]],
  });

  name = Option.String({ required: true });

  async execute() {
    let published;
    try {
      published = await publishCard(this.context.agentsDir, this.name);
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    this.context.stdout.write(`Published ${published.name}@${published.version}: ${published.versionDir}\n`);
    return 0;
  }
}
