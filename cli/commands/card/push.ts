// ABOUTME: Implements drwn card push for publishing local card refs to a Git remote.
// ABOUTME: Pushes the main branch and version tags from the local bare repo.

import { Option, UsageError } from "clipanion";
import { existsSync } from "node:fs";
import * as git from "../../core/git";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { BaseCommand } from "../base";

export class CardPushCommand extends BaseCommand {
  static override paths = [["card", "push"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Push a local card repo to its configured Git remote.",
    details: `
      Pushes refs/heads/main and all version tags from the local bare card repo
      to a configured remote. The default remote is origin.
    `,
    examples: [["Push a card", "drwn card push @team/backend"]],
  });

  name = Option.String({ required: true });

  remote = Option.String("--remote", "origin", {
    description: "Remote name to push to.",
  });

  async execute() {
    const barePath = resolveCardBareRepoPath(this.context.agentsDir, this.name);
    if (!existsSync(barePath)) {
      throw new UsageError(`Card not found in local store: ${this.name}`);
    }
    const remotes = await git.remoteList(barePath);
    const remoteUrl = remotes[this.remote];
    if (!remoteUrl) {
      throw new UsageError(`Remote not found for ${this.name}: ${this.remote}`);
    }
    await git.push(barePath, this.remote, ["refs/heads/main", "refs/meta/*", "--tags"]);
    this.context.stdout.write(`Pushed ${this.name} to ${this.remote}\n`);
    return 0;
  }
}
