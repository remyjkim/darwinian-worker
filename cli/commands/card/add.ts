// ABOUTME: Implements `drwn card add` for appending one card to project config.
// ABOUTME: Resolves immediately so card.lock stays aligned with config changes.

import { Option } from "clipanion";
import { addProjectCardSpec } from "../../core/card-project";
import { BaseCommand } from "../base";
import { renderCardMutation, requireProjectRoot, runChainedWrite } from "./project-command";

export class CardAddCommand extends BaseCommand {
  static override paths = [["card", "add"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Add a card to the current project and update card.lock.",
    details: `
      Appends one card ref to the project cards array and refreshes card.lock.
      Duplicate card names are rejected so one project has a single constraint
      per card.
    `,
    examples: [["Add a card", "drwn card add @me/backend@^1.0.0"]],
  });

  spec = Option.String({ required: true });

  write = Option.Boolean("--write", false, {
    description: "Run drwn write after updating project cards.",
  });

  async execute() {
    const result = await addProjectCardSpec(requireProjectRoot(this), this.context.agentsDir, this.spec);
    this.context.stdout.write(renderCardMutation(result));
    if (this.write) {
      return await runChainedWrite(this);
    }
    return 0;
  }
}
