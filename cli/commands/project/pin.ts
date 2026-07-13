// ABOUTME: Implements canonical `drwn pin <ref>` for changing one installed Worker root constraint.
// ABOUTME: Preserves active selection by resolved root name.

import { Option } from "clipanion";
import { pinProjectWorkerRoot } from "../../core/worker-project";
import { BaseCommand } from "../base";
import { renderWorkerMutation, requireProjectRoot, runChainedWrite } from "../card/project-command";

export class ProjectPinCommand extends BaseCommand {
  static override paths = [["pin"]];
  static override usage = BaseCommand.Usage({
    category: "Project",
    description: "Pin one installed Worker root.",
    details: `
      Replaces the requirement for one installed root and resolves its complete
      Card closure. Selection is preserved by canonical root name, and config
      plus lock commit atomically.
    `,
    examples: [["Pin an installed root", "drwn pin @team/operator@1.2.3"]],
  });
  spec = Option.String({ required: true });
  write = Option.Boolean("--write", false);
  dryRun = Option.Boolean("--dry-run", false);
  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false);

  async execute() {
    try {
      const result = await pinProjectWorkerRoot(requireProjectRoot(this), this.context.agentsDir, this.spec, {
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
