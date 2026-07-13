// ABOUTME: Implements project-first extension activation through `drwn extensions add`.
// ABOUTME: Writes semantic project config without running external setup commands.

import { Option, UsageError } from "clipanion";
import { normalizeBeadsTargets } from "../../core/extensions/beads";
import { getExtension } from "../../core/extensions/registry";
import { buildMarkitdownProjectConfig } from "../../core/extensions/markitdown";
import { buildParallelProjectConfig } from "../../core/extensions/parallel";
import { projectConfigPath, setProjectExtensionConfig } from "../../core/project-writes";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class ExtensionsAddCommand extends BaseCommand {
  static override paths = [["extensions", "add"]];

  static override usage = BaseCommand.Usage({
    category: "Add",
    description: "Add an extension to the current project.",
    details: `
      Writes or merges the extension config into
      <project>/.agents/drwn/config.json without running external setup
      commands. Use drwn extensions setup <name> when an extension has CLI
      prerequisites or project initialization work.

      Some flags apply only to specific extensions. For example, --target and
      --include-skill are Beads-oriented project settings.
    `,
    examples: [
      ["Enable Parallel in this project", "drwn extensions add parallel"],
      ["Enable Beads with its project skill", "drwn extensions add beads --include-skill"],
      ["Preview a MarkItDown project config change", "drwn extensions add markitdown --dry-run"],
    ],
  });

  extensionName = Option.String({ required: true });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview project config changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  mcp = Option.Boolean("--mcp", false, {
    description: "Enable extension MCP mode when supported.",
  });

  skipSkills = Option.Boolean("--skip-skills", false, {
    description: "Do not enable extension skills when supported.",
  });

  target = Option.String("--target", {
    description: "Comma-separated Beads setup targets. Beads only.",
  });

  includeSkill = Option.Boolean("--include-skill", false, {
    description: "Include the extension's project skill when supported. Beads only today.",
  });

  async execute() {
    const extension = getExtension(this.extensionName);
    if (!extension) {
      throw new UsageError(`Unknown extension: ${this.extensionName}`);
    }

    const projectDir = this.context.cwd;
    const configPath = projectConfigPath(projectDir);
    let extensionConfig;
    const next: string[] = ["drwn write --dry-run"];

    if (this.extensionName === "parallel") {
      extensionConfig = buildParallelProjectConfig({ skills: !this.skipSkills, mcp: this.mcp });
    } else if (this.extensionName === "markitdown") {
      extensionConfig = buildMarkitdownProjectConfig({ skills: !this.skipSkills });
      next.unshift("drwn extensions setup markitdown");
    } else if (this.extensionName === "beads") {
      let targets;
      try {
        targets = normalizeBeadsTargets(this.target);
      } catch (error) {
        throw new UsageError(error instanceof Error ? error.message : "Invalid Beads setup target.");
      }
      extensionConfig = { enabled: true, targets, includeSkill: this.includeSkill };
      next.unshift(`drwn extensions setup beads --target=${targets.join(",")}`);
    } else {
      throw new UsageError(`Adding this extension is not implemented yet: ${this.extensionName}`);
    }

    const payload = {
      kind: "extension",
      id: this.extensionName,
      projectConfigPath: configPath,
      projectChanges: [{ kind: "extension", id: this.extensionName, action: "enabled" }],
      next,
    };

    if (!this.dryRun) {
      await setProjectExtensionConfig(projectDir, this.extensionName, extensionConfig);
    }

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      [
        `Added ${extension.displayName} extension to this project.`,
        ...(this.dryRun ? [`Would update ${configPath}`] : [`Updated ${configPath}`]),
        "",
        "Next:",
        ...next.map((command) => `  ${command}`),
      ].join("\n") + "\n",
    );
    return 0;
  }
}
