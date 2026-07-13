// ABOUTME: Implements `drwn worker stack clear` for deactivating the project stack.
// ABOUTME: Leaves installed cards and generated worker bundles untouched.

import { Option } from "clipanion";
import { renderJson } from "../../../core/output";
import { readProjectConfigForWrite, writeProjectConfigForWrite } from "../../../core/project-writes";
import { BaseCommand } from "../../base";
import { requireProjectRoot } from "../../card/project-command";

export class WorkerStackClearCommand extends BaseCommand {
  static override paths = [["worker", "stack", "clear"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Clear the active worker stack for this project.",
    details: `
      Sets activeWorkers to an empty stack. Installed card bundles remain
      materialized, but the next drwn write removes active-stack projection.
    `,
    examples: [["Clear active workers", "drwn worker stack clear"]],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    const config = readProjectConfigForWrite(projectRoot);
    config.activeWorker = null;
    const configPath = writeProjectConfigForWrite(projectRoot, config);
    const payload = { activeWorkers: [], configPath };
    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }
    this.context.stdout.write("Active workers cleared.\n");
    return 0;
  }
}
