// ABOUTME: Implements the `bgng skills list` command for listing repo and curated skills.
// ABOUTME: Supports both human-readable and JSON output for operator and agent workflows.

import { Option } from "clipanion";
import { renderJson, renderTable } from "../../../cli/core/output";
import { buildSkillInventory } from "../../../cli/core/skills";
import { BaseCommand } from "../base";

export class SkillsListCommand extends BaseCommand {
  static override paths = [["skills", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "List repo skills with scope and curation status.",
    details: `
      Lists every skill bgng can see, including repo-native skills and
      package-backed skills. Shows each skill's scope and whether it is curated
      into ~/.agents/skills or linked into downstream tools.

      This command is read-only.
    `,
    examples: [
      ["List skills", "bgng skills list"],
      ["List skills as JSON", "bgng skills list --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const inventory = await buildSkillInventory(this.context.repoRoot, this.context.agentsDir, this.context.homeDir);

    if (this.json) {
      this.context.stdout.write(renderJson(inventory));
      return 0;
    }

    const rows = inventory.map((skill) => [
      skill.name,
      skill.scope,
      skill.curated ? "curated" : "uncurated",
      skill.claudeLinked ? "yes" : "no",
      skill.codexLinked ? "yes" : "no",
    ]);

    this.context.stdout.write(renderTable(["name", "scope", "curation", "claude", "codex"], rows));
    return 0;
  }
}
