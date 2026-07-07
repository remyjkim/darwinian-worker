// ABOUTME: Implements drwn store gc for Git-backed card repositories and extracted trees.
// ABOUTME: Defaults to dry-run and reports planned extraction pruning.

import { Option } from "clipanion";
import { listCards } from "../../core/card-store";
import * as git from "../../core/git";
import { planGc } from "../../core/store-gc";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { findProjectConfig, resolveProjectRootFromConfigPath } from "../../core/project";
import { rm } from "node:fs/promises";
import { BaseCommand } from "../base";

export class StoreGcCommand extends BaseCommand {
  static override paths = [["store", "gc"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Run garbage collection on local card repos and stale extractions.",
    details: `
      Runs git gc in each local bare card repository and reports extraction
      directories that are safe to prune. Defaults to dry-run; use --prune to delete.
    `,
    examples: [["Dry-run GC", "drwn store gc"], ["Prune stale extractions", "drwn store gc --prune"]],
  });

  prune = Option.Boolean("--prune", false, { description: "Delete planned stale extraction directories." });
  dryRun = Option.Boolean("--dry-run", true, { description: "Report planned GC actions without deleting." });

  async execute() {
    const projectConfigPath = findProjectConfig(this.context.cwd);
    const projectRoot = projectConfigPath ? resolveProjectRootFromConfigPath(projectConfigPath) : null;
    const plan = await planGc({ agentsDir: this.context.agentsDir, projectRoot });
    for (const warning of plan.warnings ?? []) {
      this.context.stderr.write(`${warning}\n`);
    }
    for (const card of await listCards(this.context.agentsDir)) {
      await git.runInRepo(resolveCardBareRepoPath(this.context.agentsDir, card.name), ["gc"]);
    }
    if (this.dryRun && !this.prune) {
      this.context.stdout.write(
        `GC plan: keep ${plan.keep.length}, prune ${plan.prune.length}\n${plan.prune.map((path) => `- ${path}`).join("\n")}\n`,
      );
    } else {
      for (const path of plan.prune) {
        await rm(path, { recursive: true, force: true });
      }
    }
    this.context.stdout.write("Garbage collection complete.\n");
    return 0;
  }
}
