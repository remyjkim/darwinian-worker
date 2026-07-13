// ABOUTME: Implements `drwn card detach` for clearing all project card selections.
// ABOUTME: Leaves an empty lockfile so downstream tooling sees the project as detached.

import { Option } from "clipanion";
import { detachProjectCards } from "../../core/card-project";
import { BaseCommand } from "../base";
import { renderCardMutation, requireProjectRoot, runChainedWrite } from "./project-command";

export class CardDetachCommand extends BaseCommand {
  static override paths = [["card", "detach"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove all cards from the current project and update card.lock.",
    details: `
      Clears the project's cards array while preserving explicit project
      overlay fields such as skills, servers, extensions, and targets.
    `,
    examples: [["Detach from cards", "drwn card detach"]],
  });

  write = Option.Boolean("--write", false, {
    description: "Run drwn write after updating project cards.",
  });

  async execute() {
    const result = await detachProjectCards(requireProjectRoot(this), this.context.agentsDir);
    this.context.stdout.write(renderCardMutation(result));
    if (this.write) {
      return await runChainedWrite(this);
    }
    return 0;
  }
}
