// ABOUTME: Implements the `agents skills curate` command for publishing shared skills to ~/.agents/skills.
// ABOUTME: Validates the requested skill and uses the core curation helper rather than ad hoc symlink logic.

import { Option, UsageError } from "clipanion";
import { curateSkill } from "../../../cli/core/skills";
import { BaseCommand } from "../base";

export class SkillsCurateCommand extends BaseCommand {
  static override paths = [["skills", "curate"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Curate a shared skill into the ~/.agents publication layer.",
  });

  skillName = Option.String({ required: true });

  async execute() {
    try {
      const curatedPath = await curateSkill(
        {
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
        },
        this.skillName,
      );
      this.context.stdout.write(`${curatedPath}\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
