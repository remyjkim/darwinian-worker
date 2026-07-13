// ABOUTME: Implements drwn store export for creating read-only store archives.
// ABOUTME: Archives ~/.agents/drwn for transfer or inspection.

import { Option } from "clipanion";
import { DrwnError } from "../../core/errors";
import { BaseCommand } from "../base";

export class StoreExportCommand extends BaseCommand {
  static override paths = [["store", "export"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Export the local drwn store as a tar archive.",
    details: `
      Writes a tar archive containing the local ~/.agents/drwn store. The
      archive can be mounted or unpacked read-only for validation workflows.
    `,
    examples: [["Export the store", "drwn store export --out /tmp/drwn-store.tar"]],
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
