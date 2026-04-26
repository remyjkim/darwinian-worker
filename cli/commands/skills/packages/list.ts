// ABOUTME: Implements bgng skills packages list for inspecting installed package-backed skill bundles.
// ABOUTME: Exposes the managed ~/.agents package cache without conflating it with curation or downstream sync.

import { Option } from "clipanion";
import { renderJson, renderTable } from "../../../../cli/core/output";
import { listInstalledSkillBundles } from "../../../../cli/core/skill-packages";
import { BaseCommand } from "../../base";

export class SkillsPackagesListCommand extends BaseCommand {
  static override paths = [["skills", "packages", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "List installed package-backed skill bundles.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const bundles = await listInstalledSkillBundles(this.context.agentsDir);
    if (this.json) {
      this.context.stdout.write(renderJson(bundles));
      return 0;
    }

    this.context.stdout.write(
      renderTable(
        ["package", "version", "skills"],
        bundles.map((bundle) => [bundle.packageName, bundle.activeVersion, String(bundle.manifest.skills.length)]),
      ),
    );
    return 0;
  }
}
