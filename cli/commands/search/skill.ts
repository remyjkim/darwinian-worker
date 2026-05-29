// ABOUTME: Implements `drwn search skill` across local library and configured catalogs.
// ABOUTME: Labels sources clearly so users distinguish owned inventory from online discovery.

import { Option, UsageError } from "clipanion";
import { loadConfig } from "../../core/config";
import { renderJson } from "../../core/output";
import { searchSkills } from "../../core/search";
import { BaseCommand } from "../base";

function renderSearchResults(results: Awaited<ReturnType<typeof searchSkills>>, query: string) {
  const local = results.results.filter((item) => item.sourceGroup === "library");
  const catalog = results.results.filter((item) => item.sourceGroup === "catalog");
  const sections: string[] = [];

  sections.push("Local library");
  sections.push(...(local.length > 0 ? local.map((item, index) => `${index + 1}. ${item.id} (${item.kind})`) : ["  No matches."]));
  sections.push("");
  sections.push("Online catalogs");
  sections.push(...(catalog.length > 0 ? catalog.map((item, index) => `${index + 1}. ${item.id} (${item.kind})`) : ["  No matches."]));
  if (results.warnings.length > 0) {
    sections.push("");
    sections.push("Warnings");
    sections.push(...results.warnings.map((warning) => `- ${warning}`));
  }
  sections.push("");
  sections.push(`Query: ${query}`);
  return `${sections.join("\n")}\n`;
}

export class SearchSkillCommand extends BaseCommand {
  static override paths = [["search", "skill"]];

  static override usage = BaseCommand.Usage({
    category: "Search",
    description: "Search local and configured catalog skills.",
    details: `
      Searches the local skill library and configured npm-skill catalogs. Use
      --library or --catalog to restrict the source; those flags are mutually
      exclusive.

      Results are grouped by source so operators can distinguish owned local
      inventory from online catalog discovery.
    `,
    examples: [
      ["Search all skill sources", "drwn search skill debug"],
      ["Search only configured catalogs", "drwn search skill brainstorm --catalog"],
      ["Return JSON results", "drwn search skill research --json"],
    ],
  });

  query = Option.String({ required: true });

  libraryOnly = Option.Boolean("--library", false, {
    description: "Only search the local library.",
  });

  catalogOnly = Option.Boolean("--catalog", false, {
    description: "Only search configured online catalogs.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    if (this.libraryOnly && this.catalogOnly) {
      throw new UsageError("Use either --library or --catalog, not both.");
    }

    const result = await searchSkills({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      config: await loadConfig(this.context.repoRoot),
      query: this.query,
      libraryOnly: this.libraryOnly,
      catalogOnly: this.catalogOnly,
    });

    this.context.stdout.write(this.json ? renderJson(result) : renderSearchResults(result, this.query));
    return 0;
  }
}
