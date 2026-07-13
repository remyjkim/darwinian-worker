// ABOUTME: Implements canonical `drwn add <ref>` for appending one project Worker root.
// ABOUTME: Commits config V2 and lock V6 together before optional materialization.

import { Option } from "clipanion";
import { addProjectWorkerRoot } from "../../core/worker-project";
import { BaseCommand } from "../base";
import { renderWorkerMutation, requireProjectRoot, runChainedWrite } from "../card/project-command";

export class ProjectAddCommand extends BaseCommand {
  static override paths = [["add"]];
  static override usage = BaseCommand.Usage({ category: "Project", description: "Add one Worker root to this project." });
  spec = Option.String({ required: true });
  write = Option.Boolean("--write", false);
  dryRun = Option.Boolean("--dry-run", false);
  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false);

  async execute() {
    try {
      const result = await addProjectWorkerRoot(requireProjectRoot(this), this.context.agentsDir, this.spec, {
        allowUntrustedSource: this.allowUntrustedSource,
        repoRoot: this.context.repoRoot,
        cwd: this.context.cwd,
        dryRun: this.dryRun,
      });
      this.context.stdout.write(renderWorkerMutation(result));
      return this.write && !this.dryRun ? runChainedWrite(this) : 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
