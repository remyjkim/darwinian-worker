// ABOUTME: Implements drwn store gc for Git-backed card repositories.
// ABOUTME: Runs git gc on each local bare card repo.

import { listCards } from "../../core/card-store";
import * as git from "../../core/git";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { BaseCommand } from "../base";

export class StoreGcCommand extends BaseCommand {
  static override paths = [["store", "gc"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Run garbage collection on local card repos.",
    details: `
      Runs git gc in each local bare card repository to compact Git object
      storage.
    `,
    examples: [["Garbage collect card repos", "drwn store gc"]],
  });

  async execute() {
    for (const card of await listCards(this.context.agentsDir)) {
      await git.runInRepo(resolveCardBareRepoPath(this.context.agentsDir, card.name), ["gc"]);
    }
    this.context.stdout.write("Garbage collection complete.\n");
    return 0;
  }
}
