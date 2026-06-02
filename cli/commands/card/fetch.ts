// ABOUTME: Implements drwn card fetch for refreshing a local card repo from a remote.
// ABOUTME: Brings remote heads and version tags into the local bare repo.

import { Option, UsageError } from "clipanion";
import { existsSync } from "node:fs";
import * as git from "../../core/git";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { BaseCommand } from "../base";

export class CardFetchCommand extends BaseCommand {
  static override paths = [["card", "fetch"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Fetch updates for a local card repo.",
    details: `
      Fetches remote heads and version tags into the local bare card repo. The
      default remote is origin.
    `,
    examples: [["Fetch a card", "drwn card fetch @team/backend"]],
  });

  name = Option.String({ required: true });

  remote = Option.String("--remote", "origin", {
    description: "Remote name to fetch from.",
  });

  async execute() {
    const barePath = resolveCardBareRepoPath(this.context.agentsDir, this.name);
    if (!existsSync(barePath)) {
      throw new UsageError(`Card not found in local store: ${this.name}`);
    }
    await git.fetch(barePath, this.remote, ["refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*"]);
    this.context.stdout.write(`Fetched ${this.name} from ${this.remote}\n`);
    return 0;
  }
}
