// ABOUTME: Implements bgng skills packages show for displaying one installed package-backed skill bundle.
// ABOUTME: Surfaces manifest and skill metadata so operators can inspect available extension content before curation.

import { Option, UsageError } from "clipanion";
import { renderJson } from "../../../../cli/core/output";
import { getInstalledSkillBundle } from "../../../../cli/core/skill-packages";
import { BaseCommand } from "../../base";

export class SkillsPackagesShowCommand extends BaseCommand {
  static override paths = [["skills", "packages", "show"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Show one installed package-backed skill bundle.",
    details: `
      Shows metadata for one installed package-backed skill bundle, including
      the active version and the skills shipped by the bundle.

      This command is read-only.
    `,
    examples: [
      ["Show a bundle", "bgng skills packages show @acme/skills-sample"],
      ["Show a bundle as JSON", "bgng skills packages show @acme/skills-sample --json"],
    ],
  });

  packageName = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const bundle = await getInstalledSkillBundle(this.context.agentsDir, this.packageName);
    if (!bundle) {
      throw new UsageError(`Unknown installed skill bundle: ${this.packageName}`);
    }

    if (this.json) {
      this.context.stdout.write(renderJson(bundle));
      return 0;
    }

    const lines = [
      `Package: ${bundle.packageName}`,
      `Version: ${bundle.activeVersion}`,
      `Skills: ${bundle.manifest.skills.length}`,
      ...bundle.manifest.skills.map((skill) => `- ${skill.name} (${skill.scope})`),
    ];
    this.context.stdout.write(`${lines.join("\n")}\n`);
    return 0;
  }
}
