// ABOUTME: Implements the `drwn skills uncurate` command for removing skills from ~/.agents/skills.
// ABOUTME: Only removes the curated publication-layer link; downstream tool cleanup remains explicit.

import { Option, UsageError } from "clipanion";
import { join } from "node:path";
import { uncurateSkill } from "../../../cli/core/skills";
import { renderJson } from "../../../cli/core/output";
import { BaseCommand } from "../base";

export class SkillsUncurateCommand extends BaseCommand {
  static override paths = [["skills", "uncurate"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Remove a skill from the ~/.agents curated publication layer.",
    details: `
      Removes the skill's publication-layer symlink from ~/.agents/skills. This
      does not delete the source skill from the repo or package cache, and it
      does not directly clean downstream tool directories.

      Run drwn write afterward to update downstream tool state.
    `,
    examples: [
      ["Uncurate a skill", "drwn skills uncurate alpha"],
      ["Uncurate and print JSON", "drwn skills uncurate alpha --json"],
    ],
  });

  skillName = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      const uncuratedPath = join(this.context.agentsDir, "skills", this.skillName);
      await uncurateSkill({ agentsDir: this.context.agentsDir }, this.skillName);
      this.context.stdout.write(this.json ? renderJson({ uncuratedPath }) : `${this.skillName}\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
