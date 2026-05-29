// ABOUTME: Implements `drwn card outdated` for project card version checks.
// ABOUTME: Provides a --check mode suitable for CI gates.

import { Option } from "clipanion";
import { findOutdatedProjectCards } from "../../core/card-project";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "./project-command";

export class CardOutdatedCommand extends BaseCommand {
  static override paths = [["card", "outdated"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Report project cards with newer local versions available.",
    details: `
      Refreshes the project lockfile, compares locked versions to the latest
      local versions, and optionally exits non-zero with --check.
    `,
    examples: [
      ["Show outdated cards", "drwn card outdated"],
      ["Fail when updates are available", "drwn card outdated --check"],
    ],
  });

  check = Option.Boolean("--check", false, {
    description: "Exit non-zero when any project card is outdated.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const outdated = await findOutdatedProjectCards(requireProjectRoot(this), this.context.agentsDir);
    if (this.json) {
      this.context.stdout.write(renderJson({ outdated }));
    } else if (outdated.length === 0) {
      this.context.stdout.write("No outdated cards.\n");
    } else {
      this.context.stdout.write(
        renderTable(
          ["name", "current", "latest"],
          outdated.map((entry) => [entry.name, entry.current, entry.latest]),
        ),
      );
    }
    return this.check && outdated.length > 0 ? 1 : 0;
  }
}
