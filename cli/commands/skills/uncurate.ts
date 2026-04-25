// ABOUTME: Implements the `agents skills uncurate` command for removing skills from ~/.agents/skills.
// ABOUTME: Only removes the curated publication-layer link; downstream tool cleanup remains explicit.

import { Option, UsageError } from "clipanion";
import { uncurateSkill } from "../../../cli/core/skills";
import { BaseCommand } from "../base";

export class SkillsUncurateCommand extends BaseCommand {
  static override paths = [["skills", "uncurate"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Remove a skill from the ~/.agents curated publication layer.",
  });

  skillName = Option.String({ required: true });

  async execute() {
    try {
      await uncurateSkill({ agentsDir: this.context.agentsDir }, this.skillName);
      this.context.stdout.write(`${this.skillName}\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
