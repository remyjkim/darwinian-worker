// ABOUTME: Implements bgng store migrate for explicit pre-cards layout migration.
// ABOUTME: Keeps migration reportable and non-silent for operator confidence.

import { Option } from "clipanion";
import { cleanupLegacyOrphans, detectLegacyLayout, migrateStore } from "../../core/migration";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class StoreMigrateCommand extends BaseCommand {
  static override paths = [["store", "migrate"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Migrate the pre-cards layout to the cards-era store.",
    details: `
      Builds a staging store, validates it, archives the old layout, then
      activates the new ~/.agents/bgng store. The migration is explicit and
      recoverable; ordinary bgng commands only warn when a legacy layout exists.
    `,
    examples: [
      ["Migrate the store", "bgng store migrate"],
      ["Migrate as JSON", "bgng store migrate --json"],
      ["Migrate and request orphan cleanup", "bgng store migrate --cleanup-legacy-orphans"],
    ],
  });

  cleanupLegacyOrphans = Option.Boolean("--cleanup-legacy-orphans", false, {
    description: "After migration, scan for bgng-owned legacy orphan symlinks.",
  });

  yes = Option.Boolean("--yes", false, {
    description: "Skip confirmation prompts where cleanup supports prompts.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    if (!detectLegacyLayout(this.context.agentsDir)) {
      const result = { archivedTo: "", stagingPath: "", steps: ["no legacy layout detected"], warnings: [] as string[] };
      if (this.json) {
        this.context.stdout.write(renderJson(result));
      } else {
        this.context.stdout.write("No legacy layout detected; nothing to migrate.\n");
      }
      return 0;
    }

    const result = await migrateStore({
      agentsDir: this.context.agentsDir,
      cleanupLegacyOrphans: this.cleanupLegacyOrphans,
      yes: this.yes,
    });
    if (this.cleanupLegacyOrphans) {
      const cleanup = await cleanupLegacyOrphans({
        homeDir: this.context.homeDir,
        agentsDir: this.context.agentsDir,
        archivePath: result.archivedTo,
      });
      result.steps.push(...cleanup.removed.map((path) => `removed ${path}`));
      result.warnings.push(...cleanup.warnings);
    }

    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return 0;
    }
    this.context.stdout.write(
      [
        "Migration complete.",
        `Archived to ${result.archivedTo}`,
        ...result.steps.map((step) => `- ${step}`),
        ...result.warnings.map((warning) => `WARNING: ${warning}`),
      ].join("\n") + "\n",
    );
    return 0;
  }
}
