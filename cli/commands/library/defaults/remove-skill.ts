// ABOUTME: Removes a skill from machine-wide defaults.
// ABOUTME: Leaves the underlying repo or package-backed skill source intact.

import { Option, UsageError } from "clipanion";
import { existsSync } from "node:fs";
import { loadConfig } from "../../../core/config";
import { removeDefaultValue } from "../../../core/defaults";
import { loadRegistry } from "../../../core/registry";
import { findAvailableSkill, uncurateSkill } from "../../../core/skills";
import { loadOrInitializeUserConfig, saveUserConfig } from "../../../core/user-config";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryDefaultsRemoveSkillCommand extends BaseCommand {
  static override paths = [["library", "defaults", "remove", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Remove a skill from machine-wide defaults.",
    details: `
      Removes a skill from machine-wide defaults. When not in --dry-run mode,
      also removes the curated ~/.agents/skills link if it exists. The source
      skill in the repo or package cache is left intact.
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

    const [repoConfig, registry] = await Promise.all([loadConfig(this.context.repoRoot), loadRegistry(this.context.repoRoot)]);
    const { path, config } = await loadOrInitializeUserConfig({
      repoConfig,
      registry,
      agentsDir: this.context.agentsDir,
    });
    config.defaults ??= {};
    const wasDefault = config.defaults.skills?.includes(this.skillName) === true;
    config.defaults.skills = removeDefaultValue(config.defaults.skills, this.skillName);

    if (!this.dryRun) {
      await saveUserConfig(path, config);
      if (existsSync(`${this.context.agentsDir}/skills/${this.skillName}`)) {
        await uncurateSkill({ agentsDir: this.context.agentsDir }, this.skillName);
      }
    }

    const payload = {
      kind: "skill",
      id: this.skillName,
      scope: "global-default",
      action: wasDefault ? "removed" : "not-default",
      configPath: path,
      next: ["drwn write --dry-run"],
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
        "  drwn write --dry-run",
      ].join("\n") + "\n",
    );
    return 0;
  }
}
