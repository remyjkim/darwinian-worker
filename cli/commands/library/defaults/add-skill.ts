// ABOUTME: Adds a skill to machine-wide defaults.
// ABOUTME: Mutates explicit machine intent without projecting or curating files.

import { Option, UsageError } from "clipanion";
import { addDefaultValue } from "../../../core/defaults";
import { readMachineConfig, writeMachineConfig } from "../../../core/card-store";
import { findAvailableSkill } from "../../../core/skills";
import { resolveMachineConfigPath } from "../../../core/store-paths";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryDefaultsAddSkillCommand extends BaseCommand {
  static override paths = [["library", "defaults", "add", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Add a shared skill to explicit machine capability selections.",
    details: `
      Selects a shared-scope Library skill as explicit machine capability
      intent. Non-shared skills are rejected as machine defaults.

      Use --dry-run to preview without initializing or writing machine state.
    `,
    examples: [
      ["Add a default skill", "drwn library defaults add skill alpha"],
      ["Preview a machine selection", "drwn library defaults add skill alpha --dry-run"],
      ["Add a package-backed skill as JSON", "drwn library defaults add skill hello-skill --json"],
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
    if (skill.scope !== "shared") {
      throw new UsageError(`Only shared skills can be global defaults: ${this.skillName}`);
    }

    const path = resolveMachineConfigPath(this.context.agentsDir);
    const config = await readMachineConfig(this.context.agentsDir);
    const defaults = config.capabilities.skills;
    const alreadyDefault = defaults.includes(this.skillName);
    config.capabilities.skills = addDefaultValue(defaults, this.skillName);

    if (!this.dryRun) {
      await writeMachineConfig(this.context.agentsDir, config);
    }

    const payload = {
      kind: "skill",
      id: this.skillName,
      scope: "machine-explicit",
      action: alreadyDefault ? "already-default" : "added",
      configPath: path,
      next: ["drwn write --scope machine --dry-run"],
    };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      [
        alreadyDefault
          ? `${this.skillName} is already a global default skill.`
          : `Added ${this.skillName} as a global default skill.`,
        ...(this.dryRun ? [`Would update ${path}`] : [`Updated ${path}`]),
        "",
        "Next:",
        "  drwn write --scope machine --dry-run",
      ].join("\n") + "\n",
    );
    return 0;
  }
}
