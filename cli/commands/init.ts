// ABOUTME: Implements the bgng init command for creating per-project config scaffolding.
// ABOUTME: Keeps project bootstrap simple and explicit without mutating gitignore or other repo state.

import { Option } from "clipanion";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scaffoldProjectConfig } from "../core/project";
import { BaseCommand } from "./base";

export class InitCommand extends BaseCommand {
  static override paths = [["init"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Create per-project configuration.",
  });

  force = Option.Boolean("--force", false, {
    description: "Overwrite an existing project config.",
  });

  async execute() {
    const projectDir = process.cwd();
    const configPath = await scaffoldProjectConfig(projectDir, { force: this.force });
    const gitignorePath = join(projectDir, ".gitignore");
    const messages: string[] = [`Created project config: ${configPath}`];

    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, "utf8");
      if (gitignore.includes(".agents")) {
        messages.push("Warning: .gitignore appears to exclude .agents; this config may not be shared with collaborators.");
      }
    }

    this.context.stdout.write(`${messages.join("\n")}\n`);
    return 0;
  }
}
