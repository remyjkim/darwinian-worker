// ABOUTME: Implements `drwn card remove` for dropping one card from project config.
// ABOUTME: Rewrites the lockfile after removal to avoid stale locked cards.

import { Option } from "clipanion";
import { removeProjectCard } from "../../core/card-project";
import { BaseCommand } from "../base";
import { renderCardMutation, requireProjectRoot, runChainedWrite } from "./project-command";

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
    examples: [["Remove a card", "drwn card remove @me/backend"]],
  });

  refOrName = Option.String({ required: true });

  write = Option.Boolean("--write", false, {
    description: "Run drwn write after updating project cards.",
  });

  async execute() {
    const result = await removeProjectCard(requireProjectRoot(this), this.context.agentsDir, this.refOrName);
    this.context.stdout.write(renderCardMutation(result));
    if (this.write) {
      return await runChainedWrite(this);
    }
    return 0;
  }
}
