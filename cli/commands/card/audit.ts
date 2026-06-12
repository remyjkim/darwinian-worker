// ABOUTME: Registers the future card audit command surface.
// ABOUTME: Keeps hook audit discoverability while full diff support is deferred.

import { BaseCommand } from "../base";

export class CardAuditCommand extends BaseCommand {
  static override paths = [["card", "audit"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Preview future card hook audit support.",
    details: `
      Hook audit diffs are deferred to v1.1. This placeholder makes the planned
      command discoverable without pretending to perform an audit today.
    `,
    examples: [["Show audit status", "drwn card audit"]],
  });

  async execute() {
    this.context.stdout.write("v1.1 feature: see analysis 60 §4\n");
    return 0;
  }
}
