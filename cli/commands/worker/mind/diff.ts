// ABOUTME: Implements `drwn worker mind diff`: shows per-entry differences between DB state and card seeds.
// ABOUTME: Read-only companion to checkpoint; also surfaces persona content outside provenance fences.

import { Option } from "clipanion";
import { createMindDbClient } from "../../../core/mind-store/client";
import { resolveBgdbConfig } from "../../../core/mind-store/config";
import { loadProjectMindCards, resolveMindId } from "../../../core/mind-store/project";
import { diffMind } from "../../../core/mind-store/rebase";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { requireProjectRoot } from "../../card/project-command";

export class WorkerMindDiffCommand extends BaseCommand {
  static override paths = [["worker", "mind", "diff"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Show differences between a mind's live DB content and its card seeds.",
    details: `
      Parses the live persona.md via its provenance fences and compares each
      persona section and belief file with the card entry it was seeded from.
      Content outside any fence is listed separately; it blocks checkpoint
      until moved inside an entry's fence or removed.
    `,
    examples: [["Show the diff", "drwn worker mind diff --json"]],
  });

  mindId = Option.String("--mind-id", { description: "Mind id (defaults to the one in BGDB_PATH_PREFIX)." });

  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    try {
      const projectRoot = requireProjectRoot(this);
      const mindId = resolveMindId({ flag: this.mindId });
      const client = createMindDbClient(resolveBgdbConfig());
      const cards = await loadProjectMindCards(projectRoot);
      const diff = await diffMind(client, mindId, cards);
      if (this.json) {
        this.context.stdout.write(renderJson({ mindId, ...diff }));
        return 0;
      }
      for (const entry of diff.entries) {
        this.context.stdout.write(`${entry.state.padEnd(8)} ${entry.section} ${entry.card} ${entry.entry}\n`);
      }
      if (diff.outsideFences.length > 0) {
        this.context.stdout.write(`\nContent outside fences (blocks checkpoint):\n${diff.outsideFences.join("\n---\n")}\n`);
      }
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
