// ABOUTME: Implements `drwn library add skill` for installing skill bundles into local inventory.
// ABOUTME: Wraps the existing package-backed skill ingestion flow in the library mental model.

import { Option, UsageError } from "clipanion";
import { buildSkillInventory } from "../../../core/skills";
import { classifySkillAddInput, ingestLooseSkill, ingestSkillPackage } from "../../../core/skill-packages";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryAddSkillCommand extends BaseCommand {
  static override paths = [["library", "add", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Add a skill bundle or local SKILL.md to the local library.",
    details: `
      Adds a package-backed skill bundle or a loose local SKILL.md directory to
      the local library. This makes the bundle's skills available to drwn but
      does not activate them in any project.

      After adding a bundle, use drwn add skill or drwn skills curate to opt in
      to specific skills.
    `,
    examples: [
      ["Add a bundle from npm", "drwn library add skill @acme/skill-bundle"],
      ["Add a bundle from a local path", "drwn library add skill ./bundle.tgz"],
      ["Add a local loose skill", "drwn library add skill ./SKILL.md --as import-mcp-from-claude"],
    ],
  });

  packageSpec = Option.String({ required: true });

  as = Option.String("--as", { required: false, description: "Skill name to use when importing a loose SKILL.md." });

  scope = Option.String("--scope", {
    required: false,
    description: "Skill scope for loose imports: shared, claude-only, codex-only, or experimental.",
  });

  packageName = Option.String("--package-name", {
    required: false,
    description: "Synthetic package name for a loose import. Defaults to @local/<skill-name>.",
  });

  version = Option.String("--version", {
    required: false,
    description: "Synthetic package version for a loose import. Defaults to 0.1.0.",
  });

  replace = Option.Boolean("--replace", false, {
    description: "Replace an existing installed skill only when it came from the same package.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      const inventory = await buildSkillInventory(this.context.repoRoot, this.context.agentsDir, this.context.homeDir);
      const existingSkillNames = new Set(inventory.map((skill) => skill.name));
      const existingSkills = inventory.map((skill) => ({
        name: skill.name,
        sourceType: skill.sourceType,
        sourceId: skill.sourceId,
      }));
      const inputKind = classifySkillAddInput(this.packageSpec);
      const installed = inputKind === "loose-skill"
        ? await ingestLooseSkill({
            agentsDir: this.context.agentsDir,
            sourcePath: this.packageSpec,
            existingSkillNames,
            existingSkills,
            as: this.as,
            scope: this.scope as Parameters<typeof ingestLooseSkill>[0]["scope"],
            packageName: this.packageName,
            version: this.version,
            replace: this.replace,
          })
        : await ingestSkillPackage({
            agentsDir: this.context.agentsDir,
            packageSpec: this.packageSpec,
            existingSkillNames,
            existingSkills,
            replace: this.replace,
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
