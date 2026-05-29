// ABOUTME: Implements `drwn card new` for creating editable local card sources.
// ABOUTME: Persists authoring scope so repeated card creation stays concise.

import { Option } from "clipanion";
import { createCardSource, readMachineConfig } from "../../core/card-store";
import { BaseCommand } from "../base";

export class CardNewCommand extends BaseCommand {
  static override paths = [["card", "new"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Create an editable Harness Card source under ~/.agents/bgng/sources.",
    details: `
      Creates a source directory with card.json, skills/, and mcp-servers/.
      Unscoped names require --scope or a saved authoring.scope in machine.json.
      By default the source directory is initialized as a git repository.
    `,
    examples: [
      ["Create a scoped card source", "drwn card new backend --scope @me"],
      ["Create a fully-qualified card source", "drwn card new @me/backend --no-git"],
    ],
  });

  name = Option.String({ required: true });

  scope = Option.String("--scope", {
    description: "Scope to apply to an unscoped card name, such as @me.",
  });

  noGit = Option.Boolean("--no-git", false, {
    description: "Do not initialize a git repository in the new source directory.",
  });

  async execute() {
    const machine = await readMachineConfig(this.context.agentsDir);
    let source;
    try {
      source = await createCardSource({
        agentsDir: this.context.agentsDir,
        name: this.name,
        scope: this.scope ?? machine.authoring?.scope,
        noGit: this.noGit,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    this.context.stdout.write(`Created card source ${source.name}: ${source.sourceDir}\n`);
    return 0;
  }
}
