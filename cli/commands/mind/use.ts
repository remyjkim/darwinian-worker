// ABOUTME: Implements `drwn mind use` for active-stack selection.
// ABOUTME: Persists ordered active minds in project config without changing installed cards.

import { Option } from "clipanion";
import { renderJson } from "../../core/output";
import { readProjectConfigForWrite, writeProjectConfigForWrite } from "../../core/project-writes";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "../card/project-command";
import { readInstalledMinds } from "./list";

export class MindUseCommand extends BaseCommand {
  static override paths = [["mind", "use"]];

  static override usage = BaseCommand.Usage({
    category: "Minds",
    description: "Set the ordered active mind stack for this project.",
    details: `
      Persists activeMinds in project config. The next drwn write projects only
      this ordered stack into downstream tool surfaces.
    `,
    examples: [["Activate two minds", "drwn mind use @team/base @team/frontend"]],
  });

  names = Option.Rest({ required: 1 });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    const installed = await readInstalledMinds(projectRoot);
    const installedNames = new Set(installed.map((mind) => mind.name));
    const missing = this.names.filter((name) => !installedNames.has(name));
    if (missing.length > 0) {
      this.context.stderr.write(`Mind is not installed in this project: ${missing.join(", ")}\n`);
      return 1;
    }
    const activeMinds = [...this.names];
    const config = readProjectConfigForWrite(projectRoot);
    config.activeMinds = activeMinds;
    const configPath = writeProjectConfigForWrite(projectRoot, config);
    const payload = { activeMinds, configPath };
    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }
    this.context.stdout.write(`Active minds: ${activeMinds.join(", ")}\n`);
    return 0;
  }
}
