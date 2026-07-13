// ABOUTME: Implements canonical `drwn update [name]` for refreshing the project Worker graph.
// ABOUTME: Preserves singular selection while resolving current root constraints again.

import { Option } from "clipanion";
import { updateProjectWorkerGraph } from "../../core/worker-project";
import { BaseCommand } from "../base";
import { renderWorkerMutation, requireProjectRoot, runChainedWrite } from "../card/project-command";

export class ProjectUpdateCommand extends BaseCommand {
  static override paths = [["update"]];
  static override usage = BaseCommand.Usage({
    category: "Project",
    description: "Refresh the project Worker lock graph.",
    details: `
      Re-resolves one named root or every declared root within its requirement,
      preserving singular selection. The complete next config and lock are
      validated before either file is replaced.
    `,
    examples: [
      ["Refresh every root", "drwn update"],
      ["Refresh one root", "drwn update @team/operator"],
    ],
  });
  name = Option.String({ required: false });
  write = Option.Boolean("--write", false);
  dryRun = Option.Boolean("--dry-run", false);
  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false);

  async execute() {
    try {
      const result = await updateProjectWorkerGraph(requireProjectRoot(this), this.context.agentsDir, this.name, {
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
