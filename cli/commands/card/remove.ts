// ABOUTME: Implements `drwn card remove` for dropping one card from project config.
// ABOUTME: Rewrites the lockfile after removal to avoid stale locked cards.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { commandMoved } from "./project-command";

export class CardRemoveCommand extends BaseCommand {
  static override paths = [["card", "remove"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove a card from the current project and update card.lock.",
    details: `
      Removes a card by name from the project cards array and refreshes
      card.lock. Unknown card names are rejected so scripts catch stale
      assumptions.
    `,
    examples: [["Remove a card", "drwn card remove @your-handle/backend"]],
  });

  refOrName = Option.String({ required: true });

  write = Option.Boolean("--write", false, {
    description: "Run drwn write after updating project cards.",
  });

  async execute() {
    return commandMoved(this, "drwn remove <name>");
  }
}
