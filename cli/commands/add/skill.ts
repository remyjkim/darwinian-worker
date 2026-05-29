// ABOUTME: Implements project-first skill activation through `drwn add skill`.
// ABOUTME: Adds local library skills to project config without global curation.

import { Option, UsageError } from "clipanion";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "../../core/config";
import { findLibrarySkill } from "../../core/library";
import { includeProjectSkill, projectConfigPath } from "../../core/project-writes";
import { buildSkillInventory } from "../../core/skills";
import { ingestSkillPackage } from "../../core/skill-packages";
import { searchSkills, type SearchResult } from "../../core/search";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

function isCatalogSkillPackage(
  result: SearchResult,
): result is Extract<SearchResult, { sourceGroup: "catalog" }> & { kind: "skill-package"; packageName?: string } {
  return (
    result.sourceGroup === "catalog" &&
    result.kind === "skill-package"
  );
}

export class AddSkillCommand extends BaseCommand {
  static override paths = [["add", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Add",
    description: "Add a skill to the current project. Prompts in a TTY when no name is given; --yes can install an unambiguous catalog bundle.",
    details: `
      Adds one skill to the current project overlay. Looks in the local library
      first; with --yes, can install a missing skill bundle from the configured
      npm-skill catalog before activating the requested skill.

      Prompts in a TTY when no query or name is given. Use --all with a bundle
      package name to add every skill from that installed bundle.
    `,
    examples: [
      ["Add a local skill", "drwn add skill alpha"],
      ["Install a catalog bundle and add one skill", "drwn add skill hello --yes"],
      ["Add every skill from a bundle", "drwn add skill @acme/skill-bundle --yes --all"],
    ],
  });

  queryOrName = Option.String({ required: false });

  libraryOnly = Option.Boolean("--library", false, {
    description: "Only search the local library.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview project config changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  yes = Option.Boolean("--yes", false, {
    description: "Confirm non-interactive catalog install when the result is unambiguous.",
  });

  all = Option.Boolean("--all", false, {
    description: "Add all skills from an installed catalog bundle (use with a bundle package name).",
  });

  async execute() {
    const queryOrName = this.queryOrName ?? await this.resolveGuidedQuery();
    if (!queryOrName) {
      throw new UsageError("Pass a skill name or query. Guided add requires a TTY.");
    }

    let skill = await findLibrarySkill(this.context.repoRoot, this.context.agentsDir, this.context.homeDir, queryOrName);
    const libraryChanges: Array<{ kind: string; id: string; action: string }> = [];
    let skillIds: string[] = [];

    if (!skill) {
      if (this.libraryOnly) {
        throw new UsageError(`No local skill found: ${queryOrName}.`);
      }
      if (!this.yes) {
        throw new UsageError(`No local skill found: ${queryOrName}. Use --yes to install an unambiguous catalog result.`);
      }

      const config = await loadConfig(this.context.repoRoot);
      const search = await searchSkills({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        config,
        query: queryOrName,
        catalogOnly: true,
      });
      const packages = search.results.filter(isCatalogSkillPackage);
      if (packages.length !== 1) {
        throw new UsageError(`Catalog skill search is ambiguous for: ${queryOrName}`);
      }
      const packageName = packages[0]?.packageName;
      if (!packageName) {
        throw new UsageError(`Catalog skill result is missing a package name: ${queryOrName}`);
      }

      const inventory = await buildSkillInventory(this.context.repoRoot, this.context.agentsDir, this.context.homeDir);
      const installed = await ingestSkillPackage({
        agentsDir: this.context.agentsDir,
        packageSpec: packageName,
        existingSkillNames: new Set(inventory.map((item) => item.name)),
      });
      libraryChanges.push({ kind: "skill-package", id: installed.packageName, action: "installed" });
      const available = installed.manifest.skills.map((entry) => entry.name);
      if (this.all) {
        skillIds = available;
      } else {
        const exact = available.find((name) => name === queryOrName);
        skillIds = exact ? [exact] : available.length === 1 ? available : [];
      }
      if (skillIds.length === 0) {
        throw new UsageError(`Installed bundle contains multiple skills; rerun with an exact skill name or --all.`);
      }
      skill = await findLibrarySkill(this.context.repoRoot, this.context.agentsDir, this.context.homeDir, skillIds[0] ?? "");
    } else {
      skillIds = [skill.id];
    }

    const configPath = projectConfigPath(this.context.cwd);
    const payload = {
      kind: "skill",
      id: skillIds.length === 1 ? skillIds[0] : queryOrName,
      projectConfigPath: configPath,
      libraryChanges,
      projectChanges: skillIds.map((id) => ({ kind: "skill", id, action: "included" })),
      next: ["drwn write --dry-run"],
    };

    if (!this.dryRun) {
      for (const id of skillIds) {
        includeProjectSkill(this.context.cwd, id);
      }
    }

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      [
        `Added ${skillIds.join(", ")} to this project.`,
        ...(this.dryRun ? [`Would update ${configPath}`] : [`Updated ${configPath}`]),
        "",
        "Next:",
        "  drwn write --dry-run",
      ].join("\n") + "\n",
    );
    return 0;
  }

  private async resolveGuidedQuery() {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
      return undefined;
    }
    const rl = createInterface({ input, output });
    try {
      return (await rl.question("Skill name or search query: ")).trim() || undefined;
    } finally {
      rl.close();
    }
  }
}
