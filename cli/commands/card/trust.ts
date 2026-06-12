// ABOUTME: Implements explicit hook consent for locked Harness Cards.
// ABOUTME: Records user-reviewed version ranges in card.lock.

import { Option, UsageError } from "clipanion";
import { setHookConsent } from "../../core/card-project";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "./project-command";

export class CardTrustCommand extends BaseCommand {
  static override paths = [["card", "trust"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Trust a locked card for hook materialization.",
    details: `
      Records explicit consent for hook policies declared by a locked card.
      Consent is stored in card.lock and scoped to a semver range.
    `,
    examples: [["Trust card hooks", "drwn card trust @your-handle/backend --hooks"]],
  });

  spec = Option.String({ required: true });

  hooks = Option.Boolean("--hooks", false, {
    description: "Record hook execution consent for this card.",
  });

  range = Option.String("--range", {
    description: "Semver range covered by this hook consent. Defaults to ^<locked-version>.",
  });

  async execute() {
    if (!this.hooks) {
      throw new UsageError("Specify --hooks to record hook consent.");
    }
    let result;
    try {
      result = await setHookConsent(requireProjectRoot(this), this.spec, this.range);
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    this.context.stdout.write(
      `Trusted hooks for ${result.card.name}@${result.card.version} (${result.card.hookConsent?.consentedRange})\nWrote ${result.lockPath}\n`,
    );
    return 0;
  }
}
