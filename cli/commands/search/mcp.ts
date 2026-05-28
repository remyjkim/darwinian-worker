// ABOUTME: Implements `bgng search mcp` across local registry and trusted MCP catalogs.
// ABOUTME: Avoids arbitrary MCP package inference by using explicit configured sources.

import { Option, UsageError } from "clipanion";
import { loadConfig } from "../../core/config";
import { renderJson } from "../../core/output";
import { searchMcp } from "../../core/search";
import { BaseCommand } from "../base";

function renderSearchResults(results: Awaited<ReturnType<typeof searchMcp>>, query: string) {
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

export class SearchMcpCommand extends BaseCommand {
  static override paths = [["search", "mcp"]];

  static override usage = BaseCommand.Usage({
    category: "Search",
    description: "Search local and configured catalog MCP servers.",
    details: `
      Searches the local MCP library and configured trusted MCP catalogs. Use
      --library or --catalog to restrict the source; those flags are mutually
      exclusive.

      Results are grouped by source so operators can distinguish owned local
      inventory from online catalog discovery.
    `,
    examples: [
      ["Search all MCP sources", "bgng search mcp github"],
      ["Search only the local MCP library", "bgng search mcp github --library"],
      ["Return JSON results", "bgng search mcp postgres --json"],
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

    const result = await searchMcp({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      config: await loadConfig(this.context.repoRoot),
      query: this.query,
      libraryOnly: this.libraryOnly,
      catalogOnly: this.catalogOnly,
    });

    this.context.stdout.write(this.json ? renderJson(result) : renderSearchResults(result, this.query));
    return 0;
  }
}
