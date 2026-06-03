// ABOUTME: Implements `drwn card source set` for semantic source manifest edits.
// ABOUTME: Updates common card.json fields without requiring manual JSON edits.

import { Option } from "clipanion";
import { patchCardSourceManifest } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class CardSourceSetCommand extends BaseCommand {
  static override paths = [["card", "source", "set"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Set common fields in an editable card source manifest.",
    details: `
      Semantically updates selected card.json fields for a local source under
      ~/.agents/drwn/sources. Supported fields include version, description,
      license, harness.minVersion, and Wave 2 quality fields surfaced by
      drwn card show.
    `,
    examples: [
      ["Set description and version", "drwn card source set @me/backend --description \"Backend baseline\" --version 1.2.0"],
      ["Preview quality fields", "drwn card source set @me/backend --stability stable --last-validated-with 0.1.0 --dry-run --json"],
    ],
  });

  cardName = Option.String({ required: true });

  description = Option.String("--description", {
    description: "Set card.json description.",
  });

  version = Option.String("--version", {
    description: "Set card.json version.",
  });

  license = Option.String("--license", {
    description: "Set card.json license.",
  });

  harnessMinVersion = Option.String("--harness-min-version", {
    description: "Set card.json harness.minVersion.",
  });

  stability = Option.String("--stability", {
    description: "Set card.json stability.",
  });

  lastValidatedWith = Option.String("--last-validated-with", {
    description: "Set card.json lastValidatedWith.",
  });

  testStatusBadge = Option.String("--test-status-badge", {
    description: "Set card.json testStatusBadge.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview source changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    let result;
    try {
      result = await patchCardSourceManifest({
        agentsDir: this.context.agentsDir,
        cardName: this.cardName,
        patch: {
          description: this.description,
          version: this.version,
          license: this.license,
          harnessMinVersion: this.harnessMinVersion,
          stability: this.stability,
          lastValidatedWith: this.lastValidatedWith,
          testStatusBadge: this.testStatusBadge,
        },
        dryRun: this.dryRun,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return 0;
    }
    this.context.stdout.write(`${this.dryRun ? "Would update" : "Updated"} ${this.cardName} card.json\n`);
    return 0;
  }
}
