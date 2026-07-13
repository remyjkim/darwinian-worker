// ABOUTME: Implements `drwn worker mind status`: shows the mind's binding, seed sources, and per-file drift.
// ABOUTME: Drift is informational — DB edits win by default and are surfaced here, never auto-reverted.

import { Option } from "clipanion";
import { DrwnError } from "../../../core/errors";
import { createMindDbClient } from "../../../core/mind-store/client";
import { resolveBgdbConfig } from "../../../core/mind-store/config";
import { computeDrift, readMindIndex } from "../../../core/mind-store/ledger";
import { loadProjectMindCards, resolveMindId } from "../../../core/mind-store/project";
import { renderJson, renderTable } from "../../../core/output";
import { BaseCommand } from "../../base";
import { requireProjectRoot } from "../../card/project-command";

export class WorkerMindStatusCommand extends BaseCommand {
  static override paths = [["worker", "mind", "status"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Show a mind's seed sources and drift between card seeds and live DB state.",
    details: `
      Reads the mind.json seed ledger and compares each seeded file's live ETag
      and the project's pinned card versions. States: in-sync, db-edited (live
      edits preserved by sync), card-updated (rebase available), missing.
    `,
    examples: [["Show drift", "drwn worker mind status --json"]],
  });

  mindId = Option.String("--mind-id", { description: "Mind id (defaults to the one in BGDB_PATH_PREFIX)." });

  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    try {
      const projectRoot = requireProjectRoot(this);
      const mindId = resolveMindId({ flag: this.mindId });
      const client = createMindDbClient(resolveBgdbConfig());
      const index = await readMindIndex(client, mindId);
      if (!index) {
        if (this.json) {
          this.context.stdout.write(renderJson({ mindId, provisioned: false, drift: [] }));
          return 0;
        }
        this.context.stdout.write(`Mind ${mindId} is not provisioned. Run: drwn worker mind provision\n`);
        return 0;
      }
      const cards = await loadProjectMindCards(projectRoot);
      const drift = await computeDrift(client, index, cards);
      if (this.json) {
        this.context.stdout.write(renderJson({ mindId, provisioned: true, worker: index.worker, cards: index.cards, drift }));
        return 0;
      }
      this.context.stdout.write(renderTable(["path", "card", "state"], drift.map((row) => [row.path, row.card, row.state])));
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof DrwnError ? error.message : String(error instanceof Error ? error.message : error)}\n`);
      return 1;
    }
  }
}
