// ABOUTME: Parent drwn cloud command for command-group help.
// ABOUTME: Shows the cloud command surface without registering deprecated cloud login.

import { BaseCommand } from "../base";

const DETAILS = [
  "Available commands:",
  "  drwn cloud deploy <cardRef> --name <slug>",
  "  drwn cloud list",
  "  drwn cloud status <slug>",
  "  drwn cloud deployments <slug>",
  "  drwn cloud rollback <slug>",
  "  drwn cloud delete <slug> --force",
].join("\n");

export class CloudCommand extends BaseCommand {
  static override paths = [["cloud"]];

  static override usage = BaseCommand.Usage({
    category: "Cloud",
    description: "Deploy and operate Minds on Studio Deployment.",
    details: DETAILS,
    examples: [
      ["List deployed Minds", "drwn cloud list"],
      ["Check a Mind deployment", "drwn cloud status harari"],
    ],
  });

  async execute(): Promise<number> {
    this.context.stdout.write(`${DETAILS}\n`);
    return 0;
  }
}
