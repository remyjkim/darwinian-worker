// ABOUTME: Implements card selection replacement through `drwn card apply`.
// ABOUTME: Also exposes the top-level `drwn apply` alias.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { commandMoved } from "./project-command";

export class CardApplyCommand extends BaseCommand {
  static override paths = [["card", "apply"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Replace the current project's card set and write card.lock.",
    details: `
      Replaces the project's cards array with the provided refs, resolves them
      against the local card store or file sources, and writes card.lock.
      Use --write to materialize the resulting effective state immediately.
    `,
    examples: [["Apply a card range", "drwn card apply @your-handle/backend@^1.0.0"]],
  });

  specs = Option.Rest({ required: 1 });

  write = Option.Boolean("--write", false, {
    description: "Run drwn write after updating project cards.",
  });

  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false, {
    description: "Resolve card refs even when trustedSources.strict would reject them.",
  });

  acceptSuccessor = Option.Boolean("--accept-successor", false, {
    description: "Acknowledge a cross-scope successor pointer from card metadata.",
  });

  async execute() {
    return commandMoved(this, "drwn apply <refs...>");
  }
}
