// ABOUTME: Implements the `agents skills sync` command using the extracted skill sync core.
// ABOUTME: Applies current curated state downstream while preserving safe-by-default stale-link reporting.

import { Option } from "clipanion";
import { renderJson, renderSyncResult } from "../../../cli/core/output";
import { normalizeSyncPathOptions } from "../../../cli/core/paths";
import { syncSkills } from "../../../cli/core/skills";
import { BaseCommand } from "../base";

export class SkillsSyncCommand extends BaseCommand {
  static override paths = [["skills", "sync"]];

  static override usage = BaseCommand.Usage({
    category: "Skills",
    description: "Sync curated skills into downstream tool directories.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const result = await syncSkills(
      normalizeSyncPathOptions(
        {
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
          homeDir: this.context.homeDir,
          dryRun: this.dryRun,
        },
        import.meta.path,
      ),
    );

    this.context.stdout.write(this.json ? renderJson(result) : renderSyncResult(result));
    return 0;
  }
}
