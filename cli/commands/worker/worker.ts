// ABOUTME: Parent drwn worker command for command-group help.
// ABOUTME: Shows the worker command surface without registering deprecated login.

import { BaseCommand } from "../base";

const DETAILS = [
  "Available commands:",
  "  drwn worker deploy <cardRef> --name <slug>",
  "  drwn worker list",
  "  drwn worker status <slug>",
  "  drwn worker deployments <slug>",
  "  drwn worker chat <slug> --message <text>",
  "  drwn worker rollback <slug>",
  "  drwn worker delete <slug> --force",
  "  drwn worker stack",
].join("\n");

export class WorkerCommand extends BaseCommand {
  static override paths = [["worker"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Deploy and operate workers.",
    details: DETAILS,
    examples: [
      ["List deployed workers", "drwn worker list"],
      ["Check a worker deployment", "drwn worker status harari"],
    ],
  });

  async execute(): Promise<number> {
    this.context.stdout.write(`${DETAILS}\n`);
    return 0;
  }
}
