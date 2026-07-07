// ABOUTME: Implements drwn card unlink for removing machine-local dev overrides.
// ABOUTME: Clears entries from config.local.json without touching committed config.

import { Option, UsageError } from "clipanion";
import { loadConfigLocal, writeConfigLocal } from "../../core/config-local";
import { BaseCommand } from "../base";
import { requireProjectRoot, runChainedWrite } from "./project-command";

export class CardUnlinkCommand extends BaseCommand {
  static override paths = [["card", "unlink"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove dev-linked overrides from config.local.json.",
    details: `
      Clears one override or all overrides from the machine-local overlay file.
      Use --write to rematerialize from vendored pins after unlinking.
    `,
    examples: [
      ["Unlink one card", "drwn card unlink @me/operator"],
      ["Unlink all overrides", "drwn card unlink --all"],
    ],
  });

  card = Option.String({ required: false });
  all = Option.Boolean("--all", false, { description: "Remove every override." });
  write = Option.Boolean("--write", false, { description: "Run drwn write after unlinking." });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    const local = (await loadConfigLocal(projectRoot)) ?? {};
    if (this.all) {
      delete local.overrides;
    } else if (this.card) {
      if (local.overrides?.[this.card]) {
        delete local.overrides[this.card];
      }
      if (local.overrides && Object.keys(local.overrides).length === 0) {
        delete local.overrides;
      }
    } else {
      throw new UsageError("Provide a card name or --all.");
    }
    await writeConfigLocal(projectRoot, local);
    this.context.stdout.write("Removed dev-linked override(s) from config.local.json\n");
    if (this.write) {
      return await runChainedWrite(this);
    }
    return 0;
  }
}
