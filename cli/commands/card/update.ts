// ABOUTME: Implements `drwn card update` for refreshing project card.lock.
// ABOUTME: Also exposes a top-level `drwn update` alias.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { commandMoved } from "./project-command";

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
    return commandMoved(this, "drwn update [name]");
  }
}
