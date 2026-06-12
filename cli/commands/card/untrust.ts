// ABOUTME: Implements removal of explicit hook consent for locked Harness Cards.
// ABOUTME: Lets users stop materializing a card's hook policies without removing the card.

import { Option, UsageError } from "clipanion";
import { clearHookConsent } from "../../core/card-project";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "./project-command";

export class CardUntrustCommand extends BaseCommand {
  static override paths = [["card", "untrust"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove hook trust from a locked card.",
    details: `
      Clears hook consent from card.lock. The card can remain installed, but
      drwn write will skip its hook policies until consent is recorded again.
    `,
    examples: [["Untrust card hooks", "drwn card untrust @your-handle/backend --hooks"]],
  });

  spec = Option.String({ required: true });

  hooks = Option.Boolean("--hooks", false, {
    description: "Clear hook execution consent for this card.",
  });

  async execute() {
    if (!this.hooks) {
      throw new UsageError("Specify --hooks to clear hook consent.");
    }
    let result;
    try {
      result = await clearHookConsent(requireProjectRoot(this), this.spec);
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    this.context.stdout.write(`Untrusted hooks for ${result.card.name}@${result.card.version}\nWrote ${result.lockPath}\n`);
    return 0;
  }
}
