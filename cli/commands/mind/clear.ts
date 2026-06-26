// ABOUTME: Implements `drwn mind clear` for deactivating the project stack.
// ABOUTME: Leaves installed cards and generated mind bundles untouched.

import { Option } from "clipanion";
import { renderJson } from "../../core/output";
import { readProjectConfigForWrite, writeProjectConfigForWrite } from "../../core/project-writes";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "../card/project-command";

export class MindClearCommand extends BaseCommand {
  static override paths = [["mind", "clear"]];

  static override usage = BaseCommand.Usage({
    category: "Minds",
    description: "Clear the active mind stack for this project.",
    details: `
      Sets activeMinds to an empty stack. Installed card bundles remain
      materialized, but the next drwn write removes active-stack projection.
    `,
    examples: [["Clear active minds", "drwn mind clear"]],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    const config = readProjectConfigForWrite(projectRoot);
    config.activeMinds = [];
    const configPath = writeProjectConfigForWrite(projectRoot, config);
    const payload = { activeMinds: [], configPath };
    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }
    this.context.stdout.write("Active minds cleared.\n");
    return 0;
  }
}
