// ABOUTME: Implements drwn card push for publishing local card refs to a Git remote.
// ABOUTME: Pushes the main branch and version tags from the local bare repo.

import { Option, UsageError } from "clipanion";
import { existsSync } from "node:fs";
import { assertValidCardManifest, type CardManifest } from "../../core/card-manifest";
import * as git from "../../core/git";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import {
  cardManifestStrictestVisibility,
  classifyRemoteUrl,
  evaluatePushGate,
  parseRemoteVisibility,
} from "../../core/visibility";
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

  remoteVisibility = Option.String("--remote-visibility", {
    description: "Visibility of the remote: private, internal, public, or unknown.",
  });

  unsafePushPublic = Option.Boolean("--unsafe-push-public", false, {
    description: "Allow pushing visibility-bearing mind content to a less restrictive remote.",
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
    const manifest = await readBareRepoManifest(barePath);
    const cardVisibility = cardManifestStrictestVisibility(manifest);
    let remoteVisibility;
    try {
      remoteVisibility = this.remoteVisibility ? parseRemoteVisibility(this.remoteVisibility) : classifyRemoteUrl(remoteUrl);
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    const gate = evaluatePushGate({
      cardVisibility,
      remoteVisibility,
      unsafePushPublic: this.unsafePushPublic,
    });
    if (!gate.ok) {
      this.context.stderr.write(`${gate.reason ?? "Card push blocked by visibility gate"}\n`);
      return 1;
    }
    if (gate.warning) {
      this.context.stderr.write(`${gate.warning}\n`);
    }
    await git.push(barePath, this.remote, ["refs/heads/main", "--tags"]);
    this.context.stdout.write(`Pushed ${this.name} to ${this.remote}\n`);
    return 0;
  }
}

async function readBareRepoManifest(barePath: string): Promise<CardManifest> {
  const result = await git.runInRepo(barePath, ["show", "refs/heads/main:card.json"]);
  if (result.exitCode !== 0) {
    throw new UsageError(`Card repo is missing refs/heads/main:card.json`);
  }
  const manifest = JSON.parse(result.stdout) as CardManifest;
  assertValidCardManifest(manifest);
  return manifest;
}
