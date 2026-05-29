// ABOUTME: Implements `drwn library add skill` for installing skill bundles into local inventory.
// ABOUTME: Wraps the existing package-backed skill ingestion flow in the library mental model.

import { Option, UsageError } from "clipanion";
import { buildSkillInventory } from "../../../core/skills";
import { ingestSkillPackage } from "../../../core/skill-packages";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryAddSkillCommand extends BaseCommand {
  static override paths = [["library", "add", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Add a skill bundle to the local library.",
    details: `
      Adds a package-backed skill bundle to the local library using the same
      ingestion path used by catalog installs. This makes the bundle's skills
      available to drwn but does not activate them in any project.

      After adding a bundle, use drwn add skill or drwn skills curate to opt in
      to specific skills.
    `,
    examples: [
      ["Add a bundle from npm", "drwn library add skill @acme/skill-bundle"],
      ["Add a bundle from a local path", "drwn library add skill ./bundle.tgz"],
    ],
  });

  packageSpec = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      const inventory = await buildSkillInventory(this.context.repoRoot, this.context.agentsDir, this.context.homeDir);
      const installed = await ingestSkillPackage({
        agentsDir: this.context.agentsDir,
        packageSpec: this.packageSpec,
        existingSkillNames: new Set(inventory.map((skill) => skill.name)),
      });

      if (this.json) {
        this.context.stdout.write(renderJson(installed));
      } else {
        this.context.stdout.write(
          [
            `Added ${installed.packageName}@${installed.activeVersion} to the local library.`,
            "",
            "Next:",
            "  drwn add skill <skill-name>",
            "  drwn write --dry-run",
          ].join("\n") + "\n",
        );
      }
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
