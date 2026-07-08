// ABOUTME: Parent command for `drwn worker mind`, describing the mind verb group.
// ABOUTME: Individual verbs manage a worker's BeginningDB mind: provision, status, doctor, pool retire.

import { BaseCommand } from "../../base";

export class WorkerMindCommand extends BaseCommand {
  static override paths = [["worker", "mind"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Manage a worker's DB-backed mind (persona, beliefs, memory).",
    details: `
      A worker's mind lives in BeginningDB under minds/<mindId>/. These verbs
      provision and seed it from the project's mind cards, report drift between
      card seeds and live DB state, diagnose memory-pool health, and retire pool
      entries. The connection comes from BGDB_* environment variables or the
      deployed worker's binding.
    `,
    examples: [
      ["Provision and seed", "drwn worker mind provision --mind-id mind_abc"],
      ["Show drift", "drwn worker mind status --json"],
    ],
  });

  async execute() {
    this.context.stdout.write("Usage: drwn worker mind <provision|status|doctor|pool retire> — see --help.\n");
    return 0;
  }
}
