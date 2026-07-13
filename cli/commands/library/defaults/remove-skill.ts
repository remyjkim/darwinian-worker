// ABOUTME: Removes a skill from machine-wide defaults.
// ABOUTME: Leaves the underlying repo or package-backed skill source intact.

import { Option, UsageError } from "clipanion";
import { removeDefaultValue } from "../../../core/defaults";
import { readMachineConfig, writeMachineConfig } from "../../../core/card-store";
import { findAvailableSkill } from "../../../core/skills";
import { resolveMachineConfigPath } from "../../../core/store-paths";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryDefaultsRemoveSkillCommand extends BaseCommand {
  static override paths = [["library", "defaults", "remove", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Remove a skill from machine-wide defaults.",
    details: `
      Removes an explicit machine skill selection. The source skill in the
      Library and any profile-provided copy remain intact.
    `,
    examples: [
      ["Remove a default skill", "drwn library defaults remove skill alpha"],
      ["Preview removing a default skill", "drwn library defaults remove skill alpha --dry-run"],
    ],
  });

  skillName = Option.String({ required: true });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview global default changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const skill = await findAvailableSkill(this.context.repoRoot, this.context.agentsDir, this.skillName);
    if (!skill) {
      throw new UsageError(`Unknown skill: ${this.skillName}`);
    }

    const path = resolveMachineConfigPath(this.context.agentsDir);
    const config = await readMachineConfig(this.context.agentsDir);
    const defaults = config.capabilities.skills;
    const wasDefault = defaults.includes(this.skillName);
    config.capabilities.skills = removeDefaultValue(defaults, this.skillName);

    if (!this.dryRun) {
      await writeMachineConfig(this.context.agentsDir, config);
    }

    const payload = {
      kind: "skill",
      id: this.skillName,
      scope: "machine-explicit",
      action: wasDefault ? "removed" : "not-default",
      configPath: path,
      next: ["drwn write --scope machine --dry-run"],
    };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      [
        wasDefault
          ? `Removed ${this.skillName} from global default skills.`
          : `${this.skillName} was not a global default skill.`,
        ...(this.dryRun ? [`Would update ${path}`] : [`Updated ${path}`]),
        "",
        "Next:",
        "  drwn write --scope machine --dry-run",
      ].join("\n") + "\n",
    );
    return 0;
  }
}
