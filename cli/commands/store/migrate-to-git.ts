// ABOUTME: Implements drwn store migrate-to-git for Wave 1 card store conversion.
// ABOUTME: Converts old per-version card directories into per-card bare Git repositories.

import { Option } from "clipanion";
import { migrateCardsToGit } from "../../core/store-migrate";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class StoreMigrateToGitCommand extends BaseCommand {
  static override paths = [["store", "migrate-to-git"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Convert per-version card directories into bare Git repos.",
    details: `
      Walks ~/.agents/drwn/cards, converts legacy <card>/<version> directories
      into per-card bare Git repositories with version tags, verifies integrity,
      then removes the old per-version directories.
    `,
    examples: [
      ["Migrate card storage to Git", "drwn store migrate-to-git"],
      ["Preview card storage migration", "drwn store migrate-to-git --dry-run --json"],
    ],
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Report planned migration without modifying files.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      const result = await migrateCardsToGit({ agentsDir: this.context.agentsDir, dryRun: this.dryRun });
      if (this.json) {
        this.context.stdout.write(renderJson(result));
      } else if (result.cards.length === 0) {
        this.context.stdout.write("No per-version card directories detected.\n");
      } else {
        this.context.stdout.write(`${this.dryRun ? "Would migrate" : "Migrated"} ${result.cards.length} card package(s).\n`);
      }
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
