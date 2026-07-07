// ABOUTME: Implements drwn use as clone-if-absent, apply, and write orchestration.
// ABOUTME: Thin porcelain over existing card apply and materialization paths.

import { Option } from "clipanion";
import { applyProjectCardSpecs } from "../core/card-project";
import { registerProject } from "../core/project-registry";
import { syncRepository } from "../core/sync";
import { renderSyncResult } from "../core/output";
import { findProjectConfig, resolveProjectRootFromConfigPath } from "../core/project";
import { BaseCommand } from "./base";

export class UseCommand extends BaseCommand {
  static override paths = [["use"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Apply a card ref to the current project and materialize it.",
    details: `
      Replaces project cards with this ref, then runs drwn write to vendor and
      materialize projection surfaces. Use drwn card add to append instead of replace.
    `,
    examples: [["Use a card", "drwn use @me/backend@^1.0.0"]],
  });

  ref = Option.String({ required: true });
  dryRun = Option.Boolean("--dry-run", false, { description: "Preview without writing." });

  async execute() {
    const projectConfigPath = findProjectConfig(this.context.cwd);
    if (!projectConfigPath) {
      this.context.stderr.write("Run drwn use inside a project.\n");
      return 1;
    }
    const projectRoot = resolveProjectRootFromConfigPath(projectConfigPath);
    if (this.dryRun) {
      this.context.stdout.write(`Would apply ${this.ref} and run drwn write in ${projectRoot}\n`);
      return 0;
    }
    const mutation = await applyProjectCardSpecs(projectRoot, this.context.agentsDir, [this.ref], {
      repoRoot: this.context.repoRoot,
      cwd: this.context.cwd,
    });
    await registerProject(this.context.agentsDir, projectRoot);
    this.context.stdout.write(`Applied ${this.ref}\n`);
    const result = await syncRepository({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      cwd: this.context.cwd,
    });
    this.context.stdout.write(`${renderSyncResult(result)}Cards: ${mutation.locked.map((c) => c.name).join(", ")}\n`);
    return 0;
  }
}
