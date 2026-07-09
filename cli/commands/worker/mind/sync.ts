// ABOUTME: Implements `drwn worker mind sync`: rebases seeded persona/beliefs onto the project's pinned card versions.
// ABOUTME: DB edits win by default (drifted files are skipped and reported); --force makes the card version win.

import { Option } from "clipanion";
import { createMindDbClient } from "../../../core/mind-store/client";
import { resolveBgdbConfig } from "../../../core/mind-store/config";
import { loadProjectMindCards, resolveMindId } from "../../../core/mind-store/project";
import { syncMind } from "../../../core/mind-store/rebase";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { requireProjectRoot } from "../../card/project-command";

export class WorkerMindSyncCommand extends BaseCommand {
  static override paths = [["worker", "mind", "sync"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Rebase a mind's seeded content onto the current card versions.",
    details: `
      Re-uploads persona and belief seeds with compare-and-swap against the seed
      ledger. Files edited in the DB since seeding are skipped and reported as
      drift; pass --force to overwrite them with the card content. Memory is
      never touched by sync.
    `,
    examples: [
      ["Preview a rebase", "drwn worker mind sync --dry-run --json"],
      ["Rebase, preserving DB edits", "drwn worker mind sync"],
      ["Card-wins rebase", "drwn worker mind sync --force"],
    ],
  });

  mindId = Option.String("--mind-id", { description: "Mind id (defaults to the one in BGDB_PATH_PREFIX)." });

  force = Option.Boolean("--force", false, { description: "Overwrite DB edits with card content." });

  dryRun = Option.Boolean("--dry-run", false, { description: "Report the plan without writing." });

  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    try {
      const projectRoot = requireProjectRoot(this);
      const mindId = resolveMindId({ flag: this.mindId });
      const client = createMindDbClient(resolveBgdbConfig());
      const cards = await loadProjectMindCards(projectRoot);
      const result = await syncMind(client, mindId, cards, { force: this.force, dryRun: this.dryRun });
      if (this.json) {
        this.context.stdout.write(renderJson({ mindId, dryRun: this.dryRun, ...result }));
        return 0;
      }
      const verb = this.dryRun ? "Would update" : "Updated";
      this.context.stdout.write(`${verb} ${result.updated.length}, created ${result.created.length}, unchanged ${result.unchanged.length}.\n`);
      for (const path of result.skippedDrifted) {
        this.context.stdout.write(`  drift (preserved): ${path}\n`);
      }
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
