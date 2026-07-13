// ABOUTME: Preserves the store export command as a fail-closed security boundary.
// ABOUTME: Refuses whole-store archives because the store contains credentials and operational state.

import { Option } from "clipanion";
import { DrwnError } from "../../core/errors";
import { BaseCommand } from "../base";

export class StoreExportCommand extends BaseCommand {
  static override paths = [["store", "export"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Report that unsafe whole-store export is disabled.",
    details: `
      Whole-store export is disabled because ~/.agents/drwn can contain
      credentials and operational state. There is no unrestricted override.
      Portable inventory export is tracked as a separate, allowlisted format.
    `,
    examples: [["Confirm the safety boundary", "drwn store export --out /tmp/drwn-store.tar"]],
  });

  out = Option.String("--out", { required: true, description: "Output tar archive path." });

  async execute() {
    const error = new DrwnError(
      "STORE_EXPORT_DISABLED_UNSAFE",
      "Whole-store export is disabled because it can include credentials and operational state.",
      ["Portable inventory export is tracked separately; no unrestricted override is available."],
    );
    this.context.stderr.write(`${error.code}: ${error.message}\n${error.hints?.join("\n")}\n`);
    return 1;
  }
}
