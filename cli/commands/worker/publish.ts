// ABOUTME: Implements `drwn worker publish` to publish a Worker Blueprint into the local card store.
// ABOUTME: Thin wrapper over card publish; a blueprint is a kind:"blueprint" card.

import { Option } from "clipanion";
import { publishCard } from "../../core/card-store";
import { BaseCommand } from "../base";

export class WorkerPublishCommand extends BaseCommand {
  static override paths = [["worker", "publish"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Publish a Worker Blueprint source into the local card store.",
    examples: [["Publish a blueprint", "drwn worker publish @you/frontend-eng"]],
  });

  name = Option.String({ required: true });

  forceBumpMismatch = Option.Boolean("--force-bump-mismatch", false, {
    description: "Publish despite a mismatch between structural diff classification and declared version bump.",
  });

  async execute() {
    try {
      const published = await publishCard(this.context.agentsDir, this.name, {
        forceBumpMismatch: this.forceBumpMismatch,
      });
      if (this.forceBumpMismatch) {
        this.context.stderr.write(`Warning: --force-bump-mismatch used for ${published.name}@${published.version}\n`);
      }
      this.context.stdout.write(`Published ${published.name}@${published.version}: ${published.versionDir}\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
