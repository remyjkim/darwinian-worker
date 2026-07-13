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
    examples: [["Add a card", "drwn card add @your-handle/backend@^1.0.0"]],
  });

  spec = Option.String({ required: true });

  write = Option.Boolean("--write", false, {
    description: "Run drwn write after updating project cards.",
  });

  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false, {
    description: "Resolve the card ref even when trustedSources.strict would reject it.",
  });

  async execute() {
    if (this.allowUntrustedSource) {
      this.context.stderr.write(`Warning: --allow-untrusted-source used for ${this.spec}\n`);
    }
    const result = await addProjectCardSpec(requireProjectRoot(this), this.context.agentsDir, this.spec, {
      allowUntrustedSource: this.allowUntrustedSource,
      repoRoot: this.context.repoRoot,
      cwd: this.context.cwd,
    });
    for (const card of result.locked) {
      if (card.hooks.length > 0 && !card.hookConsent) {
        this.context.stderr.write(
          `Warning: ${card.name}@${card.version} declares hooks but has no hook consent. Run drwn card trust ${card.name} --hooks before drwn write materializes them.\n`,
        );
      }
    }
    this.context.stdout.write(renderCardMutation(result));
    if (this.write) {
      return await runChainedWrite(this);
    }
    return 0;
  }
}

export class AddCardCommand extends CardAddCommand {
  static override paths = [["add"]];
}
