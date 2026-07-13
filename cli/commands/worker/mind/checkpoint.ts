// ABOUTME: Implements `drwn worker mind checkpoint`: writes live DB persona/belief edits back into local card sources.
// ABOUTME: The written files land in the git working tree for review; publishing them creates the next baseline.

import { Option } from "clipanion";
import { existsSync } from "node:fs";
import { createMindDbClient } from "../../../core/mind-store/client";
import { resolveBgdbConfig } from "../../../core/mind-store/config";
import { readMindIndex } from "../../../core/mind-store/ledger";
import { loadProjectMindCards, resolveMindId } from "../../../core/mind-store/project";
import { checkpointMind } from "../../../core/mind-store/rebase";
import { renderJson } from "../../../core/output";
import { resolveCardSourceDir } from "../../../core/store-paths";
import { BaseCommand } from "../../base";
import { requireProjectRoot } from "../../card/project-command";

export class WorkerMindCheckpointCommand extends BaseCommand {
  static override paths = [["worker", "mind", "checkpoint"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Write a mind's live DB edits back into local card sources for review and publish.",
    details: `
      Maps edited persona sections (via provenance fences) and belief files back
      to their owning card's editable source. Content outside fences cannot be
      attributed and fails the checkpoint. Review the resulting source diff and
      publish a new card version to make it the baseline.
    `,
    examples: [["Checkpoint live edits", "drwn worker mind checkpoint --json"]],
  });

  mindId = Option.String("--mind-id", { description: "Mind id (defaults to the one in BGDB_PATH_PREFIX)." });

  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    try {
      const projectRoot = requireProjectRoot(this);
      const mindId = resolveMindId({ flag: this.mindId });
      const client = createMindDbClient(resolveBgdbConfig());
      const cards = await loadProjectMindCards(projectRoot);
      const index = await readMindIndex(client, mindId);
      const sourceDirs: Record<string, string> = {};
      for (const card of index?.cards ?? []) {
        const dir = resolveCardSourceDir(this.context.agentsDir, card.card);
        if (existsSync(dir)) {
          sourceDirs[card.card] = dir;
        }
      }
      const result = await checkpointMind(client, mindId, cards, { sourceDirs });
      if (this.json) {
        this.context.stdout.write(renderJson({ mindId, ...result }));
        return 0;
      }
      this.context.stdout.write(
        result.written.length === 0
          ? "Nothing to checkpoint: DB matches the card seeds.\n"
          : `Checkpointed ${result.written.length} file(s) into card sources:\n${result.written.map((path) => `  ${path}`).join("\n")}\nReview and publish to make this the new baseline.\n`,
      );
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
