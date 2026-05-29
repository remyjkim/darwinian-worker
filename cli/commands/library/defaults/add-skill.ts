// ABOUTME: Adds a skill to machine-wide defaults.
// ABOUTME: Maintains the ~/.agents/skills compatibility publication symlink.

import { Option, UsageError } from "clipanion";
import { loadConfig } from "../../../core/config";
import { addDefaultValue } from "../../../core/defaults";
import { loadRegistry } from "../../../core/registry";
import { curateSkill, findAvailableSkill } from "../../../core/skills";
import { loadOrInitializeUserConfig, saveUserConfig } from "../../../core/user-config";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryDefaultsAddSkillCommand extends BaseCommand {
  static override paths = [["library", "defaults", "add", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Add a shared skill to machine-wide defaults and curate it into the ~/.agents publication layer.",
    details: `
      Promotes a shared-scope skill to machine-wide defaults and curates it into
      ~/.agents/skills so downstream tools can consume it. Non-shared skills are
      rejected as global defaults.

      Use --dry-run to preview the default change without writing config or
      performing the curation side effect.
    `,
    examples: [
      ["Add a default skill", "drwn library defaults add skill alpha"],
      ["Preview the curation side effect", "drwn library defaults add skill alpha --dry-run"],
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

    const [repoConfig, registry] = await Promise.all([loadConfig(this.context.repoRoot), loadRegistry(this.context.repoRoot)]);
    const { path, config } = await loadOrInitializeUserConfig({
      repoConfig,
      registry,
      agentsDir: this.context.agentsDir,
    });
    config.defaults ??= {};
    const alreadyDefault = config.defaults.skills?.includes(this.skillName) === true;
    config.defaults.skills = addDefaultValue(config.defaults.skills, this.skillName);

    if (!this.dryRun) {
      await saveUserConfig(path, config);
      await curateSkill({ repoRoot: this.context.repoRoot, agentsDir: this.context.agentsDir }, this.skillName);
    }

    const payload = {
      kind: "skill",
      id: this.skillName,
      scope: "global-default",
      action: alreadyDefault ? "already-default" : "added",
      configPath: path,
      next: ["drwn write --dry-run"],
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
        "  drwn write --dry-run",
      ].join("\n") + "\n",
    );
    return 0;
  }
}
