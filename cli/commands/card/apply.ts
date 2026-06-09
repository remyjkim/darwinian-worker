// ABOUTME: Implements card selection replacement through `drwn card apply`.
// ABOUTME: Also exposes the top-level `drwn apply` alias.

import { Option } from "clipanion";
import { applyProjectCardSpecs } from "../../core/card-project";
import { BaseCommand } from "../base";
import { renderCardMutation, requireProjectRoot, runChainedWrite } from "./project-command";

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

  async execute() {
    if (this.allowUntrustedSource) {
      this.context.stderr.write(`Warning: --allow-untrusted-source used for card apply\n`);
    }
    const result = await applyProjectCardSpecs(requireProjectRoot(this), this.context.agentsDir, this.specs, {
      allowUntrustedSource: this.allowUntrustedSource,
      repoRoot: this.context.repoRoot,
      cwd: this.context.cwd,
    });
    this.context.stdout.write(renderCardMutation(result));
    if (this.write) {
      return await runChainedWrite(this);
    }
    return 0;
  }
}

export class ApplyCommand extends CardApplyCommand {
  static override paths = [["apply"]];
}
