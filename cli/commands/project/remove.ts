// ABOUTME: Implements canonical `drwn remove <name>` for deleting one installed Worker root.
// ABOUTME: Re-resolves the remaining graph so unreachable member Cards leave the project lock.

import { Option } from "clipanion";
import { removeProjectWorkerRoot } from "../../core/worker-project";
import { BaseCommand } from "../base";
import { renderWorkerMutation, requireProjectRoot, runChainedWrite } from "../card/project-command";

export class ProjectRemoveCommand extends BaseCommand {
  static override paths = [["remove"]];
  static override usage = BaseCommand.Usage({ category: "Project", description: "Remove one Worker root from this project." });
  name = Option.String({ required: true });
  write = Option.Boolean("--write", false);
  dryRun = Option.Boolean("--dry-run", false);

  async execute() {
    try {
      const result = await removeProjectWorkerRoot(requireProjectRoot(this), this.context.agentsDir, this.name, { dryRun: this.dryRun });
      this.context.stdout.write(renderWorkerMutation(result));
      return this.write && !this.dryRun ? runChainedWrite(this) : 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
