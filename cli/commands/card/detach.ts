// ABOUTME: Implements `drwn card detach` for clearing all project card selections.
// ABOUTME: Leaves an empty lockfile so downstream tooling sees the project as detached.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { commandMoved } from "./project-command";

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
    return commandMoved(this, "drwn apply --none");
  }
}
