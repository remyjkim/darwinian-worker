// ABOUTME: Implements `drwn card update` for refreshing project card.lock.
// ABOUTME: Also exposes a top-level `drwn update` alias.

import { Option } from "clipanion";
import { updateProjectCardLock } from "../../core/card-project";
import { BaseCommand } from "../base";
import { renderCardMutation, requireProjectRoot, runChainedWrite } from "./project-command";

export class CardUpdateCommand extends BaseCommand {
  static override paths = [["card", "update"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Refresh the current project's card.lock from config cards.",
    details: `
      Re-resolves every ref in .agents/drwn/config.json and writes a fresh
      card.lock. Use this after publishing newer local versions that satisfy
      the configured ranges.
    `,
    examples: [["Update card lockfile", "drwn card update"]],
  });

  write = Option.Boolean("--write", false, {
    description: "Run drwn write after updating project cards.",
  });

  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false, {
    description: "Resolve project card refs even when trustedSources.strict would reject them.",
  });

  async execute() {
    if (this.allowUntrustedSource) {
      this.context.stderr.write(`Warning: --allow-untrusted-source used for card update\n`);
    }
    const result = await updateProjectCardLock(requireProjectRoot(this), this.context.agentsDir, {
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

export class UpdateCommand extends CardUpdateCommand {
  static override paths = [["update"]];
}
