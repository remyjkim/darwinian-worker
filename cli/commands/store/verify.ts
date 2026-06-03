// ABOUTME: Implements drwn store verify for Git-backed card store health checks.
// ABOUTME: Validates bare repo presence and tag readability for local cards.

import { Option } from "clipanion";
import { listCards } from "../../core/card-store";
import * as git from "../../core/git";
import { renderJson } from "../../core/output";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { BaseCommand } from "../base";

export class StoreVerifyCommand extends BaseCommand {
  static override paths = [["store", "verify"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Verify Git-backed card store health.",
    details: `
      Checks that local card bare repositories are readable and their version
      tags can be enumerated.
    `,
    examples: [["Verify the store", "drwn store verify --json"]],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const errors: string[] = [];
    const cards = await listCards(this.context.agentsDir);
    for (const card of cards) {
      try {
        await git.listTags(resolveCardBareRepoPath(this.context.agentsDir, card.name));
      } catch (error) {
        errors.push(`${card.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const payload = { ok: errors.length === 0, cardCount: cards.length, errors };
    this.context.stdout.write(this.json ? renderJson(payload) : `${payload.ok ? "Store verified" : "Store verification failed"}\n`);
    return payload.ok ? 0 : 1;
  }
}
