// ABOUTME: Implements drwn card meta show for distributable metadata inspection.
// ABOUTME: Surfaces deprecations and successor pointers from refs/meta/cards.

import { Option, UsageError } from "clipanion";
import { existsSync } from "node:fs";
import { formatSuccessorSuggestion, readCardMeta } from "../../core/card-meta";
import { renderJson } from "../../core/output";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { parseCardRef } from "../../core/card-store";
import { BaseCommand } from "../base";

export class CardMetaShowCommand extends BaseCommand {
  static override paths = [["card", "meta", "show"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Show distributable metadata for a card (deprecations, successor).",
    details: `
      Reads refs/meta/cards metadata.json from the local card bare repo and
      prints deprecations and successor pointers for operator review.
    `,
    examples: [["Show metadata", "drwn card meta show @team/backend"]],
  });

  name = Option.String({ required: true });
  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON." });
  acceptSuccessor = Option.Boolean("--accept-successor", false, {
    description: "Acknowledge a cross-scope successor pointer.",
  });

  async execute() {
    const parsed = parseCardRef(this.name);
    const barePath = resolveCardBareRepoPath(this.context.agentsDir, parsed.name);
    if (!existsSync(barePath)) {
      throw new UsageError(`Card not found in local store: ${parsed.name}`);
    }
    const meta = await readCardMeta(barePath);
    if (this.json) {
      this.context.stdout.write(renderJson(meta ?? {}));
      return 0;
    }
    if (!meta) {
      this.context.stdout.write(`No metadata for ${parsed.name}\n`);
      return 0;
    }
    const lines = [`Metadata for ${parsed.name}:`];
    if (meta.deprecations && Object.keys(meta.deprecations).length > 0) {
      lines.push("Deprecations:");
      for (const [version, message] of Object.entries(meta.deprecations).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`  ${version}: ${message}`);
      }
    }
    if (meta.successor) {
      lines.push(`Successor: ${meta.successor}`);
    }
    const suggestion = formatSuccessorSuggestion(parsed.name, meta, { acceptSuccessor: this.acceptSuccessor });
    if (suggestion) {
      lines.push(suggestion);
    }
    this.context.stdout.write(`${lines.join("\n")}\n`);
    return 0;
  }
}
