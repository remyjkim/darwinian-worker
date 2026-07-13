// ABOUTME: Implements `drwn card pin` for replacing one project card spec.
// ABOUTME: Useful for locking a project to an exact card version.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { commandMoved } from "./project-command";

export class CardPinCommand extends BaseCommand {
  static override paths = [["card", "pin"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Pin or replace a project card reference and update card.lock.",
    details: `
      Replaces the version constraint for one card by name, or adds it when the
      card is not already present. Exact versions are useful when a project
      needs reproducible behavior independent of newer local publishes.
    `,
    examples: [["Pin a card", "drwn card pin @your-handle/backend@1.0.0"]],
  });

  spec = Option.String({ required: true });

  write = Option.Boolean("--write", false, {
    description: "Run drwn write after updating project cards.",
  });

  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false, {
    description: "Resolve the card ref even when trustedSources.strict would reject it.",
  });

  async execute() {
    return commandMoved(this, "drwn pin <ref>");
  }
}
