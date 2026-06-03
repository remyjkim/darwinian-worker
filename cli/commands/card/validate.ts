// ABOUTME: Implements drwn card validate for consumer-side card ref checks.
// ABOUTME: Resolves a card ref and reports manifest, integrity, and bundled skill validity.

import { Option } from "clipanion";
import { resolveCard } from "../../core/card-store";
import { DrwnError } from "../../core/errors";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class CardValidateCommand extends BaseCommand {
  static override paths = [["card", "validate"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Validate a card ref.",
    details: `
      Resolves a card ref, validates its manifest and bundled skill paths, and
      verifies its content integrity calculation.
    `,
    examples: [
      ["Validate a card", "drwn card validate @me/backend@1.0.0"],
      ["Validate a card as JSON", "drwn card validate @me/backend@1.0.0 --json"],
    ],
  });

  ref = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      const card = await resolveCard(this.context.agentsDir, this.ref);
      const payload = { ok: true, card: { name: card.name, version: card.version, integrity: card.integrity, origin: card.origin } };
      this.context.stdout.write(this.json ? renderJson(payload) : `Valid ${card.name}@${card.version}\n`);
      return 0;
    } catch (error) {
      const code = error instanceof DrwnError ? error.code : "CARD_VALIDATE_FAILED";
      const message = error instanceof Error ? error.message : String(error);
      if (this.json) {
        this.context.stdout.write(renderJson({ ok: false, code, message }));
      } else {
        this.context.stderr.write(`${code}: ${message}\n`);
      }
      return 1;
    }
  }
}
