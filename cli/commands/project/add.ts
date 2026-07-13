// ABOUTME: Implements canonical `drwn add <ref>` for appending one project Worker root.
// ABOUTME: Commits supported config and lock V1 documents together before optional materialization.

import { Option } from "clipanion";
import { addProjectWorkerRoot } from "../../core/worker-project";
import { BaseCommand } from "../base";
import { renderWorkerMutation, requireProjectRoot, runChainedWrite } from "../card/project-command";

export class ProjectAddCommand extends BaseCommand {
  static override paths = [["add"]];
  static override usage = BaseCommand.Usage({
    category: "Project",
    description: "Add one Worker root to this project.",
    details: `
      Resolves one plain Card or Blueprint as a top-level Worker root and commits
      project config and lock together. A Blueprint's Cards are closure members,
      not additional roots. The first added root is selected explicitly.
    `,
    examples: [
      ["Add a Blueprint root", "drwn add @team/operator@^1.0.0"],
      ["Add without projecting", "drwn add @team/alternate@^1.0.0"],
    ],
  });
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
      for (const card of result.locked) {
        if (card.hooks.length > 0 && !card.hookConsent) {
          this.context.stderr.write(
            `Warning: ${card.name}@${card.version} declares hooks but has no hook consent. Run drwn card trust ${card.name} --hooks before drwn write materializes them.\n`,
          );
        }
      }
      this.context.stdout.write(renderWorkerMutation(result));
      return this.write && !this.dryRun ? runChainedWrite(this) : 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
