// ABOUTME: Implements card remote management commands for Git-backed card repos.
// ABOUTME: Keeps team-sharing remote configuration available from the CLI.

import { Option, UsageError } from "clipanion";
import * as git from "../../core/git";
import { renderJson, renderTable } from "../../core/output";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { BaseCommand } from "../base";
import { existsSync } from "node:fs";

function requireCardRepo(agentsDir: string, name: string) {
  const barePath = resolveCardBareRepoPath(agentsDir, name);
  if (!existsSync(barePath)) {
    throw new UsageError(`Card not found in local store: ${name}`);
  }
  return barePath;
}

abstract class CardRemoteBaseCommand extends BaseCommand {
  name = Option.String({ required: true });

  remoteName = Option.String("--name", "origin", {
    description: "Remote name to manage.",
  });
}

export class CardRemoteAddCommand extends CardRemoteBaseCommand {
  static override paths = [["card", "remote", "add"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Add a Git remote to a local card repo.",
    details: `
      Adds a named Git remote to the card's local bare repository. The default
      remote name is origin.
    `,
    examples: [["Add a team remote", "drwn card remote add @team/backend file:///tmp/backend.git"]],
  });

  url = Option.String({ required: true });

  async execute() {
    const barePath = requireCardRepo(this.context.agentsDir, this.name);
    await git.remoteAdd(barePath, this.remoteName, this.url);
    await git.configSet(barePath, "drwn.originUrl", this.url);
    this.context.stdout.write(`Added ${this.remoteName} -> ${this.url}\n`);
    return 0;
  }
}

export class CardRemoteSetCommand extends CardRemoteBaseCommand {
  static override paths = [["card", "remote", "set"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Set a Git remote URL for a local card repo.",
    details: `
      Updates an existing card remote URL, adding the remote first when it is
      not present. The default remote name is origin.
    `,
    examples: [["Set a team remote", "drwn card remote set @team/backend file:///tmp/backend.git"]],
  });

  url = Option.String({ required: true });

  async execute() {
    const barePath = requireCardRepo(this.context.agentsDir, this.name);
    const remotes = await git.remoteList(barePath);
    if (remotes[this.remoteName]) {
      await git.remoteSet(barePath, this.remoteName, this.url);
    } else {
      await git.remoteAdd(barePath, this.remoteName, this.url);
    }
    await git.configSet(barePath, "drwn.originUrl", this.url);
    this.context.stdout.write(`Set ${this.remoteName} -> ${this.url}\n`);
    return 0;
  }
}

export class CardRemoteRemoveCommand extends CardRemoteBaseCommand {
  static override paths = [["card", "remote", "remove"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove a Git remote from a local card repo.",
    details: `
      Removes a named Git remote from the card's local bare repository. The
      default remote name is origin.
    `,
    examples: [["Remove a team remote", "drwn card remote remove @team/backend"]],
  });

  async execute() {
    const barePath = requireCardRepo(this.context.agentsDir, this.name);
    await git.remoteRemove(barePath, this.remoteName);
    this.context.stdout.write(`Removed ${this.remoteName}\n`);
    return 0;
  }
}

export class CardRemoteListCommand extends BaseCommand {
  static override paths = [["card", "remote", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "List Git remotes for a local card repo.",
    details: `
      Lists configured Git remotes on the card's local bare repository.
    `,
    examples: [["List card remotes", "drwn card remote list @team/backend --json"]],
  });

  name = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const barePath = requireCardRepo(this.context.agentsDir, this.name);
    const remotes = await git.remoteList(barePath);
    if (this.json) {
      this.context.stdout.write(renderJson({ name: this.name, remotes }));
    } else {
      this.context.stdout.write(renderTable(["remote", "url"], Object.entries(remotes)));
    }
    return 0;
  }
}
