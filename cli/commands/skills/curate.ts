// ABOUTME: Implements the `bgng skills curate` command for publishing shared skills to ~/.agents/skills.
// ABOUTME: Validates the requested skill and uses the core curation helper rather than ad hoc symlink logic.

import { Option, UsageError } from "clipanion";
import { curateSkill } from "../../../cli/core/skills";
import { renderJson } from "../../../cli/core/output";
import { BaseCommand } from "../base";

export class SkillsCurateCommand extends BaseCommand {
  static override paths = [["skills", "curate"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Curate a shared skill into the ~/.agents publication layer.",
    details: `
      Publishes a shared-scope skill into ~/.agents/skills by creating the
      compatibility symlink expected by downstream tools. The source skill
      remains in the repo or package cache.

      Only shared-scope skills can be curated. To remove the publication-layer
      link, use bgng skills uncurate.
    `,
    examples: [
      ["Curate a skill", "bgng skills curate alpha"],
      ["Curate and print JSON", "bgng skills curate alpha --json"],
    ],
  });

  skillName = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      const curatedPath = await curateSkill(
        {
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
        },
        this.skillName,
      );
      this.context.stdout.write(this.json ? renderJson({ curatedPath }) : `${curatedPath}\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
