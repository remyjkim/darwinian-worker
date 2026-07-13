// ABOUTME: Implements drwn skills packages add for installing package-backed skill bundles into the Store.
// ABOUTME: Keeps package-backed skills as available Library sources without activating them.

import { Option, UsageError } from "clipanion";
import { buildSkillInventory } from "../../../../cli/core/skills";
import {
  classifySkillAddInput,
  installLooseSkill,
  installSkillPackage,
  updateLooseSkill,
  updateSkillPackage,
} from "../../../../cli/core/skill-packages";
import { renderJson } from "../../../../cli/core/output";
import { ensureStoreInitialized } from "../../../../cli/core/card-store";
import { BaseCommand } from "../../base";

export class SkillsPackagesAddCommand extends BaseCommand {
  static override paths = [["skills", "packages", "add"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Add a package-backed skill bundle or local SKILL.md to the managed local cache.",
    details: `
      Installs a package-backed skill bundle or loose local SKILL.md into the
      managed local cache under ~/.agents. Installed package skills become
      visible to library and add commands, but are not automatically activated
      in any project.

      Use drwn add skill or drwn library defaults add skill to opt into an
      installed skill.
    `,
    examples: [
      ["Install a bundle from npm", "drwn skills packages add @acme/skill-bundle"],
      ["Install a bundle from a local tarball", "drwn skills packages add ./bundle.tgz"],
      ["Install a local loose skill", "drwn skills packages add ./SKILL.md --as import-mcp-from-claude"],
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
      await ensureStoreInitialized(this.context.agentsDir);
      const inventory = await buildSkillInventory(this.context.repoRoot, this.context.agentsDir, this.context.homeDir);
      const existingSkillNames = new Set(inventory.map((skill) => skill.name));
      const existingSkills = inventory.map((skill) => ({
        name: skill.name,
        sourceType: skill.sourceType,
        sourceId: skill.sourceId,
      }));
      const inputKind = classifySkillAddInput(this.packageSpec);
      const installed = inputKind === "loose-skill"
        ? await (this.replace ? updateLooseSkill : installLooseSkill)({
            agentsDir: this.context.agentsDir,
            sourcePath: this.packageSpec,
            existingSkillNames,
            existingSkills,
            as: this.as,
            scope: this.scope as Parameters<typeof installLooseSkill>[0]["scope"],
            packageName: this.packageName,
            version: this.version,
          })
        : this.replace
          ? await updateSkillPackage({
              agentsDir: this.context.agentsDir,
              packageSpec: this.packageSpec,
              packageName: this.packageSpec,
              existingSkillNames,
              existingSkills,
            })
          : await installSkillPackage({
              agentsDir: this.context.agentsDir,
              packageSpec: this.packageSpec,
              existingSkillNames,
              existingSkills,
            });

      this.context.stdout.write(this.json ? renderJson(installed) : `${installed.packageName}@${installed.activeVersion}\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
