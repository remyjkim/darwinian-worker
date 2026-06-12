// ABOUTME: Implements card catalog management under drwn library catalog.
// ABOUTME: Registers Git-backed catalogs used by drwn search card.

import { Option } from "clipanion";
import {
  addCardCatalog,
  loadCardCatalogIndex,
  refreshCardCatalog,
  removeCardCatalog,
} from "../../core/card-catalog";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";

export class LibraryCatalogListCommand extends BaseCommand {
  static override paths = [["library", "catalog", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "List registered card catalogs.",
    details: `
      Lists Git-backed card catalogs registered for card discovery. Each entry
      shows the catalog scope (e.g. @team), the source Git URL, the cached
      card count, and the last time the local clone was refreshed.
    `,
    examples: [["List card catalogs", "drwn library catalog list --json"]],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const index = await loadCardCatalogIndex(this.context.agentsDir);
    if (this.json) {
      this.context.stdout.write(renderJson(index));
    } else {
      this.context.stdout.write(
        renderTable(
          ["scope", "url", "cards", "lastFetched"],
          index.catalogs.map((entry) => [
            entry.scope,
            entry.url,
            String(entry.cardCount),
            entry.lastFetched,
          ]),
        ),
      );
    }
    return 0;
  }
}

export class LibraryCatalogAddCommand extends BaseCommand {
  static override paths = [["library", "catalog", "add"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Register and clone a card catalog by URL.",
    details: `
      Clones a Git catalog repo locally, reads its catalog.json to discover the
      catalog scope, and records the registration in ~/.agents/drwn/catalogs.json.
      The scope is taken from the catalog manifest; collisions across scopes are
      refused.
    `,
    examples: [
      [
        "Add a card catalog",
        "drwn library catalog add file:///tmp/cards-catalog.git",
      ],
    ],
  });

  url = Option.String({ required: true });

  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false, {
    description: "Register the catalog even when trustedSources.strict would reject its URL.",
  });

  async execute() {
    if (this.allowUntrustedSource) {
      this.context.stderr.write(`Warning: --allow-untrusted-source used for catalog ${this.url}\n`);
    }
    const entry = await addCardCatalog(this.context.agentsDir, this.url, {
      allowUntrustedSource: this.allowUntrustedSource,
      repoRoot: this.context.repoRoot,
      cwd: this.context.cwd,
    });
    this.context.stdout.write(
      `Added card catalog ${entry.scope} from ${entry.url} (${entry.cardCount} cards)\n`,
    );
    return 0;
  }
}

export class LibraryCatalogRemoveCommand extends BaseCommand {
  static override paths = [["library", "catalog", "remove"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Remove a registered card catalog by scope or URL.",
    details: `
      Removes a catalog registration and its local clone. Accepts either the
      scope (e.g. @team) or the URL that was used to register the catalog.
    `,
    examples: [
      ["Remove by scope", "drwn library catalog remove @team"],
      ["Remove by URL", "drwn library catalog remove https://example.com/catalog.git"],
    ],
  });

  scopeOrUrl = Option.String({ required: true });

  async execute() {
    await removeCardCatalog(this.context.agentsDir, this.scopeOrUrl);
    this.context.stdout.write(`Removed card catalog ${this.scopeOrUrl}\n`);
    return 0;
  }
}

export class LibraryCatalogRefreshCommand extends BaseCommand {
  static override paths = [["library", "catalog", "refresh"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Refresh registered card catalogs from their remotes.",
    details: `
      Runs git fetch against every registered catalog clone (or just the one
      matching the optional scope filter) and refreshes the cached card count
      and lastFetched timestamp in catalogs.json.
    `,
    examples: [
      ["Refresh every catalog", "drwn library catalog refresh"],
      ["Refresh one scope", "drwn library catalog refresh @team"],
    ],
  });

  scope = Option.String({ required: false });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const result = await refreshCardCatalog(this.context.agentsDir, this.scope);
    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return result.warnings.length > 0 ? 1 : 0;
    }
    for (const entry of result.refreshed) {
      this.context.stdout.write(
        `Refreshed ${entry.scope} (${entry.cardCount} cards, ${entry.lastFetched})\n`,
      );
    }
    for (const warning of result.warnings) {
      this.context.stderr.write(`warning: ${warning}\n`);
    }
    return result.warnings.length > 0 ? 1 : 0;
  }
}
