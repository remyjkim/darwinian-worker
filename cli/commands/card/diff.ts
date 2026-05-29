// ABOUTME: Implements `drwn card diff` for comparing two published card versions.
// ABOUTME: Prints semantic change classification for release decisions.

import { Option } from "clipanion";
import { diffCards } from "../../core/card-diff";
import { resolveCard } from "../../core/card-store";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class CardDiffCommand extends BaseCommand {
  static override paths = [["card", "diff"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Compare two published card versions and classify the change.",
    details: `
      Compares structural card manifest changes. Removals classify as major,
      additions classify as minor, and metadata-only edits classify as patch.
    `,
    examples: [["Compare versions", "drwn card diff @me/backend@1.0.0 @me/backend@1.1.0"]],
  });

  before = Option.String({ required: true });

  after = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const [before, after] = await Promise.all([
      resolveCard(this.context.agentsDir, this.before),
      resolveCard(this.context.agentsDir, this.after),
    ]);
    const diff = diffCards(before.manifest, after.manifest);
    if (this.json) {
      this.context.stdout.write(renderJson({ before, after, ...diff }));
      return 0;
    }
    const changes = diff.changes.length === 0
      ? "Changes: none"
      : `Changes:\n${diff.changes.map((change) => `- ${change.kind} ${change.path}`).join("\n")}`;
    this.context.stdout.write(`Classification: ${diff.classification}\n${changes}\n`);
    return 0;
  }
}
