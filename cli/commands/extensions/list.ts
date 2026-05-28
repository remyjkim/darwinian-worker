// ABOUTME: Implements bgng extensions list for discovering supported extension families.
// ABOUTME: Presents typed extension metadata without running external tools.

import { Option } from "clipanion";
import { listExtensions } from "../../core/extensions/registry";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";

export class ExtensionsListCommand extends BaseCommand {
  static override paths = [["extensions", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Extensions",
    description: "List supported extension families.",
    details: `
      Lists the extension families registered in bgng. This command is
      read-only and does not inspect project state or external CLI availability.
    `,
    examples: [
      ["List supported extensions", "bgng extensions list"],
      ["List supported extensions as JSON", "bgng extensions list --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const extensions = listExtensions();

    if (this.json) {
      this.context.stdout.write(renderJson(extensions));
      return 0;
    }

    this.context.stdout.write(
      renderTable(
        ["id", "name", "scopes", "modes"],
        extensions.map((extension) => [
          extension.id,
          extension.displayName,
          extension.scopes.join(","),
          extension.defaultModes.join(","),
        ]),
      ),
    );
    return 0;
  }
}
