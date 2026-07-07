// ABOUTME: Implements `drwn worker new` to scaffold a Worker Blueprint source (a kind:"blueprint" card).
// ABOUTME: A blueprint composes member cards plus governance; author it, then compose and publish.

import { Option } from "clipanion";
import { createCardSource } from "../../core/card-store";
import { BaseCommand } from "../base";

export class WorkerNewCommand extends BaseCommand {
  static override paths = [["worker", "new"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: 'Create an editable Worker Blueprint source (a kind:"blueprint" card).',
    details: `
      Scaffolds a blueprint source under ~/.agents/drwn/sources with an empty
      composedFrom. Add member cards with 'drwn worker compose', then ship it
      with 'drwn worker publish'.
    `,
    examples: [["Create a blueprint", "drwn worker new @your-handle/frontend-eng"]],
  });

  name = Option.String({ required: true });

  scope = Option.String("--scope", {
    description: "Scope to apply to an unscoped name (e.g. @your-handle).",
  });

  noGit = Option.Boolean("--no-git", false, {
    description: "Do not initialize a git repository in the new source directory.",
  });

  async execute() {
    try {
      const created = await createCardSource({
        agentsDir: this.context.agentsDir,
        name: this.name,
        scope: this.scope,
        noGit: this.noGit,
        kind: "blueprint",
      });
      this.context.stdout.write(`Created blueprint source ${created.name}: ${created.sourceDir}\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
