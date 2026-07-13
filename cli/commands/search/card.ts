// ABOUTME: Implements drwn search card across registered Git-backed card catalogs.
// ABOUTME: Keeps card discovery separate from skill and MCP search surfaces.

import { Option } from "clipanion";
import { searchCardCatalogs } from "../../core/card-catalog";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";

export class SearchCardCommand extends BaseCommand {
  static override paths = [["search", "card"]];

  static override usage = BaseCommand.Usage({
    category: "Search",
    description: "Search registered card catalogs.",
    details: `
      Searches catalog.json entries in registered Git-backed card catalogs.
      Catalogs must be registered locally (drwn catalog add) before
      their cards appear in results. Use --scope to limit results to a single
      catalog scope.
    `,
    examples: [
      ["Search cards by name", "drwn search card backend"],
      ["Limit to a scope", "drwn search card backend --scope @team"],
      ["Search cards as JSON", "drwn search card backend --json"],
    ],
  });

  query = Option.String({ required: true });

  scope = Option.String("--scope", {
    description: "Limit search to a single catalog scope (e.g. @team).",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const result = await searchCardCatalogs(this.context.agentsDir, this.query, {
      scope: this.scope,
    });
    if (this.json) {
      this.context.stdout.write(renderJson(result));
    } else {
      this.context.stdout.write(
        renderTable(
          ["scope", "name", "url", "description"],
          result.results.map((card) => [
            card.scope,
            card.name,
            card.url,
            card.description ?? "",
          ]),
        ),
      );
      for (const warning of result.warnings) {
        this.context.stderr.write(`warning: ${warning}\n`);
      }
    }
    return 0;
  }
}
