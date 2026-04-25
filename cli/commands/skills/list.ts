// ABOUTME: Implements the `agents skills list` command for listing repo and curated skills.
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
