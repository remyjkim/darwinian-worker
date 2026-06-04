// ABOUTME: Implements `drwn card show` for inspecting a resolved card version.
// ABOUTME: Supports both human and JSON output for published card metadata.

import { Option } from "clipanion";
import { resolveCard } from "../../core/card-store";
import * as git from "../../core/git";
import { renderJson, renderTable } from "../../core/output";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { BaseCommand } from "../base";

export class CardShowCommand extends BaseCommand {
  static override paths = [["card", "show"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Show a published card version resolved from a name or range.",
    details: `
      Resolves the requested card ref against the local store and prints the
      exact version, store path, requested range, and integrity hash.
    `,
    examples: [
      ["Show an exact card version", "drwn card show @your-handle/backend@1.0.0"],
      ["Show the latest satisfying version", "drwn card show @your-handle/backend@^1.0.0"],
    ],
  });

  ref = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const card = await resolveCard(this.context.agentsDir, this.ref);
    const history = card.git
      ? await git.log(resolveCardBareRepoPath(this.context.agentsDir, card.name), { maxCount: 10, ref: card.git.commit })
      : [];
    if (this.json) {
      this.context.stdout.write(renderJson({ ...card, history }));
      return 0;
    }
    const rows = [
      ["name", card.name],
      ["version", card.version],
      ["requested", card.requested],
      ["path", card.dir],
      ["integrity", card.integrity],
      ...(card.manifest.stability ? [["stability", card.manifest.stability]] : []),
      ...(card.manifest.lastValidatedWith ? [["lastValidatedWith", card.manifest.lastValidatedWith]] : []),
      ...(card.manifest.testStatusBadge ? [["testStatusBadge", card.manifest.testStatusBadge]] : []),
      ["history", history.map((entry) => `${entry.commit.slice(0, 12)} ${entry.subject}`).join("; ")],
    ];
    this.context.stdout.write(
      renderTable(
        ["field", "value"],
        rows,
      ),
    );
    return 0;
  }
}
