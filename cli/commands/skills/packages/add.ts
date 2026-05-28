// ABOUTME: Implements bgng skills packages add for installing package-backed skill bundles into ~/.agents.
// ABOUTME: Keeps package-backed skills as available sources only; curation and write remain separate steps.

import { Option, UsageError } from "clipanion";
import { buildSkillInventory } from "../../../../cli/core/skills";
import { ingestSkillPackage } from "../../../../cli/core/skill-packages";
import { renderJson } from "../../../../cli/core/output";
import { BaseCommand } from "../../base";

export class SkillsPackagesAddCommand extends BaseCommand {
  static override paths = [["skills", "packages", "add"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Add a package-backed skill bundle to the managed local cache.",
    details: `
      Installs a package-backed skill bundle into the managed local cache under
      ~/.agents. Installed package skills become visible to library and add
      commands, but are not automatically activated in any project.

      Use bgng add skill, bgng skills curate, or library defaults commands to
      opt into installed skills.
    `,
    examples: [
      ["Install a bundle from npm", "bgng skills packages add @acme/skill-bundle"],
      ["Install a bundle from a local tarball", "bgng skills packages add ./bundle.tgz"],
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

      this.context.stdout.write(this.json ? renderJson(installed) : `${installed.packageName}@${installed.activeVersion}\n`);
      return 0;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
}
