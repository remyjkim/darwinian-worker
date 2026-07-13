// ABOUTME: Implements `drwn worker stack use` for active-stack selection.
// ABOUTME: Persists ordered active workers in project config without changing installed cards.

import { Option } from "clipanion";
import { renderJson } from "../../../core/output";
import { readProjectConfigForWrite, writeProjectConfigForWrite } from "../../../core/project-writes";
import { BaseCommand } from "../../base";
import { requireProjectRoot } from "../../card/project-command";
import { readInstalledWorkers } from "./list";

export class WorkerStackUseCommand extends BaseCommand {
  static override paths = [["worker", "stack", "use"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Set the ordered active worker stack for this project.",
    details: `
      Persists activeWorkers in project config. The next drwn write projects only
      this ordered stack into downstream tool surfaces.
    `,
    examples: [["Activate two workers", "drwn worker stack use @team/base @team/frontend"]],
  });

  names = Option.Rest({ required: 1 });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    const installed = await readInstalledWorkers(projectRoot);
    const installedNames = new Set(installed.map((worker) => worker.name));
    const missing = this.names.filter((name) => !installedNames.has(name));
    if (missing.length > 0) {
      this.context.stderr.write(`Worker is not installed in this project: ${missing.join(", ")}\n`);
      return 1;
    }
    const activeWorkers = [...this.names];
    const config = readProjectConfigForWrite(projectRoot);
    config.activeWorker = activeWorkers[0]!;
    const configPath = writeProjectConfigForWrite(projectRoot, config);
    const payload = { activeWorkers, configPath };
    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }
    this.context.stdout.write(`Active workers: ${activeWorkers.join(", ")}\n`);
    return 0;
  }
}
